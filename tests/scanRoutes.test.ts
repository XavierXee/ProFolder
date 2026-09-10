import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { setMusicRootOverride } from "../src/config/musicRoot.js";
import { createServer } from "../src/api/server.js";

// Covers the scan router (src/api/routes/scan.ts), which previously had zero HTTP-level
// test coverage. Every POST /api/scan call below is doubly guarded against ever touching
// the real filesystem/music root configured in this repo's .env: (1) it passes an explicit
// `rootPath` in the request body pointing at an `fs.mkdtempSync` scratch directory, and
// (2) `setMusicRootOverride(db, root)` is also called first in `beforeEach`, so even if the
// route's `rootPath` fallback (`getEffectiveMusicRoot`) were ever exercised, it would still
// resolve to the scratch directory rather than the real configured root.

describe("scan routes", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createServer>;
  let root: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-routes-test-"));
    setMusicRootOverride(db, root);
    app = createServer(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("GET /api/scan/last", () => {
    it("returns 404 with the expected error message on a fresh, empty DB", async () => {
      const res = await request(app).get("/api/scan/last");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "No scans have been run yet" });
    });

    it("agrees with the POST /api/scan response body for the most recent scan", async () => {
      const postRes = await request(app).post("/api/scan").send({ rootPath: root });
      expect(postRes.status).toBe(200);

      const getRes = await request(app).get("/api/scan/last");

      expect(getRes.status).toBe(200);
      expect(getRes.body).toEqual(postRes.body);
    });

    it("reflects the second scan, not the first, after two scans", async () => {
      const firstRes = await request(app).post("/api/scan").send({ rootPath: root });
      expect(firstRes.status).toBe(200);
      expect(firstRes.body.newFiles).toBe(0);

      // Add a file between the two scans so the second scan's stats are distinguishable
      // from the first's.
      fs.writeFileSync(path.join(root, "track.wav"), "audio-bytes");

      const secondRes = await request(app).post("/api/scan").send({ rootPath: root });
      expect(secondRes.status).toBe(200);
      expect(secondRes.body.newFiles).toBe(1);
      expect(secondRes.body.audioFilesFound).toBe(1);

      const getRes = await request(app).get("/api/scan/last");

      expect(getRes.status).toBe(200);
      expect(getRes.body).toEqual(secondRes.body);
      expect(getRes.body.newFiles).toBe(1);
      expect(getRes.body.audioFilesFound).toBe(1);
    });

    it("returns the full expected ScanStats field list with correct types", async () => {
      const postRes = await request(app).post("/api/scan").send({ rootPath: root });
      expect(postRes.status).toBe(200);

      const res = await request(app).get("/api/scan/last");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        rootPath: expect.any(String),
        startedAt: expect.any(String),
        finishedAt: expect.any(String),
        durationMs: expect.any(Number),
        foldersScanned: expect.any(Number),
        audioFilesFound: expect.any(Number),
        dawProjectsFound: expect.any(Number),
        newFiles: expect.any(Number),
        modifiedFiles: expect.any(Number),
        removedFiles: expect.any(Number),
        errors: expect.any(Array),
      });
      expect(res.body.rootPath).toBe(path.resolve(root));
    });
  });
});
