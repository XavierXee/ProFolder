import { Router } from "express";
import type Database from "better-sqlite3";
import { findAll, create, update, deleteByKey } from "../../database/repositories/statusRepository.js";
import { UNKNOWN_STATUS_KEY } from "../../models/AudioFile.js";
import { asyncHandler } from "../asyncHandler.js";

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function createStatusesRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ statuses: findAll(db) });
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { name, color } = req.body as { name?: unknown; color?: unknown };

      if (typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      if (typeof color !== "string" || !COLOR_PATTERN.test(color)) {
        res.status(400).json({ error: "color must be a 6-digit hex value like #a1b2c3" });
        return;
      }

      const status = create(db, name.trim(), color);
      res.status(201).json(status);
    })
  );

  router.patch(
    "/:key",
    asyncHandler(async (req, res) => {
      const key = req.params.key!;
      const { name, color } = req.body as { name?: unknown; color?: unknown };

      if (key === UNKNOWN_STATUS_KEY) {
        res.status(400).json({ error: `The "${UNKNOWN_STATUS_KEY}" status is a built-in sentinel and cannot be edited` });
        return;
      }
      if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
        res.status(400).json({ error: "name must be a non-empty string" });
        return;
      }
      if (color !== undefined && (typeof color !== "string" || !COLOR_PATTERN.test(color))) {
        res.status(400).json({ error: "color must be a 6-digit hex value like #a1b2c3" });
        return;
      }

      try {
        const status = update(db, key, {
          name: typeof name === "string" ? name.trim() : undefined,
          color: typeof color === "string" ? color : undefined,
        });
        res.json(status);
      } catch (err) {
        res.status(404).json({ error: err instanceof Error ? err.message : "Status not found" });
      }
    })
  );

  router.delete(
    "/:key",
    asyncHandler(async (req, res) => {
      const key = req.params.key!;

      if (key === UNKNOWN_STATUS_KEY) {
        res.status(400).json({ error: `The "${UNKNOWN_STATUS_KEY}" status is a built-in sentinel and cannot be deleted` });
        return;
      }

      try {
        deleteByKey(db, key);
        res.json({ deleted: true });
      } catch (err) {
        res.status(404).json({ error: err instanceof Error ? err.message : "Status not found" });
      }
    })
  );

  return router;
}
