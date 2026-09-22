import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { createServer } from "../src/api/server.js";
import { MacFinderService } from "../src/services/FinderService.js";
import { MacFolderPickerService } from "../src/services/FolderPickerService.js";
import { MacTrashService } from "../src/services/TrashService.js";
import { NodeFileOpsService } from "../src/services/FileOpsService.js";
import { getEffectiveMusicRoot } from "../src/config/musicRoot.js";
import { insertAudioFile, addTagsToFiles, findById } from "../src/database/repositories/audioFileRepository.js";

// createServer now takes its platform services as explicit DI params instead of
// constructing them internally (see src/api/server.ts). This helper constructs the same
// real Mac* classes the plain web-mode entrypoint uses, matching this test's pre-refactor
// behavior exactly.
function makeServerServices(db: Database.Database) {
  return {
    finderService: new MacFinderService(() => getEffectiveMusicRoot(db)),
    folderPickerService: new MacFolderPickerService(),
    trashService: new MacTrashService(() => getEffectiveMusicRoot(db)),
    fileOpsService: new NodeFileOpsService(() => getEffectiveMusicRoot(db)),
  };
}

describe("/api/tags", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createServer(db, makeServerServices(db));
  });

  afterEach(() => {
    db.close();
  });

  describe("GET /api/tags", () => {
    it("returns an empty list when there are no tags (unaffected by this task's changes)", async () => {
      const res = await request(app).get("/api/tags");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tags: [] });
    });

    it("returns all tags alphabetically after creating some", async () => {
      await request(app).post("/api/tags").send({ name: "vocals" });
      await request(app).post("/api/tags").send({ name: "drums" });

      const res = await request(app).get("/api/tags");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tags: ["drums", "vocals"] });
    });
  });

  describe("POST /api/tags", () => {
    it("creates a new tag and it shows up in a follow-up GET", async () => {
      const res = await request(app).post("/api/tags").send({ name: "kick" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: "kick" });
      expect(typeof res.body.id).toBe("number");

      const getRes = await request(app).get("/api/tags");
      expect(getRes.body.tags).toEqual(["kick"]);
    });

    it("returns 400 for an empty name", async () => {
      const res = await request(app).post("/api/tags").send({ name: "   " });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a missing name", async () => {
      const res = await request(app).post("/api/tags").send({});
      expect(res.status).toBe(400);
    });

    it("returns 409 for a duplicate name (exact match)", async () => {
      await request(app).post("/api/tags").send({ name: "kick" });
      const res = await request(app).post("/api/tags").send({ name: "kick" });
      expect(res.status).toBe(409);
    });

    it("returns 409 for a duplicate name (case-insensitive)", async () => {
      await request(app).post("/api/tags").send({ name: "Kick" });
      const res = await request(app).post("/api/tags").send({ name: "kick" });
      expect(res.status).toBe(409);
    });
  });

  describe("PATCH /api/tags/:name", () => {
    it("renames an existing tag", async () => {
      await request(app).post("/api/tags").send({ name: "kick" });

      const res = await request(app).patch("/api/tags/kick").send({ name: "kick-drum" });
      expect(res.status).toBe(200);

      const getRes = await request(app).get("/api/tags");
      expect(getRes.body.tags).toEqual(["kick-drum"]);
    });

    it("returns 400 for an empty new name", async () => {
      await request(app).post("/api/tags").send({ name: "kick" });
      const res = await request(app).patch("/api/tags/kick").send({ name: "   " });
      expect(res.status).toBe(400);
    });

    it("returns 404 for a name that doesn't exist", async () => {
      const res = await request(app).patch("/api/tags/not-real").send({ name: "whatever" });
      expect(res.status).toBe(404);
    });

    it("returns 409 when renaming to a name that collides with a different existing tag (case-insensitive)", async () => {
      await request(app).post("/api/tags").send({ name: "kick" });
      await request(app).post("/api/tags").send({ name: "snare" });

      const res = await request(app).patch("/api/tags/kick").send({ name: "Snare" });
      expect(res.status).toBe(409);
    });

    it("allows renaming a tag to a case-different variant of its own name (not a false self-collision)", async () => {
      await request(app).post("/api/tags").send({ name: "kick" });

      const res = await request(app).patch("/api/tags/kick").send({ name: "Kick" });
      expect(res.status).toBe(200);

      const getRes = await request(app).get("/api/tags");
      expect(getRes.body.tags).toEqual(["Kick"]);
    });
  });

  describe("DELETE /api/tags/:name", () => {
    it("deletes an existing tag and it no longer shows up in a follow-up GET", async () => {
      await request(app).post("/api/tags").send({ name: "kick" });

      const res = await request(app).delete("/api/tags/kick");
      expect(res.status).toBe(200);

      const getRes = await request(app).get("/api/tags");
      expect(getRes.body.tags).toEqual([]);
    });

    it("returns 404 for a name that doesn't exist", async () => {
      const res = await request(app).delete("/api/tags/not-real");
      expect(res.status).toBe(404);
    });

    it("cascades: a file that had the deleted tag loses it, via the pre-existing ON DELETE CASCADE junction constraint", async () => {
      const now = new Date().toISOString();
      insertAudioFile(db, {
        id: "file-a.wav",
        path: "/Music/file-a.wav",
        relativePath: "file-a.wav",
        filename: "file-a.wav",
        extension: ".wav",
        size: 10,
        modifiedAt: now,
        containingFolder: "/Music",
        firstSeenAt: now,
        lastSeenAt: now,
        isRemoved: false,
      });
      addTagsToFiles(db, ["file-a.wav"], ["kick"]);
      expect(findById(db, "file-a.wav")?.tags).toEqual(["kick"]);

      const res = await request(app).delete("/api/tags/kick");
      expect(res.status).toBe(200);

      expect(findById(db, "file-a.wav")?.tags).toEqual([]);
    });
  });
});
