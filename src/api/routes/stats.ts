import { Router } from "express";
import type Database from "better-sqlite3";
import { getLibraryStats } from "../../database/repositories/audioFileRepository.js";
import { asyncHandler } from "../asyncHandler.js";

export function createStatsRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json(getLibraryStats(db));
    })
  );

  return router;
}
