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

    // FinderService.revealInFinder throws for out-of-root paths; the route has no
    // dedicated catch for that, so it falls through to the app's generic JSON error
    // middleware (500) rather than a 4xx — this asserts the guard actually fires and
    // execFile ("open -R") is never reached, not any particular status code choice.
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/outside the configured music root/);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("refuses a sibling path that merely shares the root as a string prefix", async () => {
    const evilSibling = `${root}Evil`;
    const res = await request(app).post("/api/reveal").send({ path: evilSibling });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/outside the configured music root/);
    expect(execFileMock).not.toHaveBeenCalled();
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
