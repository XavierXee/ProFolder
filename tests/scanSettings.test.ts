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
    });
  });

  it("persists a partial update and leaves the other setting untouched", () => {
    setScanSettings(db, { excludeSamplesFolders: false });

    expect(getScanSettings(db)).toEqual({
      excludeSamplesFolders: false,
      excludeBackupFolders: true,
    });
  });

  it("persists both settings and survives being re-read", () => {
    setScanSettings(db, { excludeSamplesFolders: false, excludeBackupFolders: false });

    expect(getScanSettings(db)).toEqual({
      excludeSamplesFolders: false,
      excludeBackupFolders: false,
    });
  });

  it("can be flipped back to true after being disabled", () => {
    setScanSettings(db, { excludeBackupFolders: false });
    setScanSettings(db, { excludeBackupFolders: true });

    expect(getScanSettings(db).excludeBackupFolders).toBe(true);
  });
});
