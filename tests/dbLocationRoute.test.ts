import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { createServer, type ServerServices } from "../src/api/server.js";
import { MacFinderService } from "../src/services/FinderService.js";
import { MacFolderPickerService } from "../src/services/FolderPickerService.js";
import { MacTrashService } from "../src/services/TrashService.js";
import { NodeFileOpsService } from "../src/services/FileOpsService.js";
import { getEffectiveMusicRoot } from "../src/config/musicRoot.js";
import { getDbPathOverride } from "../src/config/desktopPrefs.js";

// createServer now takes its platform services as explicit DI params instead of constructing
// them internally (see src/api/server.ts). This helper constructs the same real Mac* classes
// the plain web-mode entrypoint uses, matching this repo's other route tests' pre-refactor
// behavior — with an explicit `runtimeMode` override, since this file specifically exercises
// the web-vs-desktop gating that Task 15 introduced.
function makeServerServices(
  db: Database.Database,
  overrides: Partial<ServerServices> = {}
): ServerServices {
  return {
    finderService: new MacFinderService(() => getEffectiveMusicRoot(db)),
    folderPickerService: new MacFolderPickerService(),
    trashService: new MacTrashService(() => getEffectiveMusicRoot(db)),
    fileOpsService: new NodeFileOpsService(() => getEffectiveMusicRoot(db)),
    runtimeMode: "web",
    ...overrides,
  };
}

/** Creates a real, structurally-valid, non-empty SQLite database file at `filePath` — used by
 * every "PUT with a valid path" test below, since `PUT /db-location` now trial-opens the target
 * with better-sqlite3 before persisting the override (the Auditor-flagged self-lockout footgun
 * fix), so a bare nonexistent path or arbitrary file content is no longer accepted as "valid".
 * Deliberately creates a table (not just an untouched `new Database()`) — a brand-new, empty
 * SQLite file has zero pages, which `assertDbFileIsOpenable` now rejects as a placeholder/
 * empty-database footgun in its own right (see the dedicated zero-byte-file test below), so an
 * empty fixture here would no longer count as "valid" either. */
function createValidSqliteFile(filePath: string): void {
  const db = new Database(filePath);
  db.exec("CREATE TABLE t (id INTEGER)");
  db.close();
}

describe("GET /api/config — runtimeMode", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it("reports runtimeMode: \"web\" for a web-mode-shaped services object", async () => {
    const app = createServer(db, makeServerServices(db, { runtimeMode: "web" }));

    const res = await request(app).get("/api/config");

    expect(res.status).toBe(200);
    expect(res.body.runtimeMode).toBe("web");
  });

  it("reports runtimeMode: \"desktop\" for a desktop-mode-shaped services object", async () => {
    const app = createServer(db, makeServerServices(db, { runtimeMode: "desktop" }));

    const res = await request(app).get("/api/config");

    expect(res.status).toBe(200);
    expect(res.body.runtimeMode).toBe("desktop");
  });
});

describe("GET/PUT /api/config/db-location", () => {
  let db: Database.Database;
  let tmpDir: string;
  let prefsFilePath: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "db-location-route-test-"));
    prefsFilePath = path.join(tmpDir, "desktop-prefs.json");
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("web mode", () => {
    it("GET returns 400 with a clear error, not the current DB path", async () => {
      const app = createServer(db, makeServerServices(db, { runtimeMode: "web" }));

      const res = await request(app).get("/api/config/db-location");

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/only available in desktop mode/);
    });

    it("PUT returns 400 with a clear error and never touches setDbPathOverride/relaunchApp", async () => {
      const relaunchApp = vi.fn();
      const app = createServer(
        db,
        makeServerServices(db, { runtimeMode: "web", dbPrefsFilePath: prefsFilePath, relaunchApp })
      );

      const res = await request(app)
        .put("/api/config/db-location")
        .send({ dbPath: path.join(tmpDir, "library.db") });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/only available in desktop mode/);
      expect(relaunchApp).not.toHaveBeenCalled();
      expect(fs.existsSync(prefsFilePath)).toBe(false);
    });

    it("POST /choose returns 400 with a clear error and never calls chooseDbFile", async () => {
      const chooseDbFile = vi.fn();
      const app = createServer(
        db,
        makeServerServices(db, { runtimeMode: "web", dbFilePickerService: { chooseDbFile } })
      );

      const res = await request(app).post("/api/config/db-location/choose");

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/only available in desktop mode/);
      expect(chooseDbFile).not.toHaveBeenCalled();
    });
  });

  describe("desktop mode", () => {
    it("GET returns the current effective DB path", async () => {
      const app = createServer(db, makeServerServices(db, { runtimeMode: "desktop" }));

      const res = await request(app).get("/api/config/db-location");

      expect(res.status).toBe(200);
      expect(typeof res.body.dbPath).toBe("string");
      expect(res.body.dbPath.length).toBeGreaterThan(0);
    });

    it("PUT with a valid path persists the override and calls relaunchApp, without ever touching `db` (no hot handle swap)", async () => {
      const relaunchApp = vi.fn();
      const app = createServer(
        db,
        makeServerServices(db, { runtimeMode: "desktop", dbPrefsFilePath: prefsFilePath, relaunchApp })
      );
      const newDbPath = path.join(tmpDir, "new-library.db");
      createValidSqliteFile(newDbPath);

      const res = await request(app).put("/api/config/db-location").send({ dbPath: newDbPath });

      expect(res.status).toBe(200);
      expect(res.body.dbPath).toBe(newDbPath);
      expect(getDbPathOverride(prefsFilePath)).toBe(newDbPath);
      expect(relaunchApp).toHaveBeenCalledTimes(1);
      // The route's own doc comment states it never attempts a hot DB-handle swap — the best a
      // black-box HTTP test can do to corroborate that is confirm the in-memory `db` handle used
      // to build this very `app` is still open and queryable after the PUT, i.e. nothing in the
      // route closed/reopened/reassigned it.
      expect(() => db.prepare("SELECT 1").get()).not.toThrow();
    });

    it("relaunchApp is only invoked via the response's own \"finish\" event, not synchronously as soon as the route handler runs (regression test for the res.once(\"finish\", ...) deferral)", async () => {
      // A plain `expect(relaunchApp).toHaveBeenCalledTimes(1)` after `await request(app)...`
      // CANNOT distinguish "relaunchApp() called synchronously right after res.json()" from
      // "relaunchApp() deferred to the response's own 'finish' event" — supertest's promise
      // resolves once the client has received the response either way, and a synchronously-
      // called mock has already run by then too.
      //
      // Two more direct approaches were tried and rejected while writing this test (documented
      // here so a future reader doesn't re-attempt them expecting they'll work):
      //  - Checking `res.writableFinished` inside the relaunchApp spy: empirically unreliable —
      //    for a payload this small over loopback, Node flips `writableFinished` to `true`
      //    synchronously right after `res.end()`, so even the OLD buggy code would read `true`.
      //  - Checking a synchronous checkpoint right after `app(req, res)` returns (relying on
      //    `asyncHandler`'s non-awaited call executing the whole handler body in one synchronous
      //    tick): unreliable here too — this route sits behind `express.json()` body-parsing
      //    middleware, which must wait for the request body's stream `data`/`end` events before
      //    ever invoking the route handler, so the handler runs on a LATER tick than the initial
      //    `app(req, res)` call regardless of whether relaunchApp is synchronous or deferred.
      //
      // What IS deterministic: this test creates its own real `http.Server` (rather than letting
      // supertest build one implicitly from the bare Express app) and attaches its OWN
      // `res.once("finish", ...)` listener on the `"request"` event — i.e. before Express (and
      // therefore the route handler) has even started processing the request. Event listeners on
      // the same EventEmitter fire in registration order, so when the real "finish" event
      // eventually fires, THIS test's listener is guaranteed to run before the route's own
      // `res.once("finish", () => relaunchApp())` listener (registered later, whenever the route
      // handler actually executes) — regardless of body-parsing timing. Under the fixed code,
      // relaunchApp has therefore NOT been called yet when this test's own finish listener runs
      // (0), and IS called once the route's own listener runs immediately after (1, by the time
      // the whole response has been received). Under the old buggy code, relaunchApp already ran
      // synchronously as soon as the route handler executed — long before "finish" — so this
      // test's finish listener would see it already called (1, not 0), failing the assertion.
      let relaunchAppCallCountWhenOurFinishListenerRuns: number | undefined;
      const relaunchApp = vi.fn();
      const app = createServer(
        db,
        makeServerServices(db, { runtimeMode: "desktop", dbPrefsFilePath: prefsFilePath, relaunchApp })
      );
      const server = http.createServer(app);
      server.on("request", (_req, res) => {
        res.once("finish", () => {
          relaunchAppCallCountWhenOurFinishListenerRuns = relaunchApp.mock.calls.length;
        });
      });
      const newDbPath = path.join(tmpDir, "ordering-test.db");
      createValidSqliteFile(newDbPath);

      const res = await request(server).put("/api/config/db-location").send({ dbPath: newDbPath });

      expect(res.status).toBe(200);
      // Not yet called when our (earlier-registered) finish listener runs...
      expect(relaunchAppCallCountWhenOurFinishListenerRuns).toBe(0);
      // ...but it IS eventually called, via the route's own later-registered finish listener.
      expect(relaunchApp).toHaveBeenCalledTimes(1);
    });

    it("PUT with a path whose parent dir doesn't exist (and thus the file itself doesn't exist) returns 400 from the trial-open check, before ever reaching setDbPathOverride's own parent-dir validation, and does not call relaunchApp", async () => {
      // Historical note: before the trial-open guard was added, this exact scenario was
      // rejected by `setDbPathOverride`'s own "parent directory does not exist" check instead —
      // that check still exists and still matters for OTHER callers of `setDbPathOverride`, but
      // for this route it's now unreachable in practice, since a nonexistent parent dir implies
      // the target file itself doesn't exist either, and `assertDbFileIsOpenable` (which now
      // runs first) rejects that uniformly with every other "file doesn't exist" case.
      const relaunchApp = vi.fn();
      const app = createServer(
        db,
        makeServerServices(db, { runtimeMode: "desktop", dbPrefsFilePath: prefsFilePath, relaunchApp })
      );
      const invalidDbPath = path.join(tmpDir, "does-not-exist", "library.db");

      const res = await request(app).put("/api/config/db-location").send({ dbPath: invalidDbPath });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a usable SQLite database file/);
      expect(relaunchApp).not.toHaveBeenCalled();
      expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
    });

    it("PUT with a path to a file that simply doesn't exist yet (parent dir DOES exist) returns 400 — a not-yet-existing target is never accepted, even though better-sqlite3 could silently create one", async () => {
      // Deliberate policy call (documented in assertDbFileIsOpenable's own doc comment):
      // ElectronDbFilePickerService's native dialog only ever offers `properties: ["openFile"]`,
      // so the only path a real user can produce through this route's actual UI is an
      // already-existing file. Accepting "doesn't exist yet" here would silently create a brand
      // new, empty database at a typo'd path instead of rejecting it up front.
      const relaunchApp = vi.fn();
      const app = createServer(
        db,
        makeServerServices(db, { runtimeMode: "desktop", dbPrefsFilePath: prefsFilePath, relaunchApp })
      );
      const notYetExistingPath = path.join(tmpDir, "not-created-yet.db");
      expect(fs.existsSync(notYetExistingPath)).toBe(false);

      const res = await request(app).put("/api/config/db-location").send({ dbPath: notYetExistingPath });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a usable SQLite database file/);
      expect(relaunchApp).not.toHaveBeenCalled();
      expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
      // Confirms the rejection didn't have the very side effect it's meant to prevent.
      expect(fs.existsSync(notYetExistingPath)).toBe(false);
    });

    it("PUT with a path to an existing file that is NOT a real SQLite database (garbage content, e.g. a mis-picked non-.db file with a misleading extension) returns 400 and does not persist/relaunch", async () => {
      const relaunchApp = vi.fn();
      const app = createServer(
        db,
        makeServerServices(db, { runtimeMode: "desktop", dbPrefsFilePath: prefsFilePath, relaunchApp })
      );
      const notARealDbPath = path.join(tmpDir, "not-a-real-database.db");
      fs.writeFileSync(notARealDbPath, "this is plain text, not a SQLite database file", "utf8");

      const res = await request(app).put("/api/config/db-location").send({ dbPath: notARealDbPath });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a usable SQLite database file/);
      expect(relaunchApp).not.toHaveBeenCalled();
      expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
    });

    it("PUT with a path to an existing, zero-byte placeholder file returns 400 and does not persist/relaunch (SQLite treats an empty file as a trivially valid empty database, but accepting it would silently point the app at an empty library)", async () => {
      const relaunchApp = vi.fn();
      const app = createServer(
        db,
        makeServerServices(db, { runtimeMode: "desktop", dbPrefsFilePath: prefsFilePath, relaunchApp })
      );
      const emptyPlaceholderPath = path.join(tmpDir, "empty-placeholder.db");
      fs.writeFileSync(emptyPlaceholderPath, "");
      expect(fs.statSync(emptyPlaceholderPath).size).toBe(0);

      const res = await request(app).put("/api/config/db-location").send({ dbPath: emptyPlaceholderPath });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a usable SQLite database file/);
      expect(relaunchApp).not.toHaveBeenCalled();
      expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
    });

    it("PUT with a path to a structurally corrupted file (integrity_check reports an error via its RETURNED rows rather than throwing) returns 400 and does not persist/relaunch", async () => {
      // Mirrors desktopPrefs.test.ts's own direct-unit-test repro of the same corruption class:
      // PRAGMA integrity_check is a diagnostic query, not an assertion — for corruption that's
      // readable at the raw byte level but structurally invalid, it returns descriptive error
      // text as its result rows instead of throwing a JS exception, and page_count still reports
      // a healthy value (the corruption doesn't affect the page count itself). A version of
      // assertDbFileIsOpenable that only relied on the pragma throwing (or on page_count alone)
      // would silently accept this file.
      const relaunchApp = vi.fn();
      const app = createServer(
        db,
        makeServerServices(db, { runtimeMode: "desktop", dbPrefsFilePath: prefsFilePath, relaunchApp })
      );
      const corruptedDbPath = path.join(tmpDir, "corrupted.db");
      const corruptDb = new Database(corruptedDbPath);
      corruptDb.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)");
      const insert = corruptDb.prepare("INSERT INTO t (val) VALUES (?)");
      for (let i = 0; i < 50; i++) {
        insert.run("padding padding padding padding padding " + i);
      }
      corruptDb.close();

      // Corrupt exactly one cell pointer in page 2's cell pointer array (page size defaults to
      // 4096 bytes; the array starts 8 bytes into a leaf table b-tree page's header) so it points
      // at an out-of-range offset — identical, deterministic repro to desktopPrefs.test.ts's own.
      const buf = fs.readFileSync(corruptedDbPath);
      const pageSize = 4096;
      const cellPtrArrayStart = pageSize + 8;
      buf[cellPtrArrayStart + 4] = 0x10;
      buf[cellPtrArrayStart + 5] = 0x00;
      fs.writeFileSync(corruptedDbPath, buf);

      const res = await request(app).put("/api/config/db-location").send({ dbPath: corruptedDbPath });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a usable SQLite database file/);
      expect(relaunchApp).not.toHaveBeenCalled();
      expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
    });

    it("PUT with a missing dbPath in the body returns 400 and does not call relaunchApp", async () => {
      const relaunchApp = vi.fn();
      const app = createServer(
        db,
        makeServerServices(db, { runtimeMode: "desktop", dbPrefsFilePath: prefsFilePath, relaunchApp })
      );

      const res = await request(app).put("/api/config/db-location").send({});

      expect(res.status).toBe(400);
      expect(relaunchApp).not.toHaveBeenCalled();
    });

    it("POST /choose calls dbFilePickerService.chooseDbFile and returns its result as { path }", async () => {
      const chooseDbFile = vi.fn().mockResolvedValue("/Users/test/Music/library.db");
      const app = createServer(
        db,
        makeServerServices(db, { runtimeMode: "desktop", dbFilePickerService: { chooseDbFile } })
      );

      const res = await request(app).post("/api/config/db-location/choose");

      expect(res.status).toBe(200);
      expect(chooseDbFile).toHaveBeenCalledTimes(1);
      expect(chooseDbFile).toHaveBeenCalledWith(expect.any(String));
      expect(res.body).toEqual({ path: "/Users/test/Music/library.db" });
    });

    it("POST /choose returns { path: undefined } when the user cancels, matching the existing music-root/choose contract — and does NOT call setDbPathOverride/relaunchApp itself", async () => {
      const chooseDbFile = vi.fn().mockResolvedValue(undefined);
      const relaunchApp = vi.fn();
      const app = createServer(
        db,
        makeServerServices(db, {
          runtimeMode: "desktop",
          dbFilePickerService: { chooseDbFile },
          dbPrefsFilePath: prefsFilePath,
          relaunchApp,
        })
      );

      const res = await request(app).post("/api/config/db-location/choose");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ path: undefined });
      expect(relaunchApp).not.toHaveBeenCalled();
      expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
    });
  });
});
