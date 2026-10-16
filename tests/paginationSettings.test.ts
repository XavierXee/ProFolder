import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { getPaginationSettings, setPaginationSettings } from "../src/config/paginationSettings.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe("paginationSettings", () => {
  it("defaults itemsPerPage to 50 when nothing has been saved", () => {
    expect(getPaginationSettings(db)).toEqual({ itemsPerPage: 50 });
  });

  it("persists a valid value and survives being re-read", () => {
    setPaginationSettings(db, { itemsPerPage: 100 });

    expect(getPaginationSettings(db)).toEqual({ itemsPerPage: 100 });
  });

  it("accepts the minimum boundary value of 5", () => {
    setPaginationSettings(db, { itemsPerPage: 5 });

    expect(getPaginationSettings(db)).toEqual({ itemsPerPage: 5 });
  });

  it("accepts the maximum boundary value of 500", () => {
    setPaginationSettings(db, { itemsPerPage: 500 });

    expect(getPaginationSettings(db)).toEqual({ itemsPerPage: 500 });
  });

  it("throws and leaves the stored value untouched when itemsPerPage is below the minimum", () => {
    expect(() => setPaginationSettings(db, { itemsPerPage: 4 })).toThrow();
    expect(getPaginationSettings(db)).toEqual({ itemsPerPage: 50 });
  });

  it("throws and leaves the stored value untouched when itemsPerPage is above the maximum", () => {
    expect(() => setPaginationSettings(db, { itemsPerPage: 501 })).toThrow();
    expect(getPaginationSettings(db)).toEqual({ itemsPerPage: 50 });
  });

  it("throws when itemsPerPage is not an integer", () => {
    expect(() => setPaginationSettings(db, { itemsPerPage: 25.5 })).toThrow();
    expect(getPaginationSettings(db)).toEqual({ itemsPerPage: 50 });
  });

  it("can be changed again after a previous successful update", () => {
    setPaginationSettings(db, { itemsPerPage: 200 });
    setPaginationSettings(db, { itemsPerPage: 75 });

    expect(getPaginationSettings(db)).toEqual({ itemsPerPage: 75 });
  });
});
