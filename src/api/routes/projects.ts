import path from "node:path";
import { Router } from "express";
import type Database from "better-sqlite3";
import { findAllActive, findAllActivePaged, findById } from "../../database/repositories/projectRepository.js";
import {
  findAllActive as findAllFiles,
  countActiveGroupedByProject,
} from "../../database/repositories/audioFileRepository.js";
import { getExcludedPaths } from "../../database/repositories/scanExclusionRepository.js";
import { buildFolderTree } from "../../scanner/folderTree.js";
import { walkDirectory } from "../../scanner/walk.js";
import { classifyFolders } from "../../scanner/dawDetector.js";
import { collectSampleFiles, findDuplicateMatches } from "../../scanner/duplicateDetector.js";
import { getScanSettings } from "../../config/scanSettings.js";
import { asyncHandler } from "../asyncHandler.js";
import { parsePositiveInt, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../pagination.js";

export function createProjectsRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { search, page, pageSize } = req.query;
      const pageNum = parsePositiveInt(page, 1);
      const pageSizeNum = parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

      const { items, total } = findAllActivePaged(db, {
        search: typeof search === "string" ? search : undefined,
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
      // actually on disk right now. walkDirectory/shouldIgnoreDir already skip
      // Backup/Samples folders (per current scan settings), node_modules, dot-dirs,
      // etc. — same rules the scanner uses.
      const scanSettings = getScanSettings(db);
      const [subfolderTree, { files, directories }] = await Promise.all([
        buildFolderTree(project.path, { includeFiles: true, ignoreDirOptions: scanSettings }),
        walkDirectory(project.path, new Set(), scanSettings),
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
