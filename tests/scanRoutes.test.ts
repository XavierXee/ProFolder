import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { setMusicRootOverride, getEffectiveMusicRoot } from "../src/config/musicRoot.js";
import { createServer } from "../src/api/server.js";
import { MacFinderService } from "../src/services/FinderService.js";
import { MacFolderPickerService } from "../src/services/FolderPickerService.js";
import { MacTrashService } from "../src/services/TrashService.js";
import { NodeFileOpsService } from "../src/services/FileOpsService.js";

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
    app = createServer(db, makeServerServices(db));
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

  describe("POST /api/scan rootPath containment", () => {
    it("accepts an explicit rootPath that matches the configured root (positive control)", async () => {
      const res = await request(app).post("/api/scan").send({ rootPath: root });

      expect(res.status).toBe(200);
      expect(res.body.rootPath).toBe(path.resolve(root));
    });

    it("accepts an explicit rootPath that is a subdirectory of the configured root", async () => {
      const sub = path.join(root, "subdir");
      fs.mkdirSync(sub);

      const res = await request(app).post("/api/scan").send({ rootPath: sub });

      expect(res.status).toBe(200);
      expect(res.body.rootPath).toBe(path.resolve(sub));
    });

    it("rejects a rootPath outside the configured root and never indexes it (security proof)", async () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), "scan-routes-outside-"));
      try {
        fs.writeFileSync(path.join(outside, "secret.wav"), "audio-bytes");

        const res = await request(app).post("/api/scan").send({ rootPath: outside });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "rootPath must be within the configured music root" });

        // Nothing from the out-of-root scan should have been persisted. The GET /api/scan/last
        // 404 already proves no scan_run row exists; this direct
        // audio_files count check adds stronger defense-in-depth against a future refactor that
        // decoupled the two writes (the file itself, "secret.wav", would never be indexed).
        const lastRes = await request(app).get("/api/scan/last");
        expect(lastRes.status).toBe(404);
        const { count } = db.prepare(`SELECT COUNT(*) AS count FROM audio_files`).get() as { count: number };
        expect(count).toBe(0);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    it("still runs a degraded scan with no rootPath when the configured root is unreadable (default-path regression guard)", async () => {
      fs.rmSync(root, { recursive: true, force: true });

      const res = await request(app).post("/api/scan").send({});

      expect(res.status).toBe(200);
      expect(res.body.foldersScanned).toBe(0);
      expect(res.body.errors.length).toBeGreaterThan(0);
    });

    it("rejects a non-string rootPath (number)", async () => {
      const res = await request(app).post("/api/scan").send({ rootPath: 123 });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "rootPath must be within the configured music root" });
    });

    it("rejects a non-string rootPath (array)", async () => {
      const res = await request(app).post("/api/scan").send({ rootPath: ["x"] });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "rootPath must be within the configured music root" });
    });
  });
});
