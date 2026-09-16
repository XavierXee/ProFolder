import { Router } from "express";
import type Database from "better-sqlite3";
import { runScan } from "../../scanner/scanner.js";
import { getLastScanRun } from "../../database/repositories/scanRunRepository.js";
import { getExcludedPaths, setExcludedPaths } from "../../database/repositories/scanExclusionRepository.js";
import { config } from "../../config/config.js";
import { getEffectiveMusicRoot, isWithinRoot } from "../../config/musicRoot.js";
import { asyncHandler } from "../asyncHandler.js";

export function createScanRouter(db: Database.Database): Router {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = req.body as { rootPath?: string };
      const effectiveRoot = getEffectiveMusicRoot(db);
      // Only validate when the client explicitly supplies rootPath — the default (omitted
      // rootPath) path is deliberately left unvalidated so the existing graceful degraded-scan
      // behavior for a transiently-unreachable configured root (see scanner.ts) is preserved
      // unchanged.
      if (body?.rootPath !== undefined) {
        if (typeof body.rootPath !== "string" || !isWithinRoot(body.rootPath, effectiveRoot)) {
          res.status(400).json({ error: "rootPath must be within the configured music root" });
          return;
        }
      }
      const rootPath = body?.rootPath ?? effectiveRoot;
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

  router.get(
    "/exclusions",
    asyncHandler(async (_req, res) => {
      res.json({ excludedPaths: getExcludedPaths(db) });
    })
  );

  router.put(
    "/exclusions",
    asyncHandler(async (req, res) => {
      const { excludedPaths } = req.body as { excludedPaths?: string[] };
      if (!Array.isArray(excludedPaths) || !excludedPaths.every((p) => typeof p === "string")) {
        res.status(400).json({ error: "excludedPaths must be an array of strings" });
        return;
      }
      setExcludedPaths(db, excludedPaths);
      res.json({ excludedPaths: getExcludedPaths(db) });
    })
  );

  return router;
}
