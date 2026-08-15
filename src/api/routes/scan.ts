import { Router } from "express";
import type Database from "better-sqlite3";
import { runScan } from "../../scanner/scanner.js";
import { getLastScanRun } from "../../database/repositories/scanRunRepository.js";
import { config } from "../../config/config.js";
import { asyncHandler } from "../asyncHandler.js";

export function createScanRouter(db: Database.Database): Router {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const rootPath = (req.body as { rootPath?: string })?.rootPath ?? config.musicRoot;
      const stats = await runScan({ rootPath, audioExtensions: config.audioExtensions }, db);
      res.json(stats);
    })
  );

  router.get(
    "/last",
    asyncHandler(async (_req, res) => {
      const last = getLastScanRun(db);
      if (!last) {
        res.status(404).json({ error: "No scans have been run yet" });
        return;
      }
      res.json(last);
    })
  );

  return router;
}
