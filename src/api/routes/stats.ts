import { Router } from "express";
import type Database from "better-sqlite3";
import { getFileStats } from "../../database/repositories/audioFileRepository.js";
import { getProjectStats } from "../../database/repositories/projectRepository.js";
import { asyncHandler } from "../asyncHandler.js";

export function createStatsRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ files: getFileStats(db), projects: getProjectStats(db) });
    })
  );

  return router;
}
