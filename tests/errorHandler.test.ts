import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { createServer } from "../src/api/server.js";

describe("global error handler — echoes a real upstream statusCode", () => {
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

  it("returns 400, not 500, for a malformed JSON request body", async () => {
    const res = await request(app)
      .patch("/api/files/batch/score")
      .set("Content-Type", "application/json")
      .send("{not valid json");

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTypeOf("string");
  });
});
