import { Router } from "express";
import type Database from "better-sqlite3";
import { listAllTagNames } from "../../database/repositories/tagRepository.js";
import { asyncHandler } from "../asyncHandler.js";

export function createTagsRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ tags: listAllTagNames(db) });
    })
  );

  return router;
}
