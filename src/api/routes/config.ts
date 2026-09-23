import { Router } from "express";
import type Database from "better-sqlite3";
import { config } from "../../config/config.js";
import { getEffectiveMusicRoot, setMusicRootOverride } from "../../config/musicRoot.js";
import { getScanSettings, setScanSettings } from "../../config/scanSettings.js";
import {
  getConfirmationSettings,
  setConfirmationSettings,
} from "../../config/confirmationSettings.js";
import { getPaginationSettings, setPaginationSettings } from "../../config/paginationSettings.js";
import {
  getMetricsSettings,
  setMetricsSettings,
  type MetricSpec,
} from "../../config/metricsSettings.js";
import { setDbPathOverride, assertDbFileIsOpenable } from "../../config/desktopPrefs.js";
import type { FolderPickerService } from "../../services/FolderPickerService.js";
import type { DbFilePickerService } from "../../services/DbFilePickerService.js";
import { asyncHandler } from "../asyncHandler.js";

/** Desktop-only dependencies for the `/db-location` routes below. All optional — web mode
 * passes none of them, and the routes gate on `runtimeMode` before ever touching them. */
export interface DesktopConfigDeps {
  dbFilePickerService?: DbFilePickerService;
  dbPrefsFilePath?: string;
  relaunchApp?: () => void;
}

/** Shared 400 body for every `/db-location` route in web mode. 400 (not 404) because the
 * request itself is invalid for the current runtime mode — the resource conceptually never
 * exists for web mode, but "wrong mode for this request" reads more accurately as a bad
 * request than a missing resource. */
const DESKTOP_ONLY_ERROR = { error: "This endpoint is only available in desktop mode" };

export function createConfigRouter(
  db: Database.Database,
  folderPicker: FolderPickerService,
  runtimeMode: "web" | "desktop",
  desktopDeps: DesktopConfigDeps = {}
): Router {
  const router = Router();
  const { dbFilePickerService, dbPrefsFilePath, relaunchApp } = desktopDeps;

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ musicRoot: getEffectiveMusicRoot(db), runtimeMode });
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
      const { excludeSamplesFolders, excludeBackupFolders, duplicateMatchThresholdPercent } = req.body as {
        excludeSamplesFolders?: unknown;
        excludeBackupFolders?: unknown;
        duplicateMatchThresholdPercent?: unknown;
      };
      if (excludeSamplesFolders !== undefined && typeof excludeSamplesFolders !== "boolean") {
        res.status(400).json({ error: "excludeSamplesFolders must be a boolean" });
        return;
      }
      if (excludeBackupFolders !== undefined && typeof excludeBackupFolders !== "boolean") {
        res.status(400).json({ error: "excludeBackupFolders must be a boolean" });
        return;
      }
      if (duplicateMatchThresholdPercent !== undefined && typeof duplicateMatchThresholdPercent !== "number") {
        res.status(400).json({ error: "duplicateMatchThresholdPercent must be a number" });
        return;
      }
      try {
        res.json(
          setScanSettings(db, { excludeSamplesFolders, excludeBackupFolders, duplicateMatchThresholdPercent })
        );
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid duplicateMatchThresholdPercent" });
      }
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

  router.get(
    "/metrics-settings",
    asyncHandler(async (_req, res) => {
      res.json(getMetricsSettings(db));
    })
  );

  router.put(
    "/metrics-settings",
    asyncHandler(async (req, res) => {
      const { projectsMetrics, filesMetrics } = req.body as {
        projectsMetrics?: unknown;
        filesMetrics?: unknown;
      };
      try {
        res.json(
          setMetricsSettings(db, {
            projectsMetrics: projectsMetrics as MetricSpec[] | undefined,
            filesMetrics: filesMetrics as MetricSpec[] | undefined,
          })
        );
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid metrics settings" });
      }
    })
  );

  router.get(
    "/db-location",
    asyncHandler(async (_req, res) => {
      if (runtimeMode !== "desktop") {
        res.status(400).json(DESKTOP_ONLY_ERROR);
        return;
      }
      res.json({ dbPath: config.dbPath });
    })
  );

  router.post(
    "/db-location/choose",
    asyncHandler(async (_req, res) => {
      if (runtimeMode !== "desktop" || !dbFilePickerService) {
        res.status(400).json(DESKTOP_ONLY_ERROR);
        return;
      }
      // Mirrors "/music-root/choose": only picks and returns a path, it does not itself apply
      // it. The frontend (Task 16) is expected to take the returned path and separately call
      // `PUT /db-location` to actually apply it — the same two-step flow
      // `RootPathControl.tsx`'s `chooseMusicRoot()` + `App.tsx`'s subsequent `setMusicRoot()`
      // call already use for the music-root setting.
      const chosen = await dbFilePickerService.chooseDbFile("Select an existing library database file");
      res.json({ path: chosen });
    })
  );

  router.put(
    "/db-location",
    asyncHandler(async (req, res) => {
      if (runtimeMode !== "desktop" || !dbPrefsFilePath || !relaunchApp) {
        res.status(400).json(DESKTOP_ONLY_ERROR);
        return;
      }
      const { dbPath } = req.body as { dbPath?: unknown };
      if (!dbPath || typeof dbPath !== "string") {
        res.status(400).json({ error: "dbPath is required" });
        return;
      }
      try {
        // Trial-open the target before ever persisting it: without this, an unusable path (not a
        // real SQLite file, or one that doesn't exist) would still be accepted and trigger a
        // restart, only failing loudly at next launch via openDb()'s own SQLITE_NOTADB — with no
        // in-app recovery, just a stuck app until desktop-prefs.json is manually edited/deleted.
        assertDbFileIsOpenable(dbPath);
        setDbPathOverride(dbPrefsFilePath, dbPath);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid dbPath" });
        return;
      }
      // No hot DB-handle swap: a live DB handle cannot be safely relocated mid-process (per the
      // original architecture decision), so the only way to actually start using the new
      // location is a full app restart. `res.json()` only queues the write — it does not
      // synchronously flush to the OS, and Electron's `app.exit()` (inside `relaunchApp`) exits
      // immediately without draining pending I/O. Deferring `relaunchApp()` to the response's
      // own `"finish"` event (fired once the bytes are actually written) is what actually
      // guarantees the requesting client sees a real success acknowledgment rather than a
      // connection reset — calling `relaunchApp()` synchronously right after `res.json()` would
      // race the response write.
      res.json({ dbPath });
      res.once("finish", () => relaunchApp());
    })
  );

  return router;
}
