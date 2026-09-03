import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { insertAudioFile, type AudioFileUpsertInput } from "../src/database/repositories/audioFileRepository.js";
import { setMusicRootOverride } from "../src/config/musicRoot.js";
import { createServer } from "../src/api/server.js";

// Covers docs/REQUIREMENTS.md §11.5: "The audio-streaming endpoint only ever serves the
// path stored in the database for that file id (populated exclusively by the scanner) —
// it cannot be used to read arbitrary paths from the request." Unlike the §13.4
// reveal-in-finder guard (tests/finderService.test.ts, tests/revealRoute.test.ts), this
// route takes no request-supplied filesystem path at all — the only client-controlled
// input is the opaque `:id` route param, used solely as a SQL lookup key. So the
// "traversal" case here proves that a path-shaped `:id` can't be turned into filesystem
// access (it simply fails to match any row), rather than a resolved-path prefix check.
//
// The route does, however, still apply the same resolved-path-vs-root containment check
// as /api/reveal (via FinderService's shared `isWithinRoot`) as defense-in-depth against
// a DB row whose `path` was somehow populated outside the configured music root — see
// the "refuses to stream a file whose DB path is outside..." test below.

function makeFile(overrides: Partial<AudioFileUpsertInput> & { id: string; path: string }): AudioFileUpsertInput {
  const now = new Date().toISOString();
  return {
    relativePath: overrides.id,
    filename: overrides.id,
    extension: ".wav",
    size: 100,
    modifiedAt: now,
    containingFolder: "/Music",
    firstSeenAt: now,
    lastSeenAt: now,
    isRemoved: false,
    ...overrides,
  };
}

describe("GET /api/files/:id/audio", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createServer>;
  let root: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    root = fs.mkdtempSync(path.join(os.tmpdir(), "audio-stream-route-test-"));
    setMusicRootOverride(db, root);
    app = createServer(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("streams a legitimate in-root file's bytes for a valid id", async () => {
    const filePath = path.join(root, "track.wav");
    const content = "RIFF-fake-wav-bytes";
    fs.writeFileSync(filePath, content);
    insertAudioFile(db, makeFile({ id: "file-1", path: filePath }));

    const res = await request(app).get("/api/files/file-1/audio");

    expect(res.status).toBe(200);
    // .wav gets a binary Content-Type, so superagent buffers it into res.body (a Buffer)
    // rather than populating res.text (which is only for text/* responses).
    expect(Buffer.from(res.body).toString()).toBe(content);
  });

  it("supports Range requests for an in-root file (used for <audio> seeking)", async () => {
    const filePath = path.join(root, "track.wav");
    const content = "0123456789";
    fs.writeFileSync(filePath, content);
    insertAudioFile(db, makeFile({ id: "file-range", path: filePath }));

    const res = await request(app).get("/api/files/file-range/audio").set("Range", "bytes=2-5");

    expect(res.status).toBe(206);
    expect(Buffer.from(res.body).toString()).toBe("2345");
  });

  it("returns 404 (not 200, not a crash) for an id that doesn't exist, even when the id is shaped like a traversal path", async () => {
    const traversalId = encodeURIComponent("../../../../etc/passwd");

    const res = await request(app).get(`/api/files/${traversalId}/audio`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });

  it("returns 404 for an id shaped like an absolute filesystem path", async () => {
    const absoluteId = encodeURIComponent("/etc/passwd");

    const res = await request(app).get(`/api/files/${absoluteId}/audio`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });

  it("never reads or leaks file content for a nonexistent id, regardless of query-string tricks", async () => {
    // Confirms the route doesn't fall back to any request-supplied path (e.g. a query
    // param) when the id lookup misses — the response must be the plain 404 JSON error,
    // never file content.
    const res = await request(app).get("/api/files/does-not-exist/audio").query({ path: "/etc/passwd" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });

  it("refuses to stream a file whose DB path is outside the configured music root", async () => {
    // Regression guard for the gap a Tester proved exploitable: today the scanner is the
    // only writer of audio_files.path, but if a row is ever populated with an out-of-root
    // path, the route must not serve it. Same 404 shape as the id-miss case, so the
    // response doesn't reveal *why* it failed.
    insertAudioFile(db, makeFile({ id: "escaped-file", path: "/etc/passwd" }));

    const res = await request(app).get("/api/files/escaped-file/audio");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });

  it("refuses to stream a symlink that lives inside the root but points at a file outside it", async () => {
    // Regression guard for an Auditor-found gap: the scanner (src/scanner/walk.ts) walks
    // symlinks and stores the symlink's own (in-root) path in the DB. A naive lexical
    // containment check (path.resolve/startsWith) passes for that path even though
    // res.sendFile follows the symlink at the OS level and streams the real target's
    // content, which may live entirely outside the configured music root. isWithinRoot
    // must resolve the real (symlink-dereferenced) path before comparing.
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-stream-route-outside-"));
    const secretPath = path.join(outsideDir, "id_rsa");
    const secretContent = "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----";
    fs.writeFileSync(secretPath, secretContent);
    const symlinkPath = path.join(root, "totally-a-track.wav");
    fs.symlinkSync(secretPath, symlinkPath);
    insertAudioFile(db, makeFile({ id: "symlinked-file", path: symlinkPath }));

    try {
      const res = await request(app).get("/api/files/symlinked-file/audio");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "File not found" });
      expect(res.text ?? "").not.toContain("BEGIN OPENSSH");
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
