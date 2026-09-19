import { Router } from "express";
import type Database from "better-sqlite3";
import { getEffectiveMusicRoot, setMusicRootOverride } from "../../config/musicRoot.js";
import { getScanSettings, setScanSettings } from "../../config/scanSettings.js";
import {
  getConfirmationSettings,
  setConfirmationSettings,
} from "../../config/confirmationSettings.js";
import { getPaginationSettings, setPaginationSettings } from "../../config/paginationSettings.js";
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

  router.get(
    "/confirmation-settings",
    asyncHandler(async (_req, res) => {
      res.json(getConfirmationSettings(db));
    })
  );

  router.put(
    "/confirmation-settings",
    asyncHandler(async (req, res) => {
      const {
        confirmTabDeletion,
        confirmCopy,
        confirmMove,
        confirmDelete,
        confirmStatusDeletion,
        confirmTagDeletion,
      } = req.body as {
        confirmTabDeletion?: unknown;
        confirmCopy?: unknown;
        confirmMove?: unknown;
        confirmDelete?: unknown;
        confirmStatusDeletion?: unknown;
        confirmTagDeletion?: unknown;
      };
      if (confirmTabDeletion !== undefined && typeof confirmTabDeletion !== "boolean") {
        res.status(400).json({ error: "confirmTabDeletion must be a boolean" });
        return;
      }
      if (confirmCopy !== undefined && typeof confirmCopy !== "boolean") {
        res.status(400).json({ error: "confirmCopy must be a boolean" });
        return;
      }
      if (confirmMove !== undefined && typeof confirmMove !== "boolean") {
        res.status(400).json({ error: "confirmMove must be a boolean" });
        return;
      }
      if (confirmDelete !== undefined && typeof confirmDelete !== "boolean") {
        res.status(400).json({ error: "confirmDelete must be a boolean" });
        return;
      }
      if (confirmStatusDeletion !== undefined && typeof confirmStatusDeletion !== "boolean") {
        res.status(400).json({ error: "confirmStatusDeletion must be a boolean" });
        return;
      }
      if (confirmTagDeletion !== undefined && typeof confirmTagDeletion !== "boolean") {
        res.status(400).json({ error: "confirmTagDeletion must be a boolean" });
        return;
      }
      res.json(
        setConfirmationSettings(db, {
          confirmTabDeletion,
          confirmCopy,
          confirmMove,
          confirmDelete,
          confirmStatusDeletion,
          confirmTagDeletion,
        })
      );
    })
  );

  router.get(
    "/pagination-settings",
    asyncHandler(async (_req, res) => {
      res.json(getPaginationSettings(db));
    })
  );

  router.put(
    "/pagination-settings",
    asyncHandler(async (req, res) => {
      const { itemsPerPage } = req.body as { itemsPerPage?: unknown };
      if (itemsPerPage !== undefined && typeof itemsPerPage !== "number") {
        res.status(400).json({ error: "itemsPerPage must be a number" });
        return;
      }
      try {
        res.json(setPaginationSettings(db, { itemsPerPage }));
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid itemsPerPage" });
      }
    })
  );

  return router;
}
