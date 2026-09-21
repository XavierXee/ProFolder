import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { createServer } from "../src/api/server.js";

describe("PATCH /api/files/:id/{status,tags,score} — unknown id returns 404, not 500", () => {
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

  it("returns 404 for PATCH /:id/status on an unknown file id", async () => {
    const res = await request(app).patch("/api/files/UNKNOWN/status").send({ status: "unknown" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });

  it("returns 404 for PATCH /:id/tags on an unknown file id", async () => {
    const res = await request(app).patch("/api/files/UNKNOWN/tags").send({ tags: ["drums"] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });

  it("returns 404 for PATCH /:id/score on an unknown file id", async () => {
    const res = await request(app).patch("/api/files/UNKNOWN/score").send({ score: 3 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });
});
