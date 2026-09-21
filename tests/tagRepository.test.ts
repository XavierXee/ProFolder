import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  findOrCreateTag,
  listAllTagNames,
  deleteTagByName,
  renameTag,
  DuplicateTagError,
} from "../src/database/repositories/tagRepository.js";
import { insertAudioFile, addTagsToFiles, findById } from "../src/database/repositories/audioFileRepository.js";
import type { AudioFileUpsertInput } from "../src/database/repositories/audioFileRepository.js";
import { create as createCustomTab, findAll as findAllCustomTabs } from "../src/database/repositories/customTabRepository.js";

let db: Database.Database;

function makeFile(overrides: Partial<AudioFileUpsertInput> & { id: string }): AudioFileUpsertInput {
  const now = new Date().toISOString();
  return {
    path: `/Music/${overrides.id}`,
    relativePath: overrides.id,
    filename: overrides.id,
    extension: ".wav",
    size: 100,
    modifiedAt: now,
    containingFolder: "/Music",
    firstSeenAt: now,
    lastSeenAt: now,
    isRemoved: false,
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

describe("findOrCreateTag case-insensitive dedup", () => {
  it("returns the same tag id for a differently-cased re-find", () => {
    const id1 = findOrCreateTag(db, "Jazz");
    const id2 = findOrCreateTag(db, "jazz");

    expect(id2).toBe(id1);
  });

  it("leaves exactly one row in the tags table", () => {
    findOrCreateTag(db, "Jazz");
    findOrCreateTag(db, "jazz");

    const { count } = db.prepare("SELECT COUNT(*) AS count FROM tags").get() as { count: number };
    expect(count).toBe(1);
  });

  it("listAllTagNames reflects the dedup, returning exactly one entry", () => {
    findOrCreateTag(db, "Jazz");
    findOrCreateTag(db, "jazz");

    const names = listAllTagNames(db);

    expect(names).toHaveLength(1);
    expect(names[0]!.toLowerCase()).toBe("jazz");
  });

  it("dedup survives addTagsToFiles when both casings are passed in the same call", () => {
    insertAudioFile(db, makeFile({ id: "file-00.wav" }));

    addTagsToFiles(db, ["file-00.wav"], ["Jazz", "jazz"]);

    const file = findById(db, "file-00.wav");
    expect(file?.tags).toHaveLength(1);

    const { count } = db.prepare("SELECT COUNT(*) AS count FROM tags").get() as { count: number };
    expect(count).toBe(1);
  });
});

describe("deleteTagByName cascades to custom tabs", () => {
  it("removes the deleted tag from a custom tab's stored tags array", () => {
    findOrCreateTag(db, "kick");
    const tab = createCustomTab(db, {
      name: "My Tab",
      type: "files",
      statuses: [],
      scores: [],
      tags: ["kick", "snare"],
    });

    deleteTagByName(db, "kick");

    const [found] = findAllCustomTabs(db);
    expect(found!.id).toBe(tab.id);
    expect(found!.tags).toEqual(["snare"]);
  });

  it("leaves a custom tab with no matching tag reference completely untouched", () => {
    findOrCreateTag(db, "kick");
    const tab = createCustomTab(db, {
      name: "Untouched Tab",
      type: "projects",
      statuses: ["draft"],
      scores: [3],
      tags: ["snare"],
    });

    deleteTagByName(db, "kick");

    const [found] = findAllCustomTabs(db);
    expect(found).toEqual(tab);
  });

  it("still removes the tag row itself", () => {
    findOrCreateTag(db, "kick");

    deleteTagByName(db, "kick");

    expect(listAllTagNames(db)).not.toContain("kick");
  });
});

describe("renameTag cascades to custom tabs", () => {
  it("updates the renamed tag in a custom tab's stored tags array", () => {
    findOrCreateTag(db, "kick");
    const tab = createCustomTab(db, {
      name: "My Tab",
      type: "files",
      statuses: [],
      scores: [],
      tags: ["kick", "snare"],
    });

    renameTag(db, "kick", "bass drum");

    const [found] = findAllCustomTabs(db);
    expect(found!.id).toBe(tab.id);
    expect(found!.tags).toEqual(["bass drum", "snare"]);
  });

  it("leaves a custom tab with no matching tag reference completely untouched", () => {
    findOrCreateTag(db, "kick");
    const tab = createCustomTab(db, {
      name: "Untouched Tab",
      type: "projects",
      statuses: ["draft"],
      scores: [3],
      tags: ["snare"],
    });

    renameTag(db, "kick", "bass drum");

    const [found] = findAllCustomTabs(db);
    expect(found).toEqual(tab);
  });

  it("still throws DuplicateTagError when newName collides with an existing tag, and does not corrupt any custom tab's state", () => {
    findOrCreateTag(db, "kick");
    findOrCreateTag(db, "snare");
    const tab = createCustomTab(db, {
      name: "My Tab",
      type: "files",
      statuses: [],
      scores: [],
      tags: ["kick", "snare"],
    });

    expect(() => renameTag(db, "kick", "snare")).toThrow(DuplicateTagError);

    // The tags table itself must be unaffected by the rolled-back transaction.
    const names = listAllTagNames(db).map((n) => n.toLowerCase()).sort();
    expect(names).toEqual(["kick", "snare"]);

    // The custom tab's stored tags array must be exactly as before — proving the
    // renameTagInAllTabs cascade never ran (or was rolled back) when the UPDATE
    // to the tags table itself failed.
    const [found] = findAllCustomTabs(db);
    expect(found).toEqual(tab);
  });
});
