import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { deleteSetting, getSetting, setSetting } from "../src/database/repositories/appSettingsRepository.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe("appSettingsRepository", () => {
  it("returns undefined for a key that was never set", () => {
    expect(getSetting(db, "musicRoot")).toBeUndefined();
  });

  it("persists and retrieves a value", () => {
    setSetting(db, "musicRoot", "/Users/test/Music");
    expect(getSetting(db, "musicRoot")).toBe("/Users/test/Music");
  });

  it("overwrites rather than duplicates on repeated sets", () => {
    setSetting(db, "musicRoot", "/first");
    setSetting(db, "musicRoot", "/second");
    expect(getSetting(db, "musicRoot")).toBe("/second");

    const rows = db.prepare("SELECT COUNT(*) AS count FROM app_settings WHERE key = ?").get("musicRoot") as {
      count: number;
    };
    expect(rows.count).toBe(1);
  });

  it("removes a setting entirely", () => {
    setSetting(db, "musicRoot", "/Users/test/Music");
    deleteSetting(db, "musicRoot");
    expect(getSetting(db, "musicRoot")).toBeUndefined();
  });
});
