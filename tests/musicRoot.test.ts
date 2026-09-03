import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { config } from "../src/config/config.js";
import { getEffectiveMusicRoot, setMusicRootOverride } from "../src/config/musicRoot.js";
import { getExcludedPaths, setExcludedPaths } from "../src/database/repositories/scanExclusionRepository.js";

let db: Database.Database;
let tmpDir: string;

beforeEach(async () => {
  db = new Database(":memory:");
  runMigrations(db);
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "music-root-test-"));
});

afterEach(async () => {
  db.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("getEffectiveMusicRoot", () => {
  it("falls back to the .env/CLI default when no override is saved", () => {
    expect(getEffectiveMusicRoot(db)).toBe(config.musicRoot);
  });

  it("returns the saved override once one is set", () => {
    setMusicRootOverride(db, tmpDir);
    expect(getEffectiveMusicRoot(db)).toBe(path.resolve(tmpDir));
  });
});

describe("setMusicRootOverride", () => {
  it("persists a resolved absolute path for a valid directory", () => {
    const resolved = setMusicRootOverride(db, tmpDir);
    expect(resolved).toBe(path.resolve(tmpDir));
    expect(getEffectiveMusicRoot(db)).toBe(resolved);
  });

  it("rejects a path that does not exist", () => {
    const missing = path.join(tmpDir, "does-not-exist");
    expect(() => setMusicRootOverride(db, missing)).toThrow();
  });

  it("rejects a path that is a file, not a directory", async () => {
    const filePath = path.join(tmpDir, "not-a-dir.txt");
    await fs.writeFile(filePath, "hello");
    expect(() => setMusicRootOverride(db, filePath)).toThrow();
  });

  it("clears any saved scan exclusions, since they were relative to the old root", () => {
    setExcludedPaths(db, ["Sample Library"]);
    expect(getExcludedPaths(db)).toEqual(["Sample Library"]);

    setMusicRootOverride(db, tmpDir);

    expect(getExcludedPaths(db)).toEqual([]);
  });
});
