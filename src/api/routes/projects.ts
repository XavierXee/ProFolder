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
  markRemoved as markProjectsRemoved,
} from "../../database/repositories/projectRepository.js";
import {
  findAllActive as findAllFiles,
  countActiveGroupedByProject,
  markRemoved as markFilesRemoved,
} from "../../database/repositories/audioFileRepository.js";
import { moveProjectSubtree, cloneProjectSubtree } from "../../database/repositories/subtreeRekey.js";
import { getExcludedPaths } from "../../database/repositories/scanExclusionRepository.js";
import { cascadeProjectScoreToFiles, cascadeProjectTagsToFiles } from "../../database/repositories/linkSync.js";
import { buildFolderTree } from "../../scanner/folderTree.js";
import { walkDirectory } from "../../scanner/walk.js";
import { classifyFolders } from "../../scanner/dawDetector.js";
import { collectSampleFiles, countUniqueSamples, findDuplicateMatches } from "../../scanner/duplicateDetector.js";
import { getScanSettings } from "../../config/scanSettings.js";
import { type TrackStatus } from "../../models/AudioFile.js";
import { isKnownStatusKey } from "../../database/repositories/statusRepository.js";
import { isValidScore, parseScoreListQueryParam } from "../../models/Score.js";
import { asyncHandler } from "../asyncHandler.js";
import { toStringArray } from "../queryParams.js";
import { parsePositiveInt, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../pagination.js";
import { getEffectiveMusicRoot } from "../../config/musicRoot.js";
import {
  NodeFileOpsService,
  PathOutsideRootError as FileOpsPathOutsideRootError,
  NameConflictError,
} from "../../services/FileOpsService.js";
import { MacTrashService, PathOutsideRootError as TrashPathOutsideRootError } from "../../services/TrashService.js";

function parseIdsBody(body: unknown): string[] | undefined {
  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return undefined;
  }
  return ids;
}

function parseDestDir(body: unknown): string | undefined {
  const destDir = (body as { destDir?: unknown })?.destDir;
  return typeof destDir === "string" && destDir.length > 0 ? destDir : undefined;
}

/** Literal (non-LIKE-wildcard) "is this id the prefix itself, or nested under it" check
 * — mirrors `isSelfOrDescendant` in `subtreeRekey.ts` (duplicated here rather than
 * imported/exported, since that module is DB-rekey-only and this is route-local id
 * filtering over already-loaded rows; see that module's doc comment for why plain
 * substring matching, not SQL LIKE, is required here). */
function isSelfOrDescendant(value: string, prefix: string): boolean {
  return value === prefix || value.startsWith(`${prefix}${path.sep}`);
}

/** Every project id (the target itself plus every nested sub-project) and every audio
 * file id that lives anywhere inside `projectId`'s folder subtree — the same subtree a
 * copy/move/delete of this project affects as a whole. Must be read BEFORE a move/delete
 * physically or logically relocates/removes those rows, since a completed move rekeys
 * (and a completed delete soft-removes but does not rename) these same ids. */
function findSubtreeIds(db: Database.Database, projectId: string): { projectIds: string[]; fileIds: string[] } {
  const projectIds = findAllActive(db)
    .filter((p) => isSelfOrDescendant(p.id, projectId))
    .map((p) => p.id);
  const fileIds = findAllFiles(db)
    .filter((f) => isSelfOrDescendant(f.id, projectId))
    .map((f) => f.id);
  return { projectIds, fileIds };
}

export function createProjectsRouter(db: Database.Database): Router {
  const router = Router();

  // Takes a provider function rather than a fixed root, since the configured music root
  // can change at runtime — same pattern as `server.ts`'s own instantiation of these
  // services for other routers. Instantiated here (rather than accepted as constructor
  // params threaded through from `server.ts`) so this task doesn't need to touch
  // `server.ts`'s wiring — a sibling task wires the equivalent services into
  // `files.ts` concurrently, and changing `createProjectsRouter`'s signature would mean
  // both tasks editing `server.ts`'s call sites, a real collision risk for no benefit
  // (these services are cheap, stateless wrappers around a root-provider closure).
  const fileOpsService = new NodeFileOpsService(() => getEffectiveMusicRoot(db));
  const trashService = new MacTrashService(() => getEffectiveMusicRoot(db));

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { search, status, score, tag, sortBy, sortDir, page, pageSize } = req.query;
      const pageNum = parsePositiveInt(page, 1);
      const pageSizeNum = parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

      const statuses = toStringArray(status).filter((s) => isKnownStatusKey(db, s));
      const tags = toStringArray(tag);

      const { items, total } = findAllActivePaged(db, {
        search: typeof search === "string" ? search : undefined,
        statuses: statuses.length > 0 ? statuses : undefined,
        scores: parseScoreListQueryParam(toStringArray(score)),
        tags: tags.length > 0 ? tags : undefined,
        sortBy: sortBy as "name" | "modifiedAt" | "score" | "status" | "type" | "tags" | "audioFileCount" | undefined,
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

  // Registered before /:id/* for the same reason as /batch/score and /batch/tags above.
  // Best-effort, per-item: one project's copy/move/delete failing (unknown id, path
  // outside root, name collision, filesystem error) never aborts the others already
  // processed or still queued, and each failure's own message is preserved (matching
  // this feature's richer batch-error-detail requirement, since filesystem operations
  // need more than a boolean per item to be actionable).
  router.post(
    "/batch/copy",
    asyncHandler(async (req, res) => {
      const ids = parseIdsBody(req.body);
      const destDir = parseDestDir(req.body);
      if (!ids) {
        res.status(400).json({ error: "ids must be a non-empty array of strings" });
        return;
      }
      if (!destDir) {
        res.status(400).json({ error: "destDir is required" });
        return;
      }

      const succeeded: string[] = [];
      const failed: { id: string; error: string }[] = [];
      for (const id of ids) {
        const project = findById(db, id);
        if (!project) {
          failed.push({ id, error: "Project not found" });
          continue;
        }
        try {
          const { newAbsolutePath } = await fileOpsService.copyPath(project.path, destDir);
          cloneProjectSubtree(db, id, newAbsolutePath, getEffectiveMusicRoot(db));
          succeeded.push(id);
        } catch (err) {
          failed.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      res.json({ succeeded, failed });
    })
  );

  router.post(
    "/batch/move",
    asyncHandler(async (req, res) => {
      const ids = parseIdsBody(req.body);
      const destDir = parseDestDir(req.body);
      if (!ids) {
        res.status(400).json({ error: "ids must be a non-empty array of strings" });
        return;
      }
      if (!destDir) {
        res.status(400).json({ error: "destDir is required" });
        return;
      }

      const succeeded: string[] = [];
      const failed: { id: string; error: string }[] = [];
      for (const id of ids) {
        const project = findById(db, id);
        if (!project) {
          failed.push({ id, error: "Project not found" });
          continue;
        }
        try {
          const { newAbsolutePath } = await fileOpsService.movePath(project.path, destDir);
          try {
            moveProjectSubtree(db, id, newAbsolutePath, getEffectiveMusicRoot(db));
          } catch (dbError) {
            // See the single-item POST /:id/move handler's comment for the full
            // rationale: the physical move already happened, so this item's failure
            // message says so explicitly rather than reading like nothing happened.
            throw new Error(
              `Project "${id}" was physically moved to "${newAbsolutePath}" but updating the database failed — ` +
                `the library index is now out of sync with the filesystem for this project's whole subtree. ` +
                `Manual reconciliation (or a rescan) is required. Underlying error: ${(dbError as Error).message}`
            );
          }
          succeeded.push(id);
        } catch (err) {
          failed.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      res.json({ succeeded, failed });
    })
  );

  router.delete(
    "/batch",
    asyncHandler(async (req, res) => {
      const ids = parseIdsBody(req.body);
      if (!ids) {
        res.status(400).json({ error: "ids must be a non-empty array of strings" });
        return;
      }

      const succeeded: string[] = [];
      const failed: { id: string; error: string }[] = [];
      for (const id of ids) {
        const project = findById(db, id);
        if (!project) {
          failed.push({ id, error: "Project not found" });
          continue;
        }
        try {
          await trashService.trash([project.path]);
          const nowIso = new Date().toISOString();
          const { projectIds, fileIds } = findSubtreeIds(db, id);
          markProjectsRemoved(db, projectIds, nowIso);
          markFilesRemoved(db, fileIds, nowIso);
          succeeded.push(id);
        } catch (err) {
          failed.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      res.json({ succeeded, failed });
    })
  );

  router.patch(
    "/:id/status",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const { status } = req.body as { status: TrackStatus };
      if (typeof status !== "string" || !isKnownStatusKey(db, status)) {
        res.status(400).json({ error: `status must be a known status key (got "${status}")` });
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

  router.post(
    "/:id/copy",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const project = findById(db, id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const destDir = parseDestDir(req.body);
      if (!destDir) {
        res.status(400).json({ error: "destDir is required" });
        return;
      }

      let newAbsolutePath: string;
      try {
        ({ newAbsolutePath } = await fileOpsService.copyPath(project.path, destDir));
      } catch (err) {
        if (err instanceof FileOpsPathOutsideRootError) {
          res.status(400).json({ error: err.message });
          return;
        }
        // Defensive: copyPath auto-renames Finder-style on a filesystem name collision
        // rather than throwing, so this should be rare/unreachable in practice — kept
        // for symmetry with movePath's own handling and in case that behavior ever
        // changes.
        if (err instanceof NameConflictError) {
          res.status(409).json({ error: err.message });
          return;
        }
        throw err;
      }

      // Computed from the PRE-clone rows (the old id's subtree) — cloneProjectSubtree
      // doesn't touch the source, so this could equally be computed after, but reading
      // it before keeps the "what does this id's subtree contain" question answered by
      // a single, obviously-consistent snapshot.
      const { projectIds, fileIds } = findSubtreeIds(db, id);

      const musicRoot = getEffectiveMusicRoot(db);
      cloneProjectSubtree(db, id, newAbsolutePath, musicRoot);

      const newId = path.relative(path.resolve(musicRoot), newAbsolutePath);
      res.status(201).json({
        project: findById(db, newId),
        clonedNestedProjectCount: projectIds.length - 1,
        clonedFileCount: fileIds.length,
      });
    })
  );

  router.post(
    "/:id/move",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const project = findById(db, id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const destDir = parseDestDir(req.body);
      if (!destDir) {
        res.status(400).json({ error: "destDir is required" });
        return;
      }

      let newAbsolutePath: string;
      try {
        ({ newAbsolutePath } = await fileOpsService.movePath(project.path, destDir));
      } catch (err) {
        if (err instanceof FileOpsPathOutsideRootError) {
          res.status(400).json({ error: err.message });
          return;
        }
        if (err instanceof NameConflictError) {
          res.status(409).json({ error: err.message });
          return;
        }
        throw err;
      }

      // Must be read BEFORE moveProjectSubtree, which rekeys these same ids in place —
      // reading it after would see the NEW ids, not the ones we need to report counts
      // against.
      const { projectIds, fileIds } = findSubtreeIds(db, id);

      const musicRoot = getEffectiveMusicRoot(db);
      try {
        moveProjectSubtree(db, id, newAbsolutePath, musicRoot);
      } catch (dbError) {
        // The physical folder move above already succeeded (fileOpsService.movePath
        // returned without throwing) by the time we get here — only the DB rekey that
        // follows it failed. That leaves a real inconsistency: the project's whole
        // subtree now physically lives at newAbsolutePath, but the DB still has every
        // affected row (this project, any nested sub-projects, all their files) pointed
        // at the old location. We deliberately do NOT attempt to automatically move the
        // folder back: an automatic "undo" move has the exact same failure surface as
        // the move that just succeeded (EXDEV, partial-copy, permission errors — see
        // FileOpsService.movePath's own rollback handling), so attempting one here could
        // itself fail and silently compound the inconsistency instead of resolving it.
        // Instead we fail loudly: rethrow a descriptive error naming the project id and
        // both paths. asyncHandler forwards this to the app's centralized error
        // middleware (server.ts), which logs it via console.error and returns it as a
        // 500 response body — so the inconsistency is surfaced to both the caller and
        // the server log rather than silently swallowed. A subsequent rescan will
        // eventually reconcile the DB to match the filesystem (treating the old location
        // as removed and the new one as freshly discovered), though status/tags/score on
        // the affected rows would not survive that path — manual DB reconciliation is
        // the only way to preserve them once this state is reached.
        throw new Error(
          `Project "${id}" was physically moved to "${newAbsolutePath}" but updating the database failed — ` +
            `the library index is now out of sync with the filesystem for this project's whole subtree. ` +
            `Manual reconciliation (or a rescan) is required. Underlying error: ${(dbError as Error).message}`
        );
      }

      const newId = path.relative(path.resolve(musicRoot), newAbsolutePath);
      res.json({
        project: findById(db, newId),
        movedNestedProjectCount: projectIds.length - 1,
        movedFileCount: fileIds.length,
      });
    })
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const project = findById(db, id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      try {
        await trashService.trash([project.path]);
      } catch (err) {
        if (err instanceof TrashPathOutsideRootError) {
          res.status(400).json({ error: err.message });
          return;
        }
        throw err;
      }

      // Mirrors the scanner's own removal-detection pass (scanner.ts marks a project's
      // row — and, separately, any file's row — removed once a scan no longer sees it),
      // but applied immediately rather than waiting for the next scan, and cascaded
      // explicitly to the whole subtree: the project itself, every nested sub-project,
      // and every audio file inside any of those. Without this, a deleted project's
      // formerly-contained files would keep is_removed = 0 (still "active") until the
      // next scan happens to notice they're gone.
      const nowIso = new Date().toISOString();
      const { projectIds, fileIds } = findSubtreeIds(db, id);
      markProjectsRemoved(db, projectIds, nowIso);
      markFilesRemoved(db, fileIds, nowIso);

      res.json({ removedProjectIds: projectIds, removedFileIds: fileIds });
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
      res.json({ projectId: id, sampleCount: countUniqueSamples(targetSamples), matches });
    })
  );

  return router;
}
