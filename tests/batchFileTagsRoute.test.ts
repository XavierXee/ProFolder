import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  insertAudioFile,
  findById,
  markRemoved,
  type AudioFileUpsertInput,
} from "../src/database/repositories/audioFileRepository.js";
import { upsertProject, findById as findProjectById } from "../src/database/repositories/projectRepository.js";
import { createServer } from "../src/api/server.js";

// Covers docs/TODO.md's "Task 9 follow-ups" item 3: PATCH /api/files/batch/tags (and, per
// the user's decision, its sibling PATCH /api/files/batch/score) previously choked on any
// unknown id in the batch. For batch/tags, addTagsToFiles wraps everything in one
// db.transaction(...) and does INSERT OR IGNORE INTO audio_file_tags, which does NOT
// suppress a FOREIGN KEY constraint violation when audio_file_id references a row that
// doesn't exist — the whole transaction rolled back, losing tags for every valid file in
// the same batch (and any brand-new tag names) just because one id in the batch was bogus.
// The fix filters `ids` down to ids that actually exist and are active (updated per
// docs/TODO.md item 20's product decision to also exclude soft-removed files, not just
// unknown ids) via filterExistingFileIds before calling into either repository function,
// and reports the filtered count as `updated`.

function makeFile(overrides: Partial<AudioFileUpsertInput> & { id: string }): AudioFileUpsertInput {
  const now = new Date().toISOString();
  return {
    path: `/Music/${overrides.id}`,
    relativePath: overrides.id,
    filename: overrides.id,
    extension: ".wav",
    size: 100,
    modifiedAt: now,
    containingFolder: "/Music",
    firstSeenAt: now,
    lastSeenAt: now,
    isRemoved: false,
    ...overrides,
  };
}

describe("PATCH /api/files/batch/tags and /api/files/batch/score — unknown-id tolerance", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createServer(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("PATCH /api/files/batch/tags", () => {
    it("tolerates an unknown id mixed in with real ones: 200, both real files tagged, ghost silently ignored, no rollback", async () => {
      insertAudioFile(db, makeFile({ id: "real-file-1" }));
      insertAudioFile(db, makeFile({ id: "real-file-2" }));

      const res = await request(app)
        .patch("/api/files/batch/tags")
        .send({ ids: ["real-file-1", "GHOSTFILE", "real-file-2"], tags: ["drums"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 2 });
      expect(findById(db, "real-file-1")!.tags).toEqual(["drums"]);
      expect(findById(db, "real-file-2")!.tags).toEqual(["drums"]);
    });

    it("returns 200 { updated: 0 } for an all-unknown batch, with no rows affected anywhere", async () => {
      const res = await request(app)
        .patch("/api/files/batch/tags")
        .send({ ids: ["ghost-1", "ghost-2"], tags: ["drums"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 0 });
      const tagRow = db.prepare(`SELECT * FROM tags WHERE name = 'drums'`).get();
      // A ghost-only batch shouldn't even leave the tag dangling in the dictionary, but
      // regardless of that implementation detail, no audio_file_tags row can exist.
      const linkCount = (
        db.prepare(`SELECT COUNT(*) AS c FROM audio_file_tags`).get() as { c: number }
      ).c;
      expect(linkCount).toBe(0);
      // Not asserting on tagRow's existence either way (addTagsToFiles inserts the tag name
      // into the dictionary before it knows which file ids are valid) — just that no link exists.
      void tagRow;
    });

    it("still lets a brand-new tag name enter the global tags table even with a ghost id in the batch (regression guard)", async () => {
      insertAudioFile(db, makeFile({ id: "real-file-1" }));

      const res = await request(app)
        .patch("/api/files/batch/tags")
        .send({ ids: ["real-file-1", "GHOSTFILE"], tags: ["brand-new-tag"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 1 });
      const tagRow = db.prepare(`SELECT id FROM tags WHERE name = 'brand-new-tag'`).get();
      expect(tagRow).toBeDefined();
      expect(findById(db, "real-file-1")!.tags).toEqual(["brand-new-tag"]);
    });

    it("excludes a soft-removed file from the batch (active-only filter, docs/TODO.md item 20)", async () => {
      insertAudioFile(db, makeFile({ id: "removed-file" }));
      markRemoved(db, ["removed-file"], new Date().toISOString());

      const res = await request(app)
        .patch("/api/files/batch/tags")
        .send({ ids: ["removed-file", "GHOSTFILE"], tags: ["drums"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 0 });
      const file = findById(db, "removed-file")!;
      expect(file.isRemoved).toBe(true);
      expect(file.tags).toEqual([]);
    });

    it("reports `updated` equal to the count of ids that actually exist", async () => {
      insertAudioFile(db, makeFile({ id: "real-1" }));
      insertAudioFile(db, makeFile({ id: "real-2" }));
      insertAudioFile(db, makeFile({ id: "real-3" }));

      const res = await request(app)
        .patch("/api/files/batch/tags")
        .send({ ids: ["real-1", "real-2", "real-3", "ghost-a", "ghost-b"], tags: ["mix"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 3 });
    });

    it("dedupes a duplicate-id batch, reflected in `updated`", async () => {
      insertAudioFile(db, makeFile({ id: "real-1" }));

      const res = await request(app)
        .patch("/api/files/batch/tags")
        .send({ ids: ["real-1", "real-1", "real-1"], tags: ["mix"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 1 });
      expect(findById(db, "real-1")!.tags).toEqual(["mix"]);
    });

    it("re-syncs the owning project from the filtered file list without erroring on the excluded ghost id", async () => {
      const now = new Date().toISOString();
      upsertProject(db, {
        id: "Project A",
        name: "Project A",
        path: "/Music/Project A",
        hasVideo: false,
        hasImage: false,
        firstSeenAt: now,
        lastSeenAt: now,
        contentModifiedAt: null,
      });
      insertAudioFile(db, makeFile({ id: "linked-file", projectId: "Project A" }));

      const res = await request(app)
        .patch("/api/files/batch/tags")
        .send({ ids: ["linked-file", "GHOSTFILE"], tags: ["mixed"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 1 });
      // syncProjectFromFiles recomputes the project's tags as the union of its active
      // files' tags — proves the project sync ran cleanly on the filtered id list.
      const project = findProjectById(db, "Project A")!;
      expect(project.tags).toEqual(["mixed"]);
    });
  });

  describe("PATCH /api/files/batch/score — parity with batch/tags' honest count", () => {
    it("tolerates an unknown id mixed in with real ones: 200, both real files scored, honest count", async () => {
      insertAudioFile(db, makeFile({ id: "real-file-1" }));
      insertAudioFile(db, makeFile({ id: "real-file-2" }));

      const res = await request(app)
        .patch("/api/files/batch/score")
        .send({ ids: ["real-file-1", "GHOSTFILE", "real-file-2"], score: 4 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 2 });
      expect(findById(db, "real-file-1")!.score).toBe(4);
      expect(findById(db, "real-file-2")!.score).toBe(4);
    });

    it("returns 200 { updated: 0 } for an all-unknown batch", async () => {
      const res = await request(app)
        .patch("/api/files/batch/score")
        .send({ ids: ["ghost-1", "ghost-2"], score: 3 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 0 });
    });

    it("dedupes a duplicate-id batch, reflected in `updated`", async () => {
      insertAudioFile(db, makeFile({ id: "real-1" }));

      const res = await request(app)
        .patch("/api/files/batch/score")
        .send({ ids: ["real-1", "real-1"], score: 2 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 1 });
      expect(findById(db, "real-1")!.score).toBe(2);
    });
  });
});
