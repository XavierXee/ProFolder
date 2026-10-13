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
    runtimeMode: "web" as const,
  };
}

describe("/api/custom-tabs", () => {
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

  describe("POST /api/custom-tabs", () => {
    it("creates a custom tab with a fully valid body and persists it", async () => {
      const res = await request(app).post("/api/custom-tabs").send({
        name: "Mix Ready",
        type: "files",
        statuses: ["draft", "done"],
        scores: [4, 5, "unscored"],
        tags: ["drums", "vocals"],
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: "Mix Ready",
        type: "files",
        statuses: ["draft", "done"],
        scores: [4, 5, "unscored"],
        tags: ["drums", "vocals"],
      });
      expect(typeof res.body.id).toBe("number");
      expect(typeof res.body.createdAt).toBe("string");

      const getRes = await request(app).get("/api/custom-tabs");
      expect(getRes.status).toBe(200);
      expect(getRes.body.tabs).toHaveLength(1);
      expect(getRes.body.tabs[0]).toMatchObject({ name: "Mix Ready", type: "files" });
    });

    it("returns 400 for a whitespace-only name", async () => {
      const res = await request(app)
        .post("/api/custom-tabs")
        .send({ name: "   ", type: "files" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "name is required" });
    });

    it("returns 400 for a missing name", async () => {
      const res = await request(app).post("/api/custom-tabs").send({ type: "files" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "name is required" });
    });

    it("returns 400 for an invalid type without reaching the DB constraint", async () => {
      const res = await request(app)
        .post("/api/custom-tabs")
        .send({ name: "Bad Tab", type: "songs" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "type must be 'files' or 'projects'" });

      const getRes = await request(app).get("/api/custom-tabs");
      expect(getRes.body.tabs).toHaveLength(0);
    });

    it("silently drops invalid statuses entries, keeping only the valid one", async () => {
      const res = await request(app).post("/api/custom-tabs").send({
        name: "Status Filter",
        type: "files",
        statuses: ["draft", "bogus"],
      });

      expect(res.status).toBe(201);
      expect(res.body.statuses).toEqual(["draft"]);
    });

    it("silently drops invalid scores entries, keeping only the valid one", async () => {
      const res = await request(app).post("/api/custom-tabs").send({
        name: "Score Filter",
        type: "projects",
        scores: [3, 9],
      });

      expect(res.status).toBe(201);
      expect(res.body.scores).toEqual([3]);
    });

    it("silently drops a literal null in scores instead of storing it", async () => {
      const res = await request(app).post("/api/custom-tabs").send({
        name: "Null Score Filter",
        type: "projects",
        scores: [null, 3],
      });

      expect(res.status).toBe(201);
      expect(res.body.scores).toEqual([3]);
    });

    it("trims whitespace from tags before storing them", async () => {
      const res = await request(app).post("/api/custom-tabs").send({
        name: "Tag Trim",
        type: "files",
        tags: ["  kick  ", "snare"],
      });

      expect(res.status).toBe(201);
      expect(res.body.tags).toEqual(["kick", "snare"]);
    });

    it("defaults statuses/scores/tags to [] when omitted", async () => {
      const res = await request(app)
        .post("/api/custom-tabs")
        .send({ name: "Minimal", type: "projects" });

      expect(res.status).toBe(201);
      expect(res.body.statuses).toEqual([]);
      expect(res.body.scores).toEqual([]);
      expect(res.body.tags).toEqual([]);
    });

    it("persists a valid association for a type: 'files' tab", async () => {
      const res = await request(app).post("/api/custom-tabs").send({
        name: "Unassociated Files",
        type: "files",
        association: "unassociated",
      });

      expect(res.status).toBe(201);
      expect(res.body.association).toBe("unassociated");

      const getRes = await request(app).get("/api/custom-tabs");
      expect(getRes.body.tabs[0].association).toBe("unassociated");
    });

    it("silently drops association for a type: 'projects' tab, even if a valid value was sent", async () => {
      const res = await request(app).post("/api/custom-tabs").send({
        name: "Projects With Association",
        type: "projects",
        association: "associated",
      });

      expect(res.status).toBe(201);
      expect(res.body.association).toBeUndefined();
    });

    it("silently drops an invalid association value", async () => {
      const res = await request(app).post("/api/custom-tabs").send({
        name: "Bad Association",
        type: "files",
        association: "bogus",
      });

      expect(res.status).toBe(201);
      expect(res.body.association).toBeUndefined();
    });

    it("defaults association to undefined when omitted", async () => {
      const res = await request(app)
        .post("/api/custom-tabs")
        .send({ name: "No Association", type: "files" });

      expect(res.status).toBe(201);
      expect(res.body.association).toBeUndefined();
    });
  });

  describe("GET /api/custom-tabs", () => {
    it("returns an empty list when there are no tabs", async () => {
      const res = await request(app).get("/api/custom-tabs");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tabs: [] });
    });

    it("returns all tabs in creation order after creating multiple", async () => {
      await request(app).post("/api/custom-tabs").send({ name: "First", type: "files" });
      await request(app).post("/api/custom-tabs").send({ name: "Second", type: "projects" });

      const res = await request(app).get("/api/custom-tabs");
      expect(res.status).toBe(200);
      expect(res.body.tabs).toHaveLength(2);
      expect(res.body.tabs.map((t: { name: string }) => t.name)).toEqual(["First", "Second"]);
    });
  });

  describe("DELETE /api/custom-tabs/:id", () => {
    it("deletes an existing tab and it no longer shows up in a follow-up GET", async () => {
      const createRes = await request(app)
        .post("/api/custom-tabs")
        .send({ name: "Delete Me", type: "files" });
      const id = createRes.body.id;

      const deleteRes = await request(app).delete(`/api/custom-tabs/${id}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body).toEqual({ deleted: true });

      const getRes = await request(app).get("/api/custom-tabs");
      expect(getRes.body.tabs).toHaveLength(0);
    });

    it("returns 404 for a nonexistent id", async () => {
      const res = await request(app).delete("/api/custom-tabs/999999");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Custom tab not found" });
    });

    it("returns 400 for a malformed, non-numeric id", async () => {
      const res = await request(app).delete("/api/custom-tabs/abc");
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "invalid id" });
    });

    it("returns 400 for a leading-digit-then-junk id (not silently parsed as its leading number)", async () => {
      const res = await request(app).delete("/api/custom-tabs/5abc");
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "invalid id" });
    });
  });
});
