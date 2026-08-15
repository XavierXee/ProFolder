import { Router } from "express";
import type Database from "better-sqlite3";
import {
  findAllActivePaged,
  findById,
  updateStatus,
  setTags,
} from "../../database/repositories/audioFileRepository.js";
import { findAllActive as findAllActiveProjects } from "../../database/repositories/projectRepository.js";
import type { AudioFile, TrackStatus } from "../../models/AudioFile.js";
import { asyncHandler } from "../asyncHandler.js";

const VALID_STATUSES: TrackStatus[] = ["unknown", "draft", "finished"];
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

/** Attaches each project's absolute folder path, so the frontend can offer "reveal project folder" without string-splitting file paths. */
function withProjectPath(db: Database.Database, file: AudioFile): AudioFile & { projectPath?: string } {
  if (!file.projectId) return file;
  const projects = findAllActiveProjects(db);
  const project = projects.find((p) => p.id === file.projectId);
  return { ...file, projectPath: project?.path };
}

export function createFilesRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { search, status, hasExport, tag, sortBy, sortDir, page, pageSize } = req.query;
      const pageNum = parsePositiveInt(page, 1);
      const pageSizeNum = parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

      const { items, total } = findAllActivePaged(db, {
        search: typeof search === "string" ? search : undefined,
        status: typeof status === "string" ? (status as TrackStatus) : undefined,
        hasExport: hasExport === "true" ? true : hasExport === "false" ? false : undefined,
        tag: typeof tag === "string" ? tag : undefined,
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
      res.json(withProjectPath(db, findById(db, id)!));
    })
  );

  return router;
}
