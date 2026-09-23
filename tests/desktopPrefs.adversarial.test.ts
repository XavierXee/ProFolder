import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDbPathOverride, setDbPathOverride } from "../src/config/desktopPrefs.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-prefs-adversarial-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("getDbPathOverride - adversarial", () => {
  it("returns undefined when dbPath is a number, not a string", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    fs.writeFileSync(prefsFilePath, JSON.stringify({ dbPath: 123 }), "utf8");
    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
  });

  it("returns undefined when dbPath is null", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    fs.writeFileSync(prefsFilePath, JSON.stringify({ dbPath: null }), "utf8");
    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
  });

  it("returns undefined when dbPath is an empty string", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    fs.writeFileSync(prefsFilePath, JSON.stringify({ dbPath: "" }), "utf8");
    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
  });

  it("returns undefined when dbPath is an array", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    fs.writeFileSync(prefsFilePath, JSON.stringify({ dbPath: ["a", "b"] }), "utf8");
    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
  });

  it("returns undefined when the file's top-level JSON value is an array, not an object", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    fs.writeFileSync(prefsFilePath, JSON.stringify(["dbPath", "/a/b"]), "utf8");
    expect(() => getDbPathOverride(prefsFilePath)).not.toThrow();
    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
  });

  it("returns undefined when the file's top-level JSON value is a bare string", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    fs.writeFileSync(prefsFilePath, JSON.stringify("/a/b"), "utf8");
    expect(() => getDbPathOverride(prefsFilePath)).not.toThrow();
    expect(getDbPathOverride(prefsFilePath)).toBeUndefined();
  });

  it("returns undefined when the prefs path points at a directory, not a file", () => {
    const dirAsPrefsPath = path.join(tmpDir, "im-a-dir");
    fs.mkdirSync(dirAsPrefsPath);
    expect(() => getDbPathOverride(dirAsPrefsPath)).not.toThrow();
    expect(getDbPathOverride(dirAsPrefsPath)).toBeUndefined();
  });
});

describe("setDbPathOverride - adversarial", () => {
  it("creates a multi-level-deep (4 levels) prefs parent directory in one call", () => {
    const prefsFilePath = path.join(tmpDir, "a", "b", "c", "d", "prefs.json");
    const dbPath = path.join(tmpDir, "library.db");
    expect(fs.existsSync(path.join(tmpDir, "a"))).toBe(false);

    setDbPathOverride(prefsFilePath, dbPath);

    expect(fs.existsSync(prefsFilePath)).toBe(true);
    expect(getDbPathOverride(prefsFilePath)).toBe(dbPath);
  });

  it("throws and leaves prefs file untouched when target parent dir is several levels missing", () => {
    const prefsFilePath = path.join(tmpDir, "prefs.json");
    const dbPath = path.join(tmpDir, "x", "y", "z", "library.db");
    expect(() => setDbPathOverride(prefsFilePath, dbPath)).toThrow(
      /parent directory does not exist/
    );
    expect(fs.existsSync(prefsFilePath)).toBe(false);
  });
});

describe("setDbPathOverride - validation-order proof", () => {
  it("does not create the prefs file's own (nested, not-yet-existing) parent directory when target validation fails first", () => {
    const prefsFilePath = path.join(tmpDir, "userData", "nested", "prefs.json");
    const dbPath = path.join(tmpDir, "does-not-exist-either", "library.db");

    expect(fs.existsSync(path.dirname(prefsFilePath))).toBe(false);
    expect(() => setDbPathOverride(prefsFilePath, dbPath)).toThrow(
      /parent directory does not exist/
    );
    // Proves validation happens strictly before any disk mutation, including creating
    // the prefs file's own parent directory (a separate, "creation vs validation" concern).
    expect(fs.existsSync(path.dirname(prefsFilePath))).toBe(false);
    expect(fs.existsSync(prefsFilePath)).toBe(false);
  });
});
