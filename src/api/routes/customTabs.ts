import { Router } from "express";
import type Database from "better-sqlite3";
import { findAll, create, deleteById } from "../../database/repositories/customTabRepository.js";
import { ALL_TRACK_STATUSES, type TrackStatus } from "../../models/AudioFile.js";
import { isValidScore } from "../../models/Score.js";
import { asyncHandler } from "../asyncHandler.js";

/** Parses a `:id` route param as a positive integer, returning undefined if malformed. */
function parseId(raw: string): number | undefined {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== raw) return undefined;
  return parsed;
}

export function createCustomTabsRouter(db: Database.Database): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ tabs: findAll(db) });
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { name, type, statuses, scores, tags } = req.body as {
        name?: unknown;
        type?: unknown;
        statuses?: unknown;
        scores?: unknown;
        tags?: unknown;
      };

      if (typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "name is required" });
        return;
      }

      if (type !== "files" && type !== "projects") {
        res.status(400).json({ error: "type must be 'files' or 'projects'" });
        return;
      }

      const validStatuses = Array.isArray(statuses)
        ? statuses.filter((s): s is TrackStatus => ALL_TRACK_STATUSES.includes(s as TrackStatus))
        : [];
      const validScores = Array.isArray(scores)
        ? scores.filter(
            (s): s is number | "unscored" => s === "unscored" || (typeof s === "number" && isValidScore(s))
          )
        : [];
      const validTags = Array.isArray(tags)
        ? tags
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [];

      const tab = create(db, {
        name: name.trim(),
        type,
        statuses: validStatuses,
        scores: validScores,
        tags: validTags,
      });
      res.status(201).json(tab);
    })
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id!);
      if (id === undefined) {
        res.status(400).json({ error: "invalid id" });
        return;
      }

      const deleted = deleteById(db, id);
      if (!deleted) {
        res.status(404).json({ error: "Custom tab not found" });
        return;
      }
      res.json({ deleted: true });
    })
  );

  return router;
}
