import { Router } from "express";
import type Database from "better-sqlite3";
import { buildFolderTree } from "../../scanner/folderTree.js";
import { getEffectiveMusicRoot } from "../../config/musicRoot.js";
import { getScanSettings } from "../../config/scanSettings.js";
import { asyncHandler } from "../asyncHandler.js";

export function createFoldersRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/tree",
    asyncHandler(async (_req, res) => {
      const tree = await buildFolderTree(getEffectiveMusicRoot(db), { ignoreDirOptions: getScanSettings(db) });
      res.json(tree);
    })
  );

  return router;
}
