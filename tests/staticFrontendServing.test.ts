import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

// Task 2 of the "prerequisite fixes for desktop-app packaging" cycle: server.ts previously
// had zero static-file serving, so `npm run build`'s frontend output (dist/frontend) was
// never actually servable as a single deployable unit — only `npm run dev`'s separate
// Vite-dev-server-with-proxy path was ever exercised. This file exercises the new
// `express.static` + guarded `GET /` route added to `createServer`, using the
// FRONTEND_DIST_PATH env var (added in server.ts alongside this feature, mirroring
// config.ts's existing MUSIC_ROOT/DB_PATH env-override convention) to point each test at an
// isolated real temp directory instead of the real repo-relative dist/frontend — this keeps
// the "doesn't exist" scenario below independent of whether a real `npm run build:frontend`
// has ever been run against this checkout, and avoids interfering with (or depending on)
// real build artifacts.

describe("static frontend serving", () => {
  let db: Database.Database;
  let frontendDistRoot: string;
  const originalFrontendDistPath = process.env.FRONTEND_DIST_PATH;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    frontendDistRoot = fs.mkdtempSync(path.join(os.tmpdir(), "static-frontend-serving-test-"));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(frontendDistRoot, { recursive: true, force: true });
    if (originalFrontendDistPath === undefined) {
      delete process.env.FRONTEND_DIST_PATH;
    } else {
      process.env.FRONTEND_DIST_PATH = originalFrontendDistPath;
    }
  });

  describe("when dist/frontend does not exist (e.g. npm run dev / npm run test:backend, no build run)", () => {
    beforeEach(() => {
      // frontendDistRoot itself exists (mkdtempSync creates it) but nothing was ever
      // written into it — points FRONTEND_DIST_PATH at a real, empty temp dir, distinct
      // from "the path doesn't exist at all" but exercising the same "no index.html to
      // serve" guard, plus a sibling case below for the path itself being entirely absent.
      process.env.FRONTEND_DIST_PATH = frontendDistRoot;
    });

    it("GET / does not crash and returns a plain 404, not a false-positive 200", async () => {
      const app = createServer(db, makeServerServices(db));

      const res = await request(app).get("/");

      // A 404 here proves the fs.existsSync guard took the "skip" branch (calling next()
      // rather than throwing or attempting to sendFile a nonexistent path, which would
      // otherwise crash the request with a 500) and that no other route intercepted "/".
      expect(res.status).toBe(404);
    });

    it("GET / still returns a plain 404 when the configured dist path doesn't exist on disk at all", async () => {
      process.env.FRONTEND_DIST_PATH = path.join(frontendDistRoot, "does-not-exist-at-all");
      const app = createServer(db, makeServerServices(db));

      const res = await request(app).get("/");

      expect(res.status).toBe(404);
    });

    it("GET /api/config still works correctly with no dist/frontend present", async () => {
      const app = createServer(db, makeServerServices(db));

      const res = await request(app).get("/api/config");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("musicRoot");
    });
  });

  describe("when a real dist/frontend/index.html and a real static asset exist", () => {
    const indexHtml = "<!doctype html><html><body>built frontend</body></html>";
    const assetContent = "body { color: red; }";

    beforeEach(() => {
      fs.writeFileSync(path.join(frontendDistRoot, "index.html"), indexHtml);
      fs.mkdirSync(path.join(frontendDistRoot, "assets"), { recursive: true });
      fs.writeFileSync(path.join(frontendDistRoot, "assets", "style.css"), assetContent);
      process.env.FRONTEND_DIST_PATH = frontendDistRoot;
    });

    it("GET / returns 200 with the built index.html content", async () => {
      const app = createServer(db, makeServerServices(db));

      const res = await request(app).get("/");

      expect(res.status).toBe(200);
      expect(res.text).toBe(indexHtml);
    });

    it("GET /assets/<file> returns 200 with the correct static file content", async () => {
      const app = createServer(db, makeServerServices(db));

      const res = await request(app).get("/assets/style.css");

      expect(res.status).toBe(200);
      expect(res.text).toBe(assetContent);
    });

    it("GET /api/config still works correctly with dist/frontend present (proves /api/* isn't shadowed by static serving)", async () => {
      const app = createServer(db, makeServerServices(db));

      const res = await request(app).get("/api/config");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("musicRoot");
    });

    it("GET /api/config returns real JSON, not the built index.html (proves route order/scoping, not just a status code coincidence)", async () => {
      const app = createServer(db, makeServerServices(db));

      const res = await request(app).get("/api/config");

      expect(res.text).not.toBe(indexHtml);
      expect(res.headers["content-type"]).toMatch(/json/);
    });
  });
});
