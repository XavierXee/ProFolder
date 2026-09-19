import { Router } from "express";
import type Database from "better-sqlite3";
import {
  listAllTagNames,
  createTag,
  renameTag,
  deleteTagByName,
  tagExists,
  DuplicateTagError,
} from "../../database/repositories/tagRepository.js";
import { asyncHandler } from "../asyncHandler.js";

export function createTagsRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ tags: listAllTagNames(db) });
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { name } = req.body as { name?: unknown };
      if (typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "name is required" });
        return;
      }

      try {
        const tag = createTag(db, name.trim());
        res.status(201).json(tag);
      } catch (err) {
        if (err instanceof DuplicateTagError) {
          res.status(409).json({ error: err.message });
          return;
        }
        throw err;
      }
    })
  );

  router.patch(
    "/:name",
    asyncHandler(async (req, res) => {
      const oldName = req.params.name!;
      const { name: newName } = req.body as { name?: unknown };

      if (typeof newName !== "string" || newName.trim().length === 0) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      if (!tagExists(db, oldName)) {
        res.status(404).json({ error: `No tag found named "${oldName}"` });
        return;
      }

      try {
        renameTag(db, oldName, newName.trim());
        res.json({ name: newName.trim() });
      } catch (err) {
        if (err instanceof DuplicateTagError) {
          res.status(409).json({ error: err.message });
          return;
        }
        throw err;
      }
    })
  );

  router.delete(
    "/:name",
    asyncHandler(async (req, res) => {
      const name = req.params.name!;
      if (!tagExists(db, name)) {
        res.status(404).json({ error: `No tag found named "${name}"` });
        return;
      }
      deleteTagByName(db, name);
      res.json({ deleted: true });
    })
  );

  return router;
}
