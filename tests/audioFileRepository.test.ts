import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  findAllActivePaged,
  insertAudioFile,
  setTags,
  getLibraryStats,
  updateStatus,
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
    isExportCandidate: false,
    exportConfidence: 0.3,
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

    const { items, total } = findAllActivePaged(db, { tag: "favorite", limit: 10, offset: 0 });
    expect(total).toBe(2);
    expect(items).toHaveLength(2);
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
});

describe("getLibraryStats", () => {
  it("computes unfiltered, library-wide aggregate counts", () => {
    // Base fixture: 25 files, all unknown/non-export/0.3 confidence (below the 0.5 threshold).
    insertAudioFile(
      db,
      makeFile({ id: "export-ready.wav", isExportCandidate: true, exportConfidence: 0.9 })
    );
    insertAudioFile(
      db,
      makeFile({
        id: "needs-review.wav",
        isExportCandidate: true,
        exportConfidence: 0.75,
        status: "unknown",
      })
    );
    insertAudioFile(db, makeFile({ id: "draft.wav", status: "draft", exportConfidence: 0.6 }));
    updateStatus(db, "export-ready.wav", "finished");

    const stats = getLibraryStats(db);

    expect(stats.total).toBe(28);
    expect(stats.likelyExports).toBe(2); // export-ready + needs-review
    expect(stats.needsReview).toBe(1); // needs-review only (export-ready is 'finished', not 'unknown')
    expect(stats.draftCount).toBe(1);
    expect(stats.lowConfidenceCount).toBe(25); // the base fixture, all at 0.3 confidence
  });

  it("excludes removed files from every bucket", () => {
    const before = getLibraryStats(db);
    expect(before.total).toBe(25);

    markRemoved(db, ["file-00.wav"], new Date().toISOString());

    const after = getLibraryStats(db);
    expect(after.total).toBe(24);
  });
});
