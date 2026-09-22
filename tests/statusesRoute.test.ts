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

describe("/api/statuses", () => {
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

  describe("GET /api/statuses", () => {
    it("returns the 4 seeded default statuses", async () => {
      const res = await request(app).get("/api/statuses");
      expect(res.status).toBe(200);
      expect(res.body.statuses.map((s: { key: string }) => s.key)).toEqual([
        "draft",
        "needs_mixing",
        "done",
        "released",
      ]);
    });
  });

  describe("POST /api/statuses", () => {
    it("creates a new status and it shows up in a follow-up GET", async () => {
      const res = await request(app).post("/api/statuses").send({ name: "Mastered", color: "#123456" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ key: "mastered", name: "Mastered", color: "#123456" });

      const getRes = await request(app).get("/api/statuses");
      expect(getRes.body.statuses.map((s: { key: string }) => s.key)).toContain("mastered");
    });

    it("returns 400 for a missing name", async () => {
      const res = await request(app).post("/api/statuses").send({ color: "#123456" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for an empty name", async () => {
      const res = await request(app).post("/api/statuses").send({ name: "   ", color: "#123456" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a malformed color", async () => {
      const res = await request(app).post("/api/statuses").send({ name: "Mastered", color: "blue" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for a missing color", async () => {
      const res = await request(app).post("/api/statuses").send({ name: "Mastered" });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/statuses/:key", () => {
    it("updates name and color, and the key stays the same", async () => {
      const res = await request(app)
        .patch("/api/statuses/draft")
        .send({ name: "Rough Draft", color: "#abcdef" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ key: "draft", name: "Rough Draft", color: "#abcdef" });
    });

    it("returns 400 for key='unknown'", async () => {
      const res = await request(app).patch("/api/statuses/unknown").send({ name: "Nope" });
      expect(res.status).toBe(400);
    });

    it("returns 404 for a key that doesn't exist", async () => {
      const res = await request(app).patch("/api/statuses/not_real").send({ name: "Whatever" });
      expect(res.status).toBe(404);
    });

    it("returns 400 for a malformed color", async () => {
      const res = await request(app).patch("/api/statuses/draft").send({ color: "nope" });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/statuses/:key", () => {
    it("deletes an existing status and it no longer shows up in a follow-up GET", async () => {
      const deleteRes = await request(app).delete("/api/statuses/draft");
      expect(deleteRes.status).toBe(200);

      const getRes = await request(app).get("/api/statuses");
      expect(getRes.body.statuses.map((s: { key: string }) => s.key)).not.toContain("draft");
    });

    it("returns 400 for key='unknown'", async () => {
      const res = await request(app).delete("/api/statuses/unknown");
      expect(res.status).toBe(400);
    });

    it("returns 404 for a key that doesn't exist", async () => {
      const res = await request(app).delete("/api/statuses/not_real");
      expect(res.status).toBe(404);
    });
  });
});
