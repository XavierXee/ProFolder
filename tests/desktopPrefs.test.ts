import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertDbFileIsOpenable,
  clearDbPathOverride,
  getDbPathOverride,
  setDbPathOverride,
} from "../src/config/desktopPrefs.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-prefs-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("getDbPathOverride", () => {
  it("returns undefined when the prefs file doesn't exist", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
  });

  it("returns the stored path when a valid prefs file exists", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    const dbPath = path.join(tmpDir, "library.db");
    fs.writeFileSync(prefsFilePath, JSON.stringify({ dbPath }), "utf8");
    expect(getDbPathOverride(prefsFilePath)).toBe(dbPath);
  });

  it("returns undefined (does not throw) when the prefs file contains malformed JSON", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    fs.writeFileSync(prefsFilePath, "{ not valid json", "utf8");
    expect(() => getDbPathOverride(prefsFilePath)).not.toThrow();
    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
  });

  it("returns undefined (does not throw) when the prefs file is valid JSON but missing dbPath", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    fs.writeFileSync(prefsFilePath, JSON.stringify({}), "utf8");
    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();

    const prefsFilePath2 = path.join(tmpDir, "prefs2.json");
    fs.writeFileSync(prefsFilePath2, JSON.stringify({ foo: "bar" }), "utf8");
    expect(getDbPathOverride(prefsFilePath2)).toBeUndefined();
  });
});

describe("setDbPathOverride", () => {
  it("round-trips: set then get returns the same path", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    const dbPath = path.join(tmpDir, "library.db");
    setDbPathOverride(prefsFilePath, dbPath);
    expect(getDbPathOverride(prefsFilePath)).toBe(dbPath);
  });

  it("throws a clear error and does not write the prefs file when the target's parent directory doesn't exist", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    const dbPath = path.join(tmpDir, "does-not-exist", "library.db");
    expect(() => setDbPathOverride(prefsFilePath, dbPath)).toThrow(
      /parent directory does not exist/
    );
    expect(fs.existsSync(prefsFilePath)).toBe(false);
  });

  it("creates the prefs file's own parent directory if it doesn't exist yet (fresh-install scenario)", () => {
    const prefsFilePath = path.join(tmpDir, "userData", "nested", "prefs.json");
    const dbPath = path.join(tmpDir, "library.db");
    expect(fs.existsSync(path.dirname(prefsFilePath))).toBe(false);

    setDbPathOverride(prefsFilePath, dbPath);

    expect(fs.existsSync(prefsFilePath)).toBe(true);
    expect(getDbPathOverride(prefsFilePath)).toBe(dbPath);
  });

  it("overwriting an existing override replaces it cleanly", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    const firstDbPath = path.join(tmpDir, "first.db");
    const secondDbPath = path.join(tmpDir, "second.db");

    setDbPathOverride(prefsFilePath, firstDbPath);
    expect(getDbPathOverride(prefsFilePath)).toBe(firstDbPath);

    setDbPathOverride(prefsFilePath, secondDbPath);
    expect(getDbPathOverride(prefsFilePath)).toBe(secondDbPath);
  });
});

describe("clearDbPathOverride", () => {
  it("clears an existing override: subsequent getDbPathOverride returns undefined", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    const dbPath = path.join(tmpDir, "library.db");
    setDbPathOverride(prefsFilePath, dbPath);
    expect(getDbPathOverride(prefsFilePath)).toBe(dbPath);

    clearDbPathOverride(prefsFilePath);

    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
  });

  it("is a safe no-op on a prefs file with no dbPath field", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    fs.writeFileSync(prefsFilePath, JSON.stringify({ foo: "bar" }), "utf8");

    expect(() => clearDbPathOverride(prefsFilePath)).not.toThrow();
    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
    // Confirms the "other field" was not disturbed by the no-op (nothing was written at all).
    expect(JSON.parse(fs.readFileSync(prefsFilePath, "utf8"))).toEqual({ foo: "bar" });
  });

  it("is a safe no-op when the prefs file doesn't exist at all", () => {
    const prefsFilePath = path.join(tmpDir, "does-not-exist.json");
    expect(fs.existsSync(prefsFilePath)).toBe(false);

    expect(() => clearDbPathOverride(prefsFilePath)).not.toThrow();

    expect(fs.existsSync(prefsFilePath)).toBe(false);
  });

  it("is a safe no-op when the prefs file contains malformed JSON", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    fs.writeFileSync(prefsFilePath, "{ not valid json", "utf8");

    expect(() => clearDbPathOverride(prefsFilePath)).not.toThrow();
    expect(fs.readFileSync(prefsFilePath, "utf8")).toBe("{ not valid json");
  });

  it("removes only the dbPath field, preserving any other field already present in the prefs JSON", () => {
    // Only `dbPath` exists in the real prefs shape today, but this proves clearDbPathOverride
    // doesn't blindly overwrite-with-empty-object (unlike setDbPathOverride's own documented
    // blind-overwrite behavior) if the file ever grows a second field.
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    const dbPath = path.join(tmpDir, "library.db");
    fs.writeFileSync(prefsFilePath, JSON.stringify({ dbPath, otherSetting: "keep-me" }), "utf8");

    clearDbPathOverride(prefsFilePath);

    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
    const persisted = JSON.parse(fs.readFileSync(prefsFilePath, "utf8"));
    expect(persisted).toEqual({ otherSetting: "keep-me" });
  });
});

describe("assertDbFileIsOpenable", () => {
  it("does not throw for a real, existing, valid SQLite database file", () => {
    const dbPath = path.join(tmpDir, "valid.db");
    const db = new Database(dbPath);
    // A brand-new, untouched SQLite file has zero pages (which assertDbFileIsOpenable now
    // deliberately rejects as a placeholder/empty-database footgun — see its own doc comment
    // and the "throws for an existing, zero-byte file" test below), so this "valid" fixture must
    // actually contain something for it to be a meaningful positive case.
    db.exec("CREATE TABLE t (id INTEGER)");
    db.close();

    expect(() => assertDbFileIsOpenable(dbPath)).not.toThrow();
  });

  it("throws for a path that doesn't exist yet, rather than silently accepting it (never creates a file as a side effect)", () => {
    const dbPath = path.join(tmpDir, "does-not-exist.db");

    expect(() => assertDbFileIsOpenable(dbPath)).toThrow(/not a usable SQLite database file/);
    expect(fs.existsSync(dbPath)).toBe(false);
  });

  it("throws for an existing file that is not a real SQLite database (wrong magic header)", () => {
    const dbPath = path.join(tmpDir, "not-a-database.db");
    fs.writeFileSync(dbPath, "just some plain text, not a SQLite file", "utf8");

    expect(() => assertDbFileIsOpenable(dbPath)).toThrow(/not a usable SQLite database file/);
  });

  it("throws for an existing, zero-byte file (SQLite treats an empty file as a trivially valid empty database, but this is exactly the same silent-data-loss footgun as a nonexistent path)", () => {
    const dbPath = path.join(tmpDir, "empty-placeholder.db");
    fs.writeFileSync(dbPath, "");
    expect(fs.statSync(dbPath).size).toBe(0);

    expect(() => assertDbFileIsOpenable(dbPath)).toThrow(/not a usable SQLite database file/);
  });

  it("throws for a structurally corrupted file where PRAGMA quick_check reports a real error via its RETURNED rows rather than throwing a JS exception itself (regression test for a gap where quick_check's return value was discarded)", () => {
    // Not every corruption SQLite detects during quick_check surfaces as a thrown exception —
    // quick_check is fundamentally a diagnostic query: for corruption that's readable at the raw
    // byte level but structurally invalid (e.g. a b-tree cell pointer pointing at an
    // out-of-range/overlapping offset), it returns descriptive error text as its result rows
    // instead of throwing. A caller that runs `db.pragma("quick_check")` purely for its
    // side effect and never inspects what it returned (as `assertDbFileIsOpenable` did before
    // this test was added) will silently let this class of corruption through.
    const dbPath = path.join(tmpDir, "corrupted.db");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)");
    const insert = db.prepare("INSERT INTO t (val) VALUES (?)");
    for (let i = 0; i < 50; i++) {
      insert.run("padding padding padding padding padding " + i);
    }
    db.close();

    // Corrupt exactly one cell pointer in page 2's cell pointer array (page size defaults to
    // 4096 bytes; the array starts 8 bytes into a leaf table b-tree page's header) so it points
    // at an out-of-range offset. This reproduced identically and deterministically across
    // repeated runs against this exact fixture shape during manual verification.
    const buf = fs.readFileSync(dbPath);
    const pageSize = 4096;
    const cellPtrArrayStart = pageSize + 8;
    buf[cellPtrArrayStart + 4] = 0x10;
    buf[cellPtrArrayStart + 5] = 0x00;
    fs.writeFileSync(dbPath, buf);

    expect(() => assertDbFileIsOpenable(dbPath)).toThrow(/not a usable SQLite database file/);
  });

  it("never leaves a stray WAL/SHM file behind (opens read-only, closes immediately)", () => {
    const dbPath = path.join(tmpDir, "valid.db");
    const db = new Database(dbPath);
    // A brand-new, untouched SQLite file has zero pages (which assertDbFileIsOpenable now
    // deliberately rejects as a placeholder/empty-database footgun — see its own doc comment
    // and the "throws for an existing, zero-byte file" test below), so this "valid" fixture must
    // actually contain something for it to be a meaningful positive case.
    db.exec("CREATE TABLE t (id INTEGER)");
    db.close();

    assertDbFileIsOpenable(dbPath);

    expect(fs.existsSync(`${dbPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${dbPath}-shm`)).toBe(false);
  });
});
