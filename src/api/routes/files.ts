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
} from "../../database/repositories/audioFileRepository.js";
import { findAllActive as findAllActiveProjects } from "../../database/repositories/projectRepository.js";
import { syncProjectFromFiles } from "../../database/repositories/linkSync.js";
import { ALL_TRACK_STATUSES, type AudioFile, type TrackStatus } from "../../models/AudioFile.js";
import { isValidScore, parseScoreListQueryParam } from "../../models/Score.js";
import { asyncHandler } from "../asyncHandler.js";
import { toStringArray } from "../queryParams.js";
import { parsePositiveInt, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../pagination.js";
import { getEffectiveMusicRoot } from "../../config/musicRoot.js";
import { isWithinRoot } from "../../services/FinderService.js";

const VALID_STATUSES = ALL_TRACK_STATUSES;

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

export function createFilesRouter(db: Database.Database): Router {
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
        sortBy: sortBy as "name" | "modifiedAt" | "folder" | undefined,
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
      setScoreForFiles(db, ids, score);
      syncProjectsForFiles(db, ids);
      res.json({ updated: ids.length });
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
      addTagsToFiles(db, ids, tags);
      syncProjectsForFiles(db, ids);
      res.json({ updated: ids.length });
    })
  );

  router.patch(
    "/:id/status",
    asyncHandler(async (req, res) => {
      const id = req.params.id!;
      const { status } = req.body as { status: TrackStatus };
      if (!VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` });
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

  return router;
}
