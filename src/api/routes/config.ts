import { Router } from "express";
import type Database from "better-sqlite3";
import { getEffectiveMusicRoot, setMusicRootOverride } from "../../config/musicRoot.js";
import { getScanSettings, setScanSettings } from "../../config/scanSettings.js";
import type { FolderPickerService } from "../../services/FolderPickerService.js";
import { asyncHandler } from "../asyncHandler.js";

export function createConfigRouter(db: Database.Database, folderPicker: FolderPickerService): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ musicRoot: getEffectiveMusicRoot(db) });
    })
  );

  router.put(
    "/music-root",
    asyncHandler(async (req, res) => {
      const { musicRoot } = req.body as { musicRoot?: string };
      if (!musicRoot || typeof musicRoot !== "string") {
        res.status(400).json({ error: "musicRoot is required" });
        return;
      }
      let resolved: string;
      try {
        resolved = setMusicRootOverride(db, musicRoot);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid path" });
        return;
      }
      res.json({ musicRoot: resolved });
    })
  );

  router.post(
    "/music-root/choose",
    asyncHandler(async (_req, res) => {
      const chosen = await folderPicker.chooseFolder("Select your music production folder");
      res.json({ path: chosen });
    })
  );

  router.get(
    "/scan-settings",
    asyncHandler(async (_req, res) => {
      res.json(getScanSettings(db));
    })
  );

  router.put(
    "/scan-settings",
    asyncHandler(async (req, res) => {
      const { excludeSamplesFolders, excludeBackupFolders } = req.body as {
        excludeSamplesFolders?: unknown;
        excludeBackupFolders?: unknown;
      };
      if (excludeSamplesFolders !== undefined && typeof excludeSamplesFolders !== "boolean") {
        res.status(400).json({ error: "excludeSamplesFolders must be a boolean" });
        return;
      }
      if (excludeBackupFolders !== undefined && typeof excludeBackupFolders !== "boolean") {
        res.status(400).json({ error: "excludeBackupFolders must be a boolean" });
        return;
      }
      res.json(setScanSettings(db, { excludeSamplesFolders, excludeBackupFolders }));
    })
  );

  return router;
}
