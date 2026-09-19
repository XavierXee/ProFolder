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
  it("defaults all six confirmation toggles to true when nothing has been saved", () => {
    expect(getConfirmationSettings(db)).toEqual({
      confirmTabDeletion: true,
      confirmCopy: true,
      confirmMove: true,
      confirmDelete: true,
      confirmStatusDeletion: true,
      confirmTagDeletion: true,
    });
  });

  it("persists a partial update and leaves the other settings untouched", () => {
    setConfirmationSettings(db, { confirmTabDeletion: false });

    expect(getConfirmationSettings(db)).toEqual({
      confirmTabDeletion: false,
      confirmCopy: true,
      confirmMove: true,
      confirmDelete: true,
      confirmStatusDeletion: true,
      confirmTagDeletion: true,
    });
  });

  it("persists a partial update covering only the 2 catalog-deletion fields and leaves the others untouched", () => {
    setConfirmationSettings(db, { confirmStatusDeletion: false, confirmTagDeletion: false });

    expect(getConfirmationSettings(db)).toEqual({
      confirmTabDeletion: true,
      confirmCopy: true,
      confirmMove: true,
      confirmDelete: true,
      confirmStatusDeletion: false,
      confirmTagDeletion: false,
    });
  });

  it("persists all six settings and survives being re-read", () => {
    setConfirmationSettings(db, {
      confirmTabDeletion: false,
      confirmCopy: false,
      confirmMove: false,
      confirmDelete: false,
      confirmStatusDeletion: false,
      confirmTagDeletion: false,
    });

    expect(getConfirmationSettings(db)).toEqual({
      confirmTabDeletion: false,
      confirmCopy: false,
      confirmMove: false,
      confirmDelete: false,
      confirmStatusDeletion: false,
      confirmTagDeletion: false,
    });
  });

  it("can be flipped back to true after being disabled", () => {
    setConfirmationSettings(db, { confirmDelete: false });
    setConfirmationSettings(db, { confirmDelete: true });

    expect(getConfirmationSettings(db).confirmDelete).toBe(true);
  });

  it("can be flipped back to true after being disabled (confirmStatusDeletion)", () => {
    setConfirmationSettings(db, { confirmStatusDeletion: false });
    setConfirmationSettings(db, { confirmStatusDeletion: true });

    expect(getConfirmationSettings(db).confirmStatusDeletion).toBe(true);
  });

  it("can be flipped back to true after being disabled (confirmTagDeletion)", () => {
    setConfirmationSettings(db, { confirmTagDeletion: false });
    setConfirmationSettings(db, { confirmTagDeletion: true });

    expect(getConfirmationSettings(db).confirmTagDeletion).toBe(true);
  });
});
