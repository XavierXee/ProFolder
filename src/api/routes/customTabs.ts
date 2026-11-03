import { Router } from "express";
import type Database from "better-sqlite3";
import {
  findAll,
  create,
  update,
  deleteById,
  reorder,
  findOrderedFilesTab,
  membershipOf,
  type CreateCustomTabInput,
} from "../../database/repositories/customTabRepository.js";
import { moveFileInOrderedTab } from "../../database/repositories/audioFileRepository.js";
import { isKnownStatusKey } from "../../database/repositories/statusRepository.js";
import { type TrackStatus } from "../../models/AudioFile.js";
import { isValidScore } from "../../models/Score.js";
import { asyncHandler } from "../asyncHandler.js";

/** Parses a `:id` route param as a positive integer, returning undefined if malformed. */
function parseId(raw: string): number | undefined {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== raw) return undefined;
  return parsed;
}

/** Validates a create/edit request body. Unknown statuses, invalid scores and blank tags are
 * dropped rather than rejected; only a missing name or an unknown type is an error. */
function parseTabInput(db: Database.Database, body: unknown): { input: CreateCustomTabInput } | { error: string } {
  const { name, type, statuses, scores, tags, association, ordered } = (body ?? {}) as {
    name?: unknown;
    type?: unknown;
    statuses?: unknown;
    scores?: unknown;
    tags?: unknown;
    association?: unknown;
    ordered?: unknown;
  };

  if (typeof name !== "string" || name.trim().length === 0) return { error: "name is required" };
  if (type !== "files" && type !== "projects") return { error: "type must be 'files' or 'projects'" };

  const validStatuses = Array.isArray(statuses)
    ? statuses.filter((s): s is TrackStatus => typeof s === "string" && isKnownStatusKey(db, s))
    : [];
  const validScores = Array.isArray(scores)
    ? scores.filter((s): s is number | "unscored" => s === "unscored" || (typeof s === "number" && isValidScore(s)))
    : [];
  const validTags = Array.isArray(tags)
    ? tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : [];
  // Association is a files-only concept (projects have no concept of being associated
  // with another project), so it's forced to undefined for a "projects" tab regardless
  // of what the client sent — a stored-but-inapplicable value would be confusing.
  const validAssociation =
    type === "files" && (association === "associated" || association === "unassociated") ? association : undefined;

  return {
    input: {
      name: name.trim(),
      type,
      statuses: validStatuses,
      scores: validScores,
      tags: validTags,
      association: validAssociation,
      // Files tabs only, like association; the repository stores false for a projects tab.
      ordered: ordered === true,
    },
  };
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
      const parsed = parseTabInput(db, req.body);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      res.status(201).json(create(db, parsed.input));
    })
  );

  // Must stay registered before `PUT /:id` below, which would otherwise take "reorder" as an id.
  router.put(
    "/reorder",
    asyncHandler(async (req, res) => {
      const { orderedIds } = req.body as { orderedIds?: unknown };
      if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === "number" && Number.isInteger(id))) {
        res.status(400).json({ error: "orderedIds must be an array of integers" });
        return;
      }
      res.json({ tabs: reorder(db, orderedIds) });
    })
  );

  // After "/reorder" so that path isn't taken for an id.
  router.put(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id!);
      if (id === undefined) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const parsed = parseTabInput(db, req.body);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const tab = update(db, id, parsed.input);
      if (!tab) {
        res.status(404).json({ error: "Custom tab not found" });
        return;
      }
      res.json(tab);
    })
  );

  // Moves one file of an ordered Audio Files tab to a new 1-based position.
  router.put(
    "/:id/files/order",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id!);
      if (id === undefined) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const tab = findOrderedFilesTab(db, id);
      if (!tab) {
        res.status(404).json({ error: "Ordered tab not found" });
        return;
      }
      const { fileId, position } = req.body as { fileId?: unknown; position?: unknown };
      if (typeof fileId !== "string" || typeof position !== "number" || !Number.isInteger(position) || position < 1) {
        res.status(400).json({ error: "fileId (string) and position (integer ≥ 1) are required" });
        return;
      }
      try {
        moveFileInOrderedTab(db, tab.id, membershipOf(tab), fileId, position);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Could not reorder" });
        return;
      }
      res.json({ moved: true });
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
