import { Router } from "express";
import type Database from "better-sqlite3";
import {
  findAllActivePaged,
  findById,
  updateStatus,
  setTags,
  setScore,
  setScoreForFiles,
  addTagsToFiles,
  filterExistingFileIds,
  moveFile,
  cloneFile,
  markRemoved,
} from "../../database/repositories/audioFileRepository.js";
import { findAllActive as findAllActiveProjects } from "../../database/repositories/projectRepository.js";
import { syncProjectFromFiles } from "../../database/repositories/linkSync.js";
import { isKnownStatusKey } from "../../database/repositories/statusRepository.js";
import { type AudioFile, type TrackStatus } from "../../models/AudioFile.js";
import { isValidScore, parseScoreListQueryParam } from "../../models/Score.js";
import { asyncHandler } from "../asyncHandler.js";
import { toStringArray } from "../queryParams.js";
import { parsePositiveInt, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../pagination.js";
import { getEffectiveMusicRoot, isWithinRoot } from "../../config/musicRoot.js";
import {
  type FileOpsService,
  PathOutsideRootError as FileOpsPathOutsideRootError,
  NameConflictError as FileOpsNameConflictError,
} from "../../services/FileOpsService.js";
import { type TrashService, PathOutsideRootError as TrashPathOutsideRootError } from "../../services/TrashService.js";

/** Attaches each project's absolute folder path, so the frontend can offer "reveal project folder" without string-splitting file paths. */
function withProjectPath(db: Database.Database, file: AudioFile): AudioFile & { projectPath?: string } {
  if (!file.projectId) return file;
  const projects = findAllActiveProjects(db);
  const project = projects.find((p) => p.id === file.projectId);
  return { ...file, projectPath: project?.path };
}

/** After a batch edit touches several files, re-syncs every distinct project those
 * files belong to (once each, not once per file). */
function syncProjectsForFiles(db: Database.Database, ids: string[]): void {
  const projectIds = new Set<string>();
  for (const id of ids) {
    const file = findById(db, id);
    if (file?.projectId) projectIds.add(file.projectId);
  }
  for (const projectId of projectIds) syncProjectFromFiles(db, projectId);
}

function parseIdsBody(body: unknown): string[] | undefined {
  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return undefined;
  }
  return ids;
}

/** `destDir` (used by the copy/move routes below) must be an ABSOLUTE path to an existing
 * directory, matching every other path-bearing field in this API (scan.ts's `rootPath`,
 * reveal.ts's `path`, folders.ts's tree of absolute paths) rather than a root-relative one.
 * `FileOpsService` re-validates containment itself (realpath-based `isWithinRoot`), so this
 * is just a presence/shape check, not a security boundary. */
function parseDestDir(body: unknown): string | undefined {
  const destDir = (body as { destDir?: unknown })?.destDir;
  return typeof destDir === "string" && destDir.trim().length > 0 ? destDir : undefined;
}

export function createFilesRouter(db: Database.Database, fileOpsService: FileOpsService, trashService: TrashService): Router {
  const router = Router();

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
        sortBy: sortBy as "name" | "modifiedAt" | "folder" | "score" | undefined,
        sortDir: sortDir as "asc" | "desc" | undefined,
        limit: pageSizeNum,
        offset: (pageNum - 1) * pageSizeNum,
      });

      const projects = findAllActiveProjects(db);
      const projectPathById = new Map(projects.map((p) => [p.id, p.path]));
      res.json({
        files: items.map((f) => ({
          ...f,
          projectPath: f.projectId ? projectPathById.get(f.projectId) : undefined,
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
      const file = findById(db, id);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      res.json(withProjectPath(db, file));
    })
  );

  // Streams the audio file's actual bytes for in-app playback. res.sendFile (backed by
  // the `send` package) handles Range requests, 206 partial responses, Content-Type by
  // extension, and conditional GET automatically — that's what lets <audio> seek without
  // downloading the whole file. The path served always comes from the DB record (set
  // during scanning), never directly from the request, so this can't be used to read
  // arbitrary files on disk via the request itself. As defense-in-depth against a
  // mis-populated DB row (see FinderService's identical guard for /api/reveal), we still
  // verify file.path resolves inside the configured music root before streaming it, and
  // treat an out-of-root path the same as an id-miss (plain 404) so the response doesn't
  // leak *why* it failed.
  router.get(
    "/:id/audio",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const file = findById(db, id);
      if (!file || !isWithinRoot(file.path, getEffectiveMusicRoot(db))) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      res.sendFile(file.path, (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: "File not found on disk" });
        }
      });
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
      const knownIds = filterExistingFileIds(db, ids);
      setScoreForFiles(db, knownIds, score);
      syncProjectsForFiles(db, knownIds);
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
      const knownIds = filterExistingFileIds(db, ids);
      addTagsToFiles(db, knownIds, tags);
      syncProjectsForFiles(db, knownIds);
      res.json({ updated: knownIds.length });
    })
  );

  // The three batch file-op routes below use a richer response shape than batch/score and
  // batch/tags above: `{ succeeded: string[]; failed: { id: string; error: string }[] }`
  // rather than a plain count. Filesystem operations can fail per-item for reasons the
  // caller needs to distinguish (not found, name collision, outside root, permission error),
  // so a bare count isn't enough here. Each id is processed independently (best-effort, no
  // rollback of already-succeeded items) — matching this codebase's established batch
  // philosophy (see batch/score, batch/tags above, and tests/batchFileTagsRoute.test.ts),
  // just with a richer per-item result instead of an aggregate count.
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

      const musicRoot = getEffectiveMusicRoot(db);
      const succeeded: string[] = [];
      const failed: { id: string; error: string }[] = [];

      for (const id of ids) {
        const file = findById(db, id);
        if (!file) {
          failed.push({ id, error: "File not found" });
          continue;
        }
        try {
          const copyResult = await fileOpsService.copyPath(file.path, destDir);
          try {
            cloneFile(db, id, copyResult.newAbsolutePath, musicRoot);
            succeeded.push(id);
          } catch (dbError) {
            // See the "physical-succeeds-DB-fails" comment on POST /:id/move below for the
            // reasoning — same inconsistency shape, just for copy (an orphaned physical copy
            // with no matching DB row) instead of a rekeyed-in-place row.
            failed.push({
              id,
              error: `Copy succeeded on disk but could not be recorded in the database: ${(dbError as Error).message}`,
            });
          }
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

      const musicRoot = getEffectiveMusicRoot(db);
      const succeeded: string[] = [];
      const failed: { id: string; error: string }[] = [];

      for (const id of ids) {
        const file = findById(db, id);
        if (!file) {
          failed.push({ id, error: "File not found" });
          continue;
        }
        let moveResult: { newAbsolutePath: string };
        try {
          moveResult = await fileOpsService.movePath(file.path, destDir);
        } catch (err) {
          failed.push({ id, error: err instanceof Error ? err.message : String(err) });
          continue;
        }
        try {
          moveFile(db, id, moveResult.newAbsolutePath, musicRoot);
          succeeded.push(id);
        } catch (dbError) {
          // Physical-succeeds-DB-fails, same as the single-item route below — log loudly
          // (this is a real inconsistency even inside a best-effort batch) and surface it
          // as a per-item failure rather than letting it look like a silent no-op.
          console.error(
            `[files route] batch move: file "${id}" was physically moved to "${moveResult.newAbsolutePath}" ` +
              `but the database update failed — the DB and filesystem are now out of sync. Underlying error: ` +
              `${(dbError as Error).message}`
          );
          failed.push({
            id,
            error: `File was physically moved to "${moveResult.newAbsolutePath}" but the database could not be updated (library out of sync until next scan): ${(dbError as Error).message}`,
          });
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
        const file = findById(db, id);
        if (!file) {
          failed.push({ id, error: "File not found" });
          continue;
        }
        try {
          // One trash() call per item rather than batching all paths into a single call:
          // TrashService.trash is all-or-nothing across the paths it's given (see its own
          // doc comment), which would make one bad item reject the whole batch — the
          // opposite of this route's best-effort, per-item philosophy.
          await trashService.trash([file.path]);
          markRemoved(db, [id], new Date().toISOString());
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
      updateStatus(db, id, status);
      res.json(withProjectPath(db, findById(db, id)!));
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
      setTags(db, id, tags);
      const file = findById(db, id)!;
      if (file.projectId) syncProjectFromFiles(db, file.projectId);
      res.json(withProjectPath(db, file));
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
      setScore(db, id, score);
      const file = findById(db, id)!;
      if (file.projectId) syncProjectFromFiles(db, file.projectId);
      res.json(withProjectPath(db, file));
    })
  );

  router.post(
    "/:id/copy",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const file = findById(db, id);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const destDir = parseDestDir(req.body);
      if (!destDir) {
        res.status(400).json({ error: "destDir is required" });
        return;
      }

      let copyResult: { newAbsolutePath: string };
      try {
        copyResult = await fileOpsService.copyPath(file.path, destDir);
      } catch (err) {
        if (err instanceof FileOpsPathOutsideRootError) {
          res.status(400).json({ error: err.message });
          return;
        }
        if (err instanceof FileOpsNameConflictError) {
          res.status(409).json({ error: err.message });
          return;
        }
        throw err;
      }

      // copyPath auto-renames on a physical name collision (see FileOpsService's
      // resolveCopyDestinationName), so cloneFile colliding at the DB level here should be
      // unreachable in normal operation — defend against it anyway rather than trusting
      // that invariant to hold forever (per docs/TODO.md item 5's task brief).
      try {
        const musicRoot = getEffectiveMusicRoot(db);
        const created = cloneFile(db, id, copyResult.newAbsolutePath, musicRoot);
        res.status(201).json(withProjectPath(db, created));
      } catch (dbError) {
        res.status(409).json({
          error: `Copy succeeded on disk but could not be recorded in the database: ${(dbError as Error).message}`,
        });
      }
    })
  );

  router.post(
    "/:id/move",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const file = findById(db, id);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const destDir = parseDestDir(req.body);
      if (!destDir) {
        res.status(400).json({ error: "destDir is required" });
        return;
      }

      let moveResult: { newAbsolutePath: string };
      try {
        moveResult = await fileOpsService.movePath(file.path, destDir);
      } catch (err) {
        if (err instanceof FileOpsPathOutsideRootError) {
          res.status(400).json({ error: err.message });
          return;
        }
        if (err instanceof FileOpsNameConflictError) {
          res.status(409).json({ error: err.message });
          return;
        }
        throw err;
      }

      // Physical-move-succeeded-but-DB-update-failed mitigation: at this point the file has
      // ALREADY physically moved on disk (fileOpsService.movePath above succeeded). If the
      // DB rekey below throws for any reason (e.g. an unexpected constraint violation), the
      // filesystem and DB are now out of sync — the file lives at
      // moveResult.newAbsolutePath, but the DB row still claims the OLD path/id. We
      // deliberately do NOT attempt to move the file back: an automatic rollback here could
      // itself fail (compounding the problem, exactly like FileOpsService.movePath's own
      // EXDEV-fallback rollback can), and silently retrying is worse than surfacing the
      // problem. Instead we make the inconsistency impossible to miss: log it loudly
      // server-side (with both the id and the new physical path, so it's actionable) and
      // return a distinct response — a 500 with a `code` field and the new path — rather
      // than letting the generic error-handling middleware in server.ts swallow it into an
      // opaque message. The response tells the caller a rescan is the practical way to
      // reconcile the library (the scanner will notice the row's old path is gone and the
      // new path is untracked, and pick both up on its own).
      try {
        const musicRoot = getEffectiveMusicRoot(db);
        const updated = moveFile(db, id, moveResult.newAbsolutePath, musicRoot);
        res.json(withProjectPath(db, updated));
      } catch (dbError) {
        console.error(
          `[files route] File "${id}" was physically moved to "${moveResult.newAbsolutePath}" but the ` +
            `database update failed — the DB and filesystem are now out of sync. Underlying error: ` +
            `${(dbError as Error).message}`
        );
        res.status(500).json({
          error:
            "The file was physically moved, but the database could not be updated to match. " +
            "The library may be out of sync until the next scan.",
          code: "MOVE_DB_SYNC_FAILED",
          newPath: moveResult.newAbsolutePath,
        });
      }
    })
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const file = findById(db, id);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      try {
        await trashService.trash([file.path]);
      } catch (err) {
        if (err instanceof TrashPathOutsideRootError) {
          res.status(400).json({ error: err.message });
          return;
        }
        throw err;
      }
      markRemoved(db, [id], new Date().toISOString());
      res.json({ ok: true });
    })
  );

  return router;
}
