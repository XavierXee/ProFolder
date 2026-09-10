import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { findOrCreateTag, listAllTagNames } from "../src/database/repositories/tagRepository.js";
import { insertAudioFile, addTagsToFiles, findById } from "../src/database/repositories/audioFileRepository.js";
import type { AudioFileUpsertInput } from "../src/database/repositories/audioFileRepository.js";

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
