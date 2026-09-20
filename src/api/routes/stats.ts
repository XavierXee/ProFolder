import { Router } from "express";
import type Database from "better-sqlite3";
import { getFileStats, getFileTagCounts } from "../../database/repositories/audioFileRepository.js";
import { getProjectStats, getProjectTagCounts } from "../../database/repositories/projectRepository.js";
import { asyncHandler } from "../asyncHandler.js";
import { toStringArray } from "../queryParams.js";

export function createStatsRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ files: getFileStats(db), projects: getProjectStats(db) });
    })
  );

  router.get(
    "/tag-counts",
    asyncHandler(async (req, res) => {
      const fileTags = toStringArray(req.query.fileTag);
      const projectTags = toStringArray(req.query.projectTag);
      res.json({
        files: getFileTagCounts(db, fileTags),
        projects: getProjectTagCounts(db, projectTags),
      });
    })
  );

  return router;
}
