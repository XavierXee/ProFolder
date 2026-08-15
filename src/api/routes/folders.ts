import { Router } from "express";
import { buildFolderTree } from "../../scanner/folderTree.js";
import { config } from "../../config/config.js";
import { asyncHandler } from "../asyncHandler.js";

export function createFoldersRouter(): Router {
  const router = Router();

  router.get(
    "/tree",
    asyncHandler(async (_req, res) => {
      const tree = await buildFolderTree(config.musicRoot);
      res.json(tree);
    })
  );

  return router;
}
