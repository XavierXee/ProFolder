import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { insertScanRun, getLastScanRun } from "../src/database/repositories/scanRunRepository.js";
import type { ScanStats } from "../src/scanner/types.js";

let db: Database.Database;

function makeStats(overrides: Partial<ScanStats> = {}): ScanStats {
  return {
    rootPath: "/Music",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:01:00.000Z",
    durationMs: 60000,
    foldersScanned: 10,
    audioFilesFound: 20,
    dawProjectsFound: 3,
    newFiles: 5,
    modifiedFiles: 2,
    removedFiles: 1,
    errors: [],
    ...overrides,
  };
}

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe("getLastScanRun", () => {
  it("returns undefined on an empty table", () => {
    expect(getLastScanRun(db)).toBeUndefined();
  });
});

describe("insertScanRun / getLastScanRun round-trip", () => {
  it("round-trips all fields byte-for-byte, including a multi-entry errors array", () => {
    const stats = makeStats({
      errors: [
        { path: "/Music/bad1.wav", message: "corrupt header" },
        { path: "/Music/bad2.wav", message: "unreadable" },
      ],
    });

    insertScanRun(db, stats);
    const result = getLastScanRun(db);

    expect(result).toEqual(stats);
  });

  it("insertScanRun returns the new row's id", () => {
    const id1 = insertScanRun(db, makeStats());
    const id2 = insertScanRun(db, makeStats());

    expect(typeof id1).toBe("number");
    expect(id2).toBeGreaterThan(id1);
  });

  it("returns the most recently inserted scan run, distinguished by rootPath", () => {
    insertScanRun(db, makeStats({ rootPath: "/scan-1" }));
    insertScanRun(db, makeStats({ rootPath: "/scan-2" }));
    insertScanRun(db, makeStats({ rootPath: "/scan-3" }));

    const result = getLastScanRun(db);

    expect(result?.rootPath).toBe("/scan-3");
  });

  it("round-trips an explicitly empty errors array as [], not undefined/null", () => {
    insertScanRun(db, makeStats({ errors: [] }));

    const result = getLastScanRun(db);

    expect(result?.errors).toEqual([]);
  });
});

describe("NULL-coalescing contract for partial/raw rows", () => {
  // The schema permits finished_at/duration_ms to be NULL (see migrations/001_init.sql),
  // and getLastScanRun's mapping code does `finished_at ?? ""` / `duration_ms ?? 0` to
  // handle that case. insertScanRun itself never produces a row in this state (it always
  // writes non-null values for every field), so this test bypasses insertScanRun with a
  // raw INSERT to lock in that coalescing contract for any future/partial code path
  // (e.g. crash recovery) that might leave those columns NULL.
  it("coalesces NULL finished_at/duration_ms and defaults errors to [] on a raw partial row", () => {
    db.prepare("INSERT INTO scan_runs (root_path, started_at) VALUES (?, ?)").run(
      "/scan-partial",
      "2026-01-01T00:00:00.000Z"
    );

    const result = getLastScanRun(db);

    expect(result?.finishedAt).toBe("");
    expect(result?.durationMs).toBe(0);
    expect(result?.errors).toEqual([]);
  });
});
