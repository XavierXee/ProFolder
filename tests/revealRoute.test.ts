import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(
    (_command: string, _args: string[], callback: (error: Error | null) => void) => {
      callback(null);
    }
  ),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { runMigrations } from "../src/database/db.js";
import { setMusicRootOverride } from "../src/config/musicRoot.js";
import { createServer } from "../src/api/server.js";

describe("POST /api/reveal", () => {
  let db: Database.Database;
  let root: string;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    execFileMock.mockClear();
    db = new Database(":memory:");
    runMigrations(db);
    root = fs.mkdtempSync(path.join(os.tmpdir(), "reveal-route-test-"));
    setMusicRootOverride(db, root);
    app = createServer(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns 400 when no path is given", async () => {
    const res = await request(app).post("/api/reveal").send({});

    expect(res.status).toBe(400);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("refuses a path outside the configured music root", async () => {
    const res = await request(app).post("/api/reveal").send({ path: "/etc/passwd" });

    // FinderService.revealInFinder throws PathOutsideRootError for out-of-root paths; the
    // route catches that specifically and collapses it into the same generic 404 shape the
    // audio-stream route uses, rather than letting it fall through to the app's generic
    // JSON error middleware (500) with the specific containment-failure reason attached.
    // This deliberately avoids confirming *why* the reveal failed.
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("refuses a sibling path that merely shares the root as a string prefix", async () => {
    const evilSibling = `${root}Evil`;
    const res = await request(app).post("/api/reveal").send({ path: evilSibling });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("still returns a generic 500 for a genuine (non-containment) revealInFinder failure", async () => {
    execFileMock.mockImplementationOnce((_cmd, _args, callback) => callback(new Error("boom")));
    const innerDir = path.join(root, "Song");
    fs.mkdirSync(innerDir, { recursive: true });
    const innerPath = path.join(innerDir, "track.als");
    fs.writeFileSync(innerPath, "");

    const res = await request(app).post("/api/reveal").send({ path: innerPath });

    // Confirms the new try/catch only intercepts PathOutsideRootError and rethrows
    // everything else (e.g. a real `open -R` / execFile failure) unchanged, so it still
    // reaches the app's generic error middleware as before.
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/boom/);
  });

  it("succeeds for a path inside the configured music root", async () => {
    const innerDir = path.join(root, "Song");
    fs.mkdirSync(innerDir, { recursive: true });
    const innerPath = path.join(innerDir, "track.als");
    fs.writeFileSync(innerPath, "");

    const res = await request(app).post("/api/reveal").send({ path: innerPath });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(execFileMock).toHaveBeenCalledWith("open", ["-R", innerPath], expect.any(Function));
  });
});
