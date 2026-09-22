import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { insertAudioFile, findById } from "../src/database/repositories/audioFileRepository.js";
import { setMusicRootOverride } from "../src/config/musicRoot.js";
import { createServer } from "../src/api/server.js";

// The Copy/Move/Delete feature wires FileOpsService/
// TrashService + audioFileRepository's moveFile/cloneFile into the /api/files routes. This
// is an integration test — real filesystem operations under a scratch tmpdir, plus a real
// in-memory DB — proving the whole composed chain (route -> FileOpsService -> repository)
// actually works end to end, not just each layer in isolation (those already have their own
// dedicated unit tests: tests/fileOpsService.test.ts, tests/trashService.test.ts,
// tests/audioFileRepository.test.ts).
//
// DELETE routes compose MacTrashService, which shells out to `osascript` to ask Finder to
// move an item to the real macOS Trash. Actually invoking Finder here would be slow, flaky
// (requires Finder GUI + Automation permission), would leave real items in ~/.Trash that
// need "Full Disk Access" to clean up afterward (see tests/trashService.test.ts's own doc
// comment on this exact problem), and isn't portable off macOS at all. So — mirroring
// trashService.test.ts's own established pattern exactly — we keep the REAL MacTrashService
// class (constructed by the real createServer(db), not a hand-rolled stand-in) and only
// intercept its one point of OS interaction, node:child_process's execFile. The mock
// performs the real filesystem side effect a successful Finder trash would have (removing
// the source path from disk), so DELETE route tests still prove an actual, real removal —
// not just "trash() resolved".
const execFileMock = vi.hoisted(() =>
  vi.fn((_command: string, args: readonly string[], callback: (error: Error | null) => void) => {
    // args[1] is the AppleScript source MacTrashService builds (see TrashService.ts); it
    // always embeds the exact absolute path(s) passed to trash(), each wrapped as
    // `POSIX file "<escaped path>"`. Extract and physically remove each one, exactly like a
    // successful `osascript` invocation would have caused Finder to do.
    const script = String(args[1] ?? "");
    for (const m of script.matchAll(/POSIX file "((?:[^"\\]|\\.)*)"/g)) {
      const unescaped = m[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      fs.rmSync(unescaped, { recursive: true, force: true });
    }
    callback(null);
  })
);

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: (...args: Parameters<typeof actual.execFile>) =>
      // @ts-expect-error -- overload spread is fine for our call shape (command, args, callback)
      execFileMock(...args),
  };
});

/** Creates a real file on disk at `<root>/<relPath>` and a matching DB row, id = relPath
 * (matching the id convention deriveLocationFields/the scanner both use). */
function seedFile(db: Database.Database, root: string, relPath: string, content = "bytes") {
  const absPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  const now = new Date().toISOString();
  insertAudioFile(db, {
    id: relPath,
    path: absPath,
    relativePath: relPath,
    filename: path.basename(relPath),
    extension: path.extname(relPath),
    size: Buffer.byteLength(content),
    modifiedAt: now,
    containingFolder: path.dirname(absPath),
    firstSeenAt: now,
    lastSeenAt: now,
    isRemoved: false,
  });
  return findById(db, relPath)!;
}

describe("/api/files copy/move/delete routes", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createServer>;
  let root: string;

  beforeEach(() => {
    execFileMock.mockClear();
    execFileMock.mockImplementation((_cmd, args, callback) => {
      const script = String(args[1] ?? "");
      for (const m of script.matchAll(/POSIX file "((?:[^"\\]|\\.)*)"/g)) {
        const unescaped = m[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        fs.rmSync(unescaped, { recursive: true, force: true });
      }
      callback(null);
    });

    root = fs.mkdtempSync(path.join(os.tmpdir(), "file-ops-routes-test-"));
    db = new Database(":memory:");
    runMigrations(db);
    setMusicRootOverride(db, root);
    app = createServer(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("POST /:id/copy", () => {
    it("copies a file to destDir: 201, new DB row, both files present on disk, original untouched", async () => {
      seedFile(db, root, "kick.wav", "kick-bytes");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(destDir);

      const res = await request(app).post("/api/files/kick.wav/copy").send({ destDir });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("dest/kick.wav");
      expect(res.body.path).toBe(path.join(destDir, "kick.wav"));

      // Original untouched on disk and in DB.
      expect(fs.readFileSync(path.join(root, "kick.wav"), "utf8")).toBe("kick-bytes");
      expect(findById(db, "kick.wav")).toBeDefined();
      // New copy present on disk and in DB.
      expect(fs.readFileSync(path.join(destDir, "kick.wav"), "utf8")).toBe("kick-bytes");
      expect(findById(db, "dest/kick.wav")).toBeDefined();
    });

    it("returns 404 for an unknown id", async () => {
      const destDir = path.join(root, "dest");
      fs.mkdirSync(destDir);

      const res = await request(app).post("/api/files/GHOST/copy").send({ destDir });

      expect(res.status).toBe(404);
    });

    it("returns 400 when destDir resolves outside the configured music root", async () => {
      seedFile(db, root, "kick.wav");
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), "file-ops-routes-outside-"));

      try {
        const res = await request(app).post("/api/files/kick.wav/copy").send({ destDir: outside });

        expect(res.status).toBe(400);
        // Nothing was copied: no mutation happened before the rejection.
        expect(fs.readdirSync(outside)).toEqual([]);
        expect(findById(db, "kick.wav")).toBeDefined();
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  describe("POST /:id/move", () => {
    it("moves a file to destDir: 200, DB rekeyed, source gone from disk, destination present", async () => {
      seedFile(db, root, "kick.wav", "kick-bytes");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(destDir);

      const res = await request(app).post("/api/files/kick.wav/move").send({ destDir });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("dest/kick.wav");
      expect(res.body.path).toBe(path.join(destDir, "kick.wav"));

      expect(fs.existsSync(path.join(root, "kick.wav"))).toBe(false);
      expect(fs.readFileSync(path.join(destDir, "kick.wav"), "utf8")).toBe("kick-bytes");
      expect(findById(db, "kick.wav")).toBeUndefined();
      expect(findById(db, "dest/kick.wav")).toBeDefined();
    });

    it("returns 404 for an unknown id", async () => {
      const destDir = path.join(root, "dest");
      fs.mkdirSync(destDir);

      const res = await request(app).post("/api/files/GHOST/move").send({ destDir });

      expect(res.status).toBe(404);
    });

    it("returns 400 when destDir resolves outside the configured music root, leaving source untouched", async () => {
      seedFile(db, root, "kick.wav", "kick-bytes");
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), "file-ops-routes-outside-"));

      try {
        const res = await request(app).post("/api/files/kick.wav/move").send({ destDir: outside });

        expect(res.status).toBe(400);
        expect(fs.readFileSync(path.join(root, "kick.wav"), "utf8")).toBe("kick-bytes");
        expect(fs.readdirSync(outside)).toEqual([]);
        expect(findById(db, "kick.wav")).toBeDefined();
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    it("returns 409 on a name collision at the destination, leaving both source and destination untouched", async () => {
      seedFile(db, root, "kick.wav", "source-bytes");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(destDir);
      fs.writeFileSync(path.join(destDir, "kick.wav"), "preexisting-bytes");

      const res = await request(app).post("/api/files/kick.wav/move").send({ destDir });

      expect(res.status).toBe(409);
      expect(fs.readFileSync(path.join(root, "kick.wav"), "utf8")).toBe("source-bytes");
      expect(fs.readFileSync(path.join(destDir, "kick.wav"), "utf8")).toBe("preexisting-bytes");
      expect(findById(db, "kick.wav")).toBeDefined();
    });

    it("discoverably reports (not silently swallows) a physical-move-succeeded-but-DB-update-failed inconsistency", async () => {
      // Real, naturally-occurring DB constraint failure (no service mocking involved): seed
      // a "ghost" row whose id ALREADY equals the id the move's destination would compute
      // ("dest/kick.wav"), with no real file backing it. FileOpsService.movePath only checks
      // physical name collisions at the destination directory (fs.existsSync), so the
      // physical move succeeds — but audioFileRepository.moveFile's UPDATE then collides
      // with the ghost row's PRIMARY KEY, throwing a genuine SQLite UNIQUE constraint error.
      seedFile(db, root, "src/kick.wav", "kick-bytes");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(destDir);
      const now = new Date().toISOString();
      insertAudioFile(db, {
        id: "dest/kick.wav",
        path: "/nonexistent/ghost/path.wav",
        relativePath: "dest/kick.wav",
        filename: "kick.wav",
        extension: ".wav",
        size: 1,
        modifiedAt: now,
        containingFolder: "/nonexistent/ghost",
        firstSeenAt: now,
        lastSeenAt: now,
        isRemoved: false,
      });

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const res = await request(app).post("/api/files/src%2Fkick.wav/move").send({ destDir });

        expect(res.status).toBe(500);
        expect(res.body.code).toBe("MOVE_DB_SYNC_FAILED");
        expect(res.body.newPath).toBe(path.join(destDir, "kick.wav"));

        // The inconsistency is real: the file is ACTUALLY gone from its old physical
        // location and ACTUALLY present at the new one (the physical move truly succeeded)...
        expect(fs.existsSync(path.join(root, "src", "kick.wav"))).toBe(false);
        expect(fs.readFileSync(path.join(destDir, "kick.wav"), "utf8")).toBe("kick-bytes");
        // ...yet the DB was NOT silently updated to a wrong/corrupted state: the transaction
        // in moveFile rolled back entirely, so the OLD row is untouched (still findable at
        // its old id/path, which no longer exists on disk) rather than showing a bogus
        // half-applied value.
        const staleRow = findById(db, "src/kick.wav");
        expect(staleRow).toBeDefined();
        expect(staleRow!.path).toBe(path.join(root, "src", "kick.wav"));

        // Discoverable server-side too: logged loudly, not swallowed.
        expect(consoleErrorSpy).toHaveBeenCalled();
        const logged = consoleErrorSpy.mock.calls.map((c) => String(c[0])).join("\n");
        expect(logged).toContain("src/kick.wav");
        expect(logged).toContain(path.join(destDir, "kick.wav"));
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe("DELETE /:id", () => {
    it("trashes a file: 200, gone from disk, marked removed in the DB", async () => {
      seedFile(db, root, "kick.wav", "kick-bytes");

      const res = await request(app).delete("/api/files/kick.wav");

      expect(res.status).toBe(200);
      expect(fs.existsSync(path.join(root, "kick.wav"))).toBe(false);
      const file = findById(db, "kick.wav");
      expect(file).toBeDefined();
      expect(file!.isRemoved).toBe(true);
      expect(execFileMock).toHaveBeenCalledTimes(1);
    });

    it("returns 404 for an unknown id", async () => {
      const res = await request(app).delete("/api/files/GHOST");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /batch/copy", () => {
    it("processes each id independently: partial failure doesn't roll back the successful items", async () => {
      seedFile(db, root, "kick.wav", "kick-bytes");
      seedFile(db, root, "snare.wav", "snare-bytes");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(destDir);

      const res = await request(app)
        .post("/api/files/batch/copy")
        .send({ ids: ["kick.wav", "GHOST", "snare.wav"], destDir });

      expect(res.status).toBe(200);
      expect(res.body.succeeded.sort()).toEqual(["kick.wav", "snare.wav"]);
      expect(res.body.failed).toEqual([{ id: "GHOST", error: "File not found" }]);

      expect(fs.readFileSync(path.join(destDir, "kick.wav"), "utf8")).toBe("kick-bytes");
      expect(fs.readFileSync(path.join(destDir, "snare.wav"), "utf8")).toBe("snare-bytes");
      expect(findById(db, "dest/kick.wav")).toBeDefined();
      expect(findById(db, "dest/snare.wav")).toBeDefined();
      // Originals untouched (copy, not move).
      expect(fs.existsSync(path.join(root, "kick.wav"))).toBe(true);
      expect(fs.existsSync(path.join(root, "snare.wav"))).toBe(true);
    });
  });

  describe("POST /batch/move", () => {
    it("processes each id independently: a real filesystem failure (name collision) for one item doesn't roll back the others", async () => {
      seedFile(db, root, "kick.wav", "kick-bytes");
      seedFile(db, root, "snare.wav", "snare-bytes");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(destDir);
      // Pre-existing collision only for snare.wav.
      fs.writeFileSync(path.join(destDir, "snare.wav"), "preexisting-bytes");

      const res = await request(app)
        .post("/api/files/batch/move")
        .send({ ids: ["kick.wav", "snare.wav"], destDir });

      expect(res.status).toBe(200);
      expect(res.body.succeeded).toEqual(["kick.wav"]);
      expect(res.body.failed).toHaveLength(1);
      expect(res.body.failed[0].id).toBe("snare.wav");

      // kick.wav genuinely moved.
      expect(fs.existsSync(path.join(root, "kick.wav"))).toBe(false);
      expect(fs.readFileSync(path.join(destDir, "kick.wav"), "utf8")).toBe("kick-bytes");
      expect(findById(db, "dest/kick.wav")).toBeDefined();
      // snare.wav untouched by the collision failure (both source and preexisting dest intact).
      expect(fs.readFileSync(path.join(root, "snare.wav"), "utf8")).toBe("snare-bytes");
      expect(fs.readFileSync(path.join(destDir, "snare.wav"), "utf8")).toBe("preexisting-bytes");
      expect(findById(db, "snare.wav")).toBeDefined();
    });
  });

  describe("DELETE /batch", () => {
    it("processes each id independently: partial failure doesn't roll back the successful items", async () => {
      seedFile(db, root, "kick.wav", "kick-bytes");
      seedFile(db, root, "snare.wav", "snare-bytes");

      const res = await request(app)
        .delete("/api/files/batch")
        .send({ ids: ["kick.wav", "GHOST", "snare.wav"] });

      expect(res.status).toBe(200);
      expect(res.body.succeeded.sort()).toEqual(["kick.wav", "snare.wav"]);
      expect(res.body.failed).toEqual([{ id: "GHOST", error: "File not found" }]);

      expect(fs.existsSync(path.join(root, "kick.wav"))).toBe(false);
      expect(fs.existsSync(path.join(root, "snare.wav"))).toBe(false);
      expect(findById(db, "kick.wav")!.isRemoved).toBe(true);
      expect(findById(db, "snare.wav")!.isRemoved).toBe(true);
    });
  });
});
