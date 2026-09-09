import path from "node:path";
import { Router } from "express";
import type Database from "better-sqlite3";
import {
  findAllActive,
  findAllActivePaged,
  findById,
  updateStatus,
  setTags,
  setScore,
  setScoreForProjects,
  addTagsToProjects,
  filterExistingProjectIds,
} from "../../database/repositories/projectRepository.js";
import {
  findAllActive as findAllFiles,
  countActiveGroupedByProject,
} from "../../database/repositories/audioFileRepository.js";
import { getExcludedPaths } from "../../database/repositories/scanExclusionRepository.js";
import { cascadeProjectScoreToFiles, cascadeProjectTagsToFiles } from "../../database/repositories/linkSync.js";
import { buildFolderTree } from "../../scanner/folderTree.js";
import { walkDirectory } from "../../scanner/walk.js";
import { classifyFolders } from "../../scanner/dawDetector.js";
import { collectSampleFiles, findDuplicateMatches } from "../../scanner/duplicateDetector.js";
import { getScanSettings } from "../../config/scanSettings.js";
import { ALL_TRACK_STATUSES, type TrackStatus } from "../../models/AudioFile.js";
import { isValidScore, parseScoreListQueryParam } from "../../models/Score.js";
import { asyncHandler } from "../asyncHandler.js";
import { toStringArray } from "../queryParams.js";
import { parsePositiveInt, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../pagination.js";

function parseIdsBody(body: unknown): string[] | undefined {
  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return undefined;
  }
  return ids;
}

export function createProjectsRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { search, status, score, tag, sortBy, sortDir, page, pageSize } = req.query;
      const pageNum = parsePositiveInt(page, 1);
      const pageSizeNum = parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

      const statuses = toStringArray(status).filter((s): s is TrackStatus =>
        ALL_TRACK_STATUSES.includes(s as TrackStatus)
      );
      const tags = toStringArray(tag);

      const { items, total } = findAllActivePaged(db, {
        search: typeof search === "string" ? search : undefined,
        statuses: statuses.length > 0 ? statuses : undefined,
        scores: parseScoreListQueryParam(toStringArray(score)),
        tags: tags.length > 0 ? tags : undefined,
        sortBy: sortBy as "name" | "modifiedAt" | undefined,
        sortDir: sortDir as "asc" | "desc" | undefined,
        limit: pageSizeNum,
        offset: (pageNum - 1) * pageSizeNum,
      });

      const countsByProject = countActiveGroupedByProject(db);
      res.json({
        projects: items.map((project) => ({
          ...project,
          audioFileCount: countsByProject.get(project.id) ?? 0,
        })),
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.max(1, Math.ceil(total / pageSizeNum)),
      });
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const project = findById(db, id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const audioFiles = findAllFiles(db, { projectId: id });

      // Live filesystem read (not DB-driven) so the panel always reflects what's
      // actually on disk right now. excludeSamplesFolders only controls what gets
      // indexed into audio_files (so the Files tab isn't polluted with imported
      // samples) — the Contents browser here should still show a project's Samples
      // folder and everything inside it. Backup folders still follow the setting,
      // same as the rest of the scanner.
      const scanSettings = getScanSettings(db);
      const contentsIgnoreOptions = { ...scanSettings, excludeSamplesFolders: false };
      const [subfolderTree, { files, directories }] = await Promise.all([
        buildFolderTree(project.path, { includeFiles: true, ignoreDirOptions: contentsIgnoreOptions }),
        walkDirectory(project.path, new Set(), contentsIgnoreOptions),
      ]);

      const classifications = classifyFolders(files, directories);
      const dawProjectFiles = [...classifications.values()]
        .filter((c) => c.markerPath !== null)
        .map((c) => ({
          dawType: c.dawType,
          path: c.markerPath!,
          relativePath: path.relative(project.path, c.markerPath!),
          detectedVia: c.detectedVia,
        }));

      res.json({ ...project, audioFiles, subfolderTree, dawProjectFiles });
    })
  );

  // Registered before /:id/* so "batch" is never captured as an :id value.
  router.patch(
    "/batch/score",
    asyncHandler(async (req, res) => {
      const ids = parseIdsBody(req.body);
      const { score } = req.body as { score: number | null };
      if (!ids) {
        res.status(400).json({ error: "ids must be a non-empty array of strings" });
        return;
      }
      if (!isValidScore(score)) {
        res.status(400).json({ error: "score must be an integer from 1 to 5, or null" });
        return;
      }
      const knownIds = filterExistingProjectIds(db, ids);
      setScoreForProjects(db, knownIds, score);
      for (const id of knownIds) cascadeProjectScoreToFiles(db, id, score);
      res.json({ updated: knownIds.length });
    })
  );

  router.patch(
    "/batch/tags",
    asyncHandler(async (req, res) => {
      const ids = parseIdsBody(req.body);
      const { tags } = req.body as { tags: string[] };
      if (!ids) {
        res.status(400).json({ error: "ids must be a non-empty array of strings" });
        return;
      }
      if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
        res.status(400).json({ error: "tags must be an array of strings" });
        return;
      }
      const knownIds = filterExistingProjectIds(db, ids);
      addTagsToProjects(db, knownIds, tags);
      for (const id of knownIds) cascadeProjectTagsToFiles(db, id, tags);
      res.json({ updated: knownIds.length });
    })
  );

  router.patch(
    "/:id/status",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const { status } = req.body as { status: TrackStatus };
      if (!ALL_TRACK_STATUSES.includes(status)) {
        res.status(400).json({ error: `status must be one of ${ALL_TRACK_STATUSES.join(", ")}` });
        return;
      }
      if (!findById(db, id)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      updateStatus(db, id, status);
      res.json(findById(db, id));
    })
  );

  router.patch(
    "/:id/tags",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const { tags } = req.body as { tags: string[] };
      if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
        res.status(400).json({ error: "tags must be an array of strings" });
        return;
      }
      if (!findById(db, id)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      setTags(db, id, tags);
      cascadeProjectTagsToFiles(db, id, tags);
      res.json(findById(db, id));
    })
  );

  router.patch(
    "/:id/score",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const { score } = req.body as { score: number | null };
      if (!isValidScore(score)) {
        res.status(400).json({ error: "score must be an integer from 1 to 5, or null" });
        return;
      }
      if (!findById(db, id)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      setScore(db, id, score);
      cascadeProjectScoreToFiles(db, id, score);
      res.json(findById(db, id));
    })
  );

  router.get(
    "/:id/duplicates",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const project = findById(db, id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      // Only a recognized DAW project can be a "duplicate" — plain container folders
      // (which also get rows in `projects`) have no DAW type and are never compared.
      if (!project.dawType) {
        res.json({ projectId: id, sampleCount: 0, matches: [] });
        return;
      }

      // Only compare against projects currently in the scan list — active (non-removed),
      // not nested under a user-configured scan exclusion, and made with the same DAW.
      const excludedPaths = getExcludedPaths(db);
      const isExcluded = (projectId: string) =>
        excludedPaths.some((ex) => projectId === ex || projectId.startsWith(`${ex}${path.sep}`));
      const candidateProjects = findAllActive(db).filter(
        (p) => p.id !== id && p.dawType === project.dawType && !isExcluded(p.id)
      );

      const [targetSamples, candidates] = await Promise.all([
        collectSampleFiles(project.path),
        Promise.all(
          candidateProjects.map(async (p) => ({ project: p, samples: await collectSampleFiles(p.path) }))
        ),
      ]);

      const matches = findDuplicateMatches(targetSamples, project, candidates);
      res.json({ projectId: id, sampleCount: targetSamples.length, matches });
    })
  );

  return router;
}
