import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  findAllActivePaged,
  insertAudioFile,
  updateAudioFileMetadata,
  updateStatus,
  setTags,
  setScore,
  setScoreForFiles,
  addTagsToFiles,
  findById,
  getLibraryStats,
  markRemoved,
  type AudioFileUpsertInput,
} from "../src/database/repositories/audioFileRepository.js";

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
  for (let i = 0; i < 25; i++) {
    const id = `file-${String(i).padStart(2, "0")}.wav`;
    insertAudioFile(db, makeFile({ id, filename: id }));
  }
});

afterEach(() => {
  db.close();
});

describe("findAllActivePaged", () => {
  it("returns the full total count regardless of page size", () => {
    const { total } = findAllActivePaged(db, { limit: 10, offset: 0 });
    expect(total).toBe(25);
  });

  it("returns only the requested page slice", () => {
    const page1 = findAllActivePaged(db, { limit: 10, offset: 0, sortBy: "name" });
    const page2 = findAllActivePaged(db, { limit: 10, offset: 10, sortBy: "name" });
    const page3 = findAllActivePaged(db, { limit: 10, offset: 20, sortBy: "name" });

    expect(page1.items).toHaveLength(10);
    expect(page2.items).toHaveLength(10);
    expect(page3.items).toHaveLength(5);

    const allIds = [...page1.items, ...page2.items, ...page3.items].map((f) => f.id);
    expect(new Set(allIds).size).toBe(25);
  });

  it("applies filters to the count as well as the page", () => {
    setTags(db, "file-00.wav", ["favorite"]);
    setTags(db, "file-01.wav", ["favorite"]);

    const { items, total } = findAllActivePaged(db, { tags: ["favorite"], limit: 10, offset: 0 });
    expect(total).toBe(2);
    expect(items).toHaveLength(2);
  });

  it("matches any of several tags (OR)", () => {
    setTags(db, "file-00.wav", ["favorite"]);
    setTags(db, "file-01.wav", ["archived"]);
    setTags(db, "file-02.wav", ["unrelated"]);

    const { total } = findAllActivePaged(db, { tags: ["favorite", "archived"], limit: 10, offset: 0 });
    expect(total).toBe(2);
  });

  it("attaches the correct tags per file without leaking tags across rows", () => {
    setTags(db, "file-00.wav", ["a", "b"]);
    setTags(db, "file-01.wav", ["c"]);

    const { items } = findAllActivePaged(db, { sortBy: "name", limit: 5, offset: 0 });
    const file0 = items.find((f) => f.id === "file-00.wav")!;
    const file1 = items.find((f) => f.id === "file-01.wav")!;
    const file2 = items.find((f) => f.id === "file-02.wav")!;

    expect(file0.tags.sort()).toEqual(["a", "b"]);
    expect(file1.tags).toEqual(["c"]);
    expect(file2.tags).toEqual([]);
  });

  it("filters by an exact score", () => {
    setScore(db, "file-00.wav", 3);
    setScore(db, "file-01.wav", 5);

    const { items, total } = findAllActivePaged(db, { scores: [3], limit: 10, offset: 0 });

    expect(total).toBe(1);
    expect(items[0]!.id).toBe("file-00.wav");
  });

  it("matches any of several scores (OR), including unscored via null", () => {
    setScore(db, "file-00.wav", 3);
    setScore(db, "file-01.wav", 5);
    // file-02.wav stays unscored (null)

    const { total } = findAllActivePaged(db, { scores: [3, null], limit: 30, offset: 0 });

    expect(total).toBe(24); // file-00.wav (score 3) + all 23 remaining unscored files
  });

  it("filters for unscored files with scores: [null]", () => {
    setScore(db, "file-00.wav", 3);

    const { total } = findAllActivePaged(db, { scores: [null], limit: 30, offset: 0 });

    expect(total).toBe(24); // all 25 fixtures minus file-00.wav
  });

  it("sorts by score when sortBy is 'score'", () => {
    // Isolate a small, tagged subset so the resulting order is fully deterministic
    // (the other 21 fixture files stay unscored/untagged and would otherwise tie).
    setTags(db, "file-00.wav", ["score-test"]);
    setTags(db, "file-01.wav", ["score-test"]);
    setTags(db, "file-02.wav", ["score-test"]);
    setTags(db, "file-03.wav", ["score-test"]);
    setScore(db, "file-00.wav", 3);
    setScore(db, "file-01.wav", 5);
    setScore(db, "file-02.wav", 1);
    // file-03.wav stays unscored (null)

    const asc = findAllActivePaged(db, {
      tags: ["score-test"],
      sortBy: "score",
      sortDir: "asc",
      limit: 10,
      offset: 0,
    });
    expect(asc.items.map((f) => f.id)).toEqual([
      "file-03.wav", // null sorts first ascending
      "file-02.wav", // 1
      "file-00.wav", // 3
      "file-01.wav", // 5
    ]);

    const desc = findAllActivePaged(db, {
      tags: ["score-test"],
      sortBy: "score",
      sortDir: "desc",
      limit: 10,
      offset: 0,
    });
    expect(desc.items.map((f) => f.id)).toEqual([
      "file-01.wav", // 5
      "file-00.wav", // 3
      "file-02.wav", // 1
      "file-03.wav", // null sorts last descending
    ]);
  });
});

describe("getLibraryStats", () => {
  it("computes unfiltered, library-wide aggregate counts", () => {
    // Base fixture: 25 files, all unknown status and unscored.
    insertAudioFile(db, makeFile({ id: "scored.wav" }));
    insertAudioFile(db, makeFile({ id: "draft.wav", status: "draft" }));
    insertAudioFile(db, makeFile({ id: "draft-scored.wav", status: "draft" }));
    setScore(db, "scored.wav", 4);
    setScore(db, "draft-scored.wav", 2);

    const stats = getLibraryStats(db);

    expect(stats.total).toBe(28);
    expect(stats.draftCount).toBe(2); // draft.wav + draft-scored.wav
    expect(stats.unscoredCount).toBe(26); // everything except scored.wav and draft-scored.wav
  });

  it("excludes removed files from every bucket", () => {
    const before = getLibraryStats(db);
    expect(before.total).toBe(25);

    markRemoved(db, ["file-00.wav"], new Date().toISOString());

    const after = getLibraryStats(db);
    expect(after.total).toBe(24);
  });
});

describe("setScore", () => {
  it("sets and clears a file's score", () => {
    setScore(db, "file-00.wav", 5);
    expect(findById(db, "file-00.wav")!.score).toBe(5);

    setScore(db, "file-00.wav", null);
    expect(findById(db, "file-00.wav")!.score).toBeNull();
  });

  it("leaves other files' scores untouched", () => {
    setScore(db, "file-00.wav", 3);
    expect(findById(db, "file-01.wav")!.score).toBeNull();
  });
});

describe("setScoreForFiles", () => {
  it("overwrites the score for every listed file, leaving others untouched", () => {
    setScore(db, "file-00.wav", 1);

    setScoreForFiles(db, ["file-00.wav", "file-01.wav"], 4);

    expect(findById(db, "file-00.wav")!.score).toBe(4);
    expect(findById(db, "file-01.wav")!.score).toBe(4);
    expect(findById(db, "file-02.wav")!.score).toBeNull();
  });

  it("does nothing for an empty id list", () => {
    expect(() => setScoreForFiles(db, [], 4)).not.toThrow();
    expect(findById(db, "file-00.wav")!.score).toBeNull();
  });
});

describe("reactivating a soft-removed file (updateAudioFileMetadata)", () => {
  it("reappearing file is reactivated without throwing, preserving its prior status/tags/score", () => {
    updateStatus(db, "file-00.wav", "released");
    setScore(db, "file-00.wav", 5);
    setTags(db, "file-00.wav", ["favorite", "mix-ready"]);

    markRemoved(db, ["file-00.wav"], new Date().toISOString());
    expect(findById(db, "file-00.wav")!.isRemoved).toBe(true);

    // Reappearance: the row's id/path already exists (soft-removed), so the scanner
    // routes it through updateAudioFileMetadata rather than insertAudioFile — this must
    // not throw a UNIQUE constraint error, and must leave status/tags/score untouched.
    expect(() =>
      updateAudioFileMetadata(db, makeFile({ id: "file-00.wav", size: 200 }))
    ).not.toThrow();

    const reactivated = findById(db, "file-00.wav")!;
    expect(reactivated.isRemoved).toBe(false);
    expect(reactivated.status).toBe("released");
    expect(reactivated.score).toBe(5);
    expect(reactivated.tags.sort()).toEqual(["favorite", "mix-ready"]);
    expect(reactivated.size).toBe(200); // filesystem-derived fields do refresh
  });
});

describe("addTagsToFiles", () => {
  it("adds tags to every listed file without removing a file's existing tags", () => {
    setTags(db, "file-00.wav", ["existing"]);

    addTagsToFiles(db, ["file-00.wav", "file-01.wav"], ["batch"]);

    expect(findById(db, "file-00.wav")!.tags.sort()).toEqual(["batch", "existing"]);
    expect(findById(db, "file-01.wav")!.tags).toEqual(["batch"]);
    expect(findById(db, "file-02.wav")!.tags).toEqual([]);
  });
});
