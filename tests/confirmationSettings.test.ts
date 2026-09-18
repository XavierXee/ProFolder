import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { getConfirmationSettings, setConfirmationSettings } from "../src/config/confirmationSettings.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe("confirmationSettings", () => {
  it("defaults all five confirmation toggles to true when nothing has been saved", () => {
    expect(getConfirmationSettings(db)).toEqual({
      confirmTagRemoval: true,
      confirmTabDeletion: true,
      confirmCopy: true,
      confirmMove: true,
      confirmDelete: true,
    });
  });

  it("persists a partial update and leaves the other settings untouched", () => {
    setConfirmationSettings(db, { confirmTagRemoval: false });

    expect(getConfirmationSettings(db)).toEqual({
      confirmTagRemoval: false,
      confirmTabDeletion: true,
      confirmCopy: true,
      confirmMove: true,
      confirmDelete: true,
    });
  });

  it("persists all five settings and survives being re-read", () => {
    setConfirmationSettings(db, {
      confirmTagRemoval: false,
      confirmTabDeletion: false,
      confirmCopy: false,
      confirmMove: false,
      confirmDelete: false,
    });

    expect(getConfirmationSettings(db)).toEqual({
      confirmTagRemoval: false,
      confirmTabDeletion: false,
      confirmCopy: false,
      confirmMove: false,
      confirmDelete: false,
    });
  });

  it("can be flipped back to true after being disabled", () => {
    setConfirmationSettings(db, { confirmDelete: false });
    setConfirmationSettings(db, { confirmDelete: true });

    expect(getConfirmationSettings(db).confirmDelete).toBe(true);
  });
});
