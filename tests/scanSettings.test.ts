import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { getScanSettings, setScanSettings } from "../src/config/scanSettings.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe("scanSettings", () => {
  it("defaults both exclusions to true when nothing has been saved", () => {
    expect(getScanSettings(db)).toEqual({
      excludeSamplesFolders: true,
      excludeBackupFolders: true,
      excludeFolderPatternEnabled: false,
      excludeFolderPattern: "Stems|STEMS",
      duplicateMatchThresholdPercent: 58,
    });
  });

  it("persists a partial update and leaves the other setting untouched", () => {
    setScanSettings(db, { excludeSamplesFolders: false });

    expect(getScanSettings(db)).toEqual({
      excludeSamplesFolders: false,
      excludeBackupFolders: true,
      excludeFolderPatternEnabled: false,
      excludeFolderPattern: "Stems|STEMS",
      duplicateMatchThresholdPercent: 58,
    });
  });

  it("persists both settings and survives being re-read", () => {
    setScanSettings(db, { excludeSamplesFolders: false, excludeBackupFolders: false });

    expect(getScanSettings(db)).toEqual({
      excludeSamplesFolders: false,
      excludeBackupFolders: false,
      excludeFolderPatternEnabled: false,
      excludeFolderPattern: "Stems|STEMS",
      duplicateMatchThresholdPercent: 58,
    });
  });

  it("can be flipped back to true after being disabled", () => {
    setScanSettings(db, { excludeBackupFolders: false });
    setScanSettings(db, { excludeBackupFolders: true });

    expect(getScanSettings(db).excludeBackupFolders).toBe(true);
  });

  it("round-trips a valid duplicateMatchThresholdPercent value", () => {
    setScanSettings(db, { duplicateMatchThresholdPercent: 45 });

    expect(getScanSettings(db)).toEqual({
      excludeSamplesFolders: true,
      excludeBackupFolders: true,
      excludeFolderPatternEnabled: false,
      excludeFolderPattern: "Stems|STEMS",
      duplicateMatchThresholdPercent: 45,
    });
  });

  it("rejects a non-integer duplicateMatchThresholdPercent", () => {
    expect(() => setScanSettings(db, { duplicateMatchThresholdPercent: 50.5 })).toThrow(
      /duplicateMatchThresholdPercent must be an integer between 10 and 100/
    );
  });

  it("rejects a duplicateMatchThresholdPercent below the minimum", () => {
    expect(() => setScanSettings(db, { duplicateMatchThresholdPercent: 5 })).toThrow(
      /duplicateMatchThresholdPercent must be an integer between 10 and 100/
    );
  });

  it("rejects a duplicateMatchThresholdPercent above the maximum", () => {
    expect(() => setScanSettings(db, { duplicateMatchThresholdPercent: 101 })).toThrow(
      /duplicateMatchThresholdPercent must be an integer between 10 and 100/
    );
  });

  it("atomically rejects a multi-field patch: valid excludeSamplesFolders + invalid duplicateMatchThresholdPercent leaves excludeSamplesFolders unchanged", () => {
    // Start from a non-default value (false) so the assertion below can actually distinguish
    // "the patch's excludeSamplesFolders write was atomically suppressed" from "it was written
    // early and just happens to equal the untouched default" — asserting against the default
    // value itself (true) would pass either way and not prove atomicity.
    setScanSettings(db, { excludeSamplesFolders: false });

    expect(() =>
      setScanSettings(db, { excludeSamplesFolders: true, duplicateMatchThresholdPercent: 5 })
    ).toThrow();

    // excludeSamplesFolders was valid on its own, but since the overall patch failed, it must
    // not have been persisted — it should still be at its prior value (false), not flipped to
    // the patch's requested true.
    expect(getScanSettings(db)).toEqual({
      excludeSamplesFolders: false,
      excludeBackupFolders: true,
      excludeFolderPatternEnabled: false,
      excludeFolderPattern: "Stems|STEMS",
      duplicateMatchThresholdPercent: 58,
    });
  });

  it("atomically rejects a multi-field patch: valid duplicateMatchThresholdPercent + invalid excludeBackupFolders leaves duplicateMatchThresholdPercent unchanged (order shouldn't matter)", () => {
    expect(() =>
      setScanSettings(db, {
        duplicateMatchThresholdPercent: 45,
        excludeBackupFolders: "not-a-boolean" as unknown as boolean,
      })
    ).toThrow();

    // duplicateMatchThresholdPercent was valid on its own, but since the overall patch failed,
    // it must not have been persisted — it should still be at its untouched default (58).
    expect(getScanSettings(db)).toEqual({
      excludeSamplesFolders: true,
      excludeBackupFolders: true,
      excludeFolderPatternEnabled: false,
      excludeFolderPattern: "Stems|STEMS",
      duplicateMatchThresholdPercent: 58,
    });
  });

  it("defaults excludeFolderPatternEnabled to false and excludeFolderPattern to the Stems preset", () => {
    const settings = getScanSettings(db);
    expect(settings.excludeFolderPatternEnabled).toBe(false);
    expect(settings.excludeFolderPattern).toBe("Stems|STEMS");
  });

  it("persists excludeFolderPatternEnabled independently of excludeFolderPattern", () => {
    setScanSettings(db, { excludeFolderPatternEnabled: true });

    expect(getScanSettings(db)).toEqual({
      excludeSamplesFolders: true,
      excludeBackupFolders: true,
      excludeFolderPatternEnabled: true,
      excludeFolderPattern: "Stems|STEMS",
      duplicateMatchThresholdPercent: 58,
    });
  });

  it("persists a custom excludeFolderPattern and survives being re-read", () => {
    setScanSettings(db, { excludeFolderPattern: "^Render" });

    expect(getScanSettings(db).excludeFolderPattern).toBe("^Render");
  });

  it("rejects a non-boolean excludeFolderPatternEnabled", () => {
    expect(() => setScanSettings(db, { excludeFolderPatternEnabled: "yes" as unknown as boolean })).toThrow(
      /excludeFolderPatternEnabled must be a boolean/
    );
  });

  it("rejects an empty excludeFolderPattern", () => {
    expect(() => setScanSettings(db, { excludeFolderPattern: "" })).toThrow(
      /excludeFolderPattern must be a non-empty string/
    );
    expect(() => setScanSettings(db, { excludeFolderPattern: "   " })).toThrow(
      /excludeFolderPattern must be a non-empty string/
    );
  });

  it("rejects a syntactically invalid excludeFolderPattern regex", () => {
    expect(() => setScanSettings(db, { excludeFolderPattern: "(unterminated" })).toThrow(
      /excludeFolderPattern must be a valid regular expression/
    );
  });

  it("atomically rejects an invalid excludeFolderPattern alongside a valid field, leaving neither persisted", () => {
    expect(() =>
      setScanSettings(db, { excludeFolderPatternEnabled: true, excludeFolderPattern: "(unterminated" })
    ).toThrow();

    expect(getScanSettings(db)).toEqual({
      excludeSamplesFolders: true,
      excludeBackupFolders: true,
      excludeFolderPatternEnabled: false,
      excludeFolderPattern: "Stems|STEMS",
      duplicateMatchThresholdPercent: 58,
    });
  });
});
