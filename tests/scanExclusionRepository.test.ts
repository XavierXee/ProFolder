import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { getExcludedPaths, setExcludedPaths } from "../src/database/repositories/scanExclusionRepository.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe("scanExclusionRepository", () => {
  it("returns an empty list when nothing has been excluded", () => {
    expect(getExcludedPaths(db)).toEqual([]);
  });

  it("persists the full set of excluded paths", () => {
    setExcludedPaths(db, ["Sample Library", "Ableton Projects/Old Stuff"]);
    expect(getExcludedPaths(db).sort()).toEqual(["Ableton Projects/Old Stuff", "Sample Library"]);
  });

  it("replaces the previous set rather than appending to it", () => {
    setExcludedPaths(db, ["A", "B"]);
    setExcludedPaths(db, ["C"]);
    expect(getExcludedPaths(db)).toEqual(["C"]);
  });

  it("de-duplicates and drops blank entries", () => {
    setExcludedPaths(db, ["A", "A", "  ", ""]);
    expect(getExcludedPaths(db)).toEqual(["A"]);
  });
});
