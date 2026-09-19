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
  getFileStats,
  markRemoved,
  moveFile,
  cloneFile,
  type AudioFileUpsertInput,
} from "../src/database/repositories/audioFileRepository.js";
import {
  upsertProject,
  findById as findProjectById,
  updateStatus as updateProjectStatus,
  getProjectStats,
} from "../src/database/repositories/projectRepository.js";
import { syncProjectFromFiles } from "../src/database/repositories/linkSync.js";
import type { DawType } from "../src/scanner/dawDetector.js";
import { UNKNOWN_STATUS_KEY } from "../src/models/AudioFile.js";
import { findAll as findAllStatuses } from "../src/database/repositories/statusRepository.js";

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

describe("getFileStats", () => {
  it("computes unfiltered, library-wide per-status counts", () => {
    // Base fixture: 25 files, all "unknown" status.
    insertAudioFile(db, makeFile({ id: "draft1.wav", status: "draft" }));
    insertAudioFile(db, makeFile({ id: "draft2.wav", status: "draft" }));
    insertAudioFile(db, makeFile({ id: "mixing.wav", status: "needs_mixing" }));
    insertAudioFile(db, makeFile({ id: "done.wav", status: "done" }));
    insertAudioFile(db, makeFile({ id: "released.wav", status: "released" }));

    const stats = getFileStats(db);

    expect(stats.total).toBe(30); // 25 base fixtures + 5 added here
    expect(stats.byStatus).toEqual({
      unknown: 25,
      draft: 2,
      needs_mixing: 1,
      done: 1,
      released: 1,
    });
  });

  it("includes every status key with an explicit 0 when no rows match it, not omitted (zero-fill guarantee)", () => {
    // Base fixture is 25 "unknown"-status files; no draft/needs_mixing/done/released rows
    // exist at all. A GROUP BY-based implementation would silently omit those keys instead
    // of returning an explicit 0 for them.
    const stats = getFileStats(db);

    const expectedKeys = [UNKNOWN_STATUS_KEY, ...findAllStatuses(db).map((s) => s.key)];
    expect(Object.keys(stats.byStatus).sort()).toEqual(expectedKeys.sort());
    expect(stats.byStatus.draft).toBe(0);
    expect(stats.byStatus.needs_mixing).toBe(0);
    expect(stats.byStatus.done).toBe(0);
    expect(stats.byStatus.released).toBe(0);
    expect(stats.byStatus.unknown).toBe(25);
  });

  it("does not choke on a SQL-metacharacter-laden status value (parameterized query regression check)", () => {
    // Statuses are now user-created catalog strings, not a compile-time constant, so the
    // previous string-interpolation-into-column-alias approach would have been SQL-injection-
    // shaped here. Bypass the API's slugify entirely (as if a row already existed with an
    // adversarial value) and confirm getFileStats still just counts it safely via the
    // parameterized GROUP BY, without throwing or corrupting the schema.
    const evilStatus = `x'; DROP TABLE audio_files; --`;
    insertAudioFile(db, makeFile({ id: "evil.wav", status: evilStatus }));

    expect(() => getFileStats(db)).not.toThrow();
    const stats = getFileStats(db);
    // The row itself is never lost or miscounted, and the table survives intact — the only
    // real proof needed that the query text is genuinely parameterized rather than
    // string-interpolated (a status value never appears in the query text at all, so an
    // adversarial value that isn't a real catalog key simply doesn't get its own zero-filled
    // bucket in byStatus, same as any other never-validated orphan value would not; it's still
    // safely counted in `total`, which is the injection-relevant guarantee).
    expect(stats.total).toBe(26);
    expect(stats.byStatus.unknown).toBe(25); // unaffected by the adversarial row
    const row = db.prepare(`SELECT COUNT(*) AS c FROM audio_files`).get() as { c: number };
    expect(row.c).toBe(26);
  });

  it("excludes removed files from the total and their status bucket", () => {
    updateStatus(db, "file-00.wav", "draft");
    const before = getFileStats(db);
    expect(before.total).toBe(25);
    expect(before.byStatus.draft).toBe(1);

    markRemoved(db, ["file-00.wav"], new Date().toISOString());

    const after = getFileStats(db);
    expect(after.total).toBe(24);
    expect(after.byStatus.draft).toBe(0);
  });

  it("is unaffected by rows in the projects table (no cross-table contamination)", () => {
    // Seed a DIFFERENT count of draft rows in each table and confirm each function's
    // numbers reflect only its own table, not a mix of both.
    updateStatus(db, "file-00.wav", "draft");
    updateStatus(db, "file-01.wav", "draft");
    updateStatus(db, "file-02.wav", "draft"); // 3 draft files total

    for (let i = 0; i < 7; i++) {
      const id = `cross-project-${i}`;
      upsertProject(db, makeProject(id));
      updateProjectStatus(db, id, "draft"); // 7 draft projects total
    }

    const fileStats = getFileStats(db);
    const projectStats = getProjectStats(db);

    expect(fileStats.byStatus.draft).toBe(3);
    expect(projectStats.byStatus.draft).toBe(7);
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

const MUSIC_ROOT = "/Music";

/** `dawType` defaults to undefined (a plain, non-DAW-classified folder row — the same
 * shape the scanner writes for a top-level folder that wasn't recognized as a DAW
 * project) — pass an explicit `dawType` to construct a DAW-classified project fixture. */
function makeProject(id: string, dawType?: DawType) {
  const now = new Date().toISOString();
  return {
    id,
    name: id,
    path: `${MUSIC_ROOT}/${id}`,
    dawType,
    firstSeenAt: now,
    lastSeenAt: now,
    hasVideo: false,
    hasImage: false,
    contentModifiedAt: null,
  };
}

function tagIdsFor(dbInstance: Database.Database, audioFileId: string): number[] {
  const rows = dbInstance
    .prepare(`SELECT tag_id FROM audio_file_tags WHERE audio_file_id = ?`)
    .all(audioFileId) as { tag_id: number }[];
  return rows.map((r) => r.tag_id).sort((a, b) => a - b);
}

describe("moveFile", () => {
  it("rekeys id/path fields, preserving status/tags/score, when the file stays under the same project", () => {
    upsertProject(db, makeProject("ProjectA", "ableton"));
    insertAudioFile(
      db,
      makeFile({
        id: "ProjectA/track1.wav",
        path: `${MUSIC_ROOT}/ProjectA/track1.wav`,
        relativePath: "ProjectA/track1.wav",
        filename: "track1.wav",
        containingFolder: `${MUSIC_ROOT}/ProjectA`,
        projectId: "ProjectA",
      })
    );
    updateStatus(db, "ProjectA/track1.wav", "draft");
    setScore(db, "ProjectA/track1.wav", 4);
    setTags(db, "ProjectA/track1.wav", ["mix", "vocals"]);

    const result = moveFile(db, "ProjectA/track1.wav", `${MUSIC_ROOT}/ProjectA/renamed.wav`, MUSIC_ROOT);

    expect(findById(db, "ProjectA/track1.wav")).toBeUndefined();
    expect(result.id).toBe("ProjectA/renamed.wav");
    expect(result.status).toBe("draft");
    expect(result.score).toBe(4);
    expect(result.tags.sort()).toEqual(["mix", "vocals"]);
    expect(result.projectId).toBe("ProjectA");
    expect(result.filename).toBe("renamed.wav");
    expect(result.relativePath).toBe("ProjectA/renamed.wav");
    expect(result.containingFolder).toBe(`${MUSIC_ROOT}/ProjectA`);

    // Prove the join rows were actually rekeyed, not orphaned, via a direct query.
    expect(tagIdsFor(db, "ProjectA/track1.wav")).toEqual([]);
    expect(tagIdsFor(db, "ProjectA/renamed.wav")).toHaveLength(2);
  });

  it("updates projectId and recomputes both projects' aggregate scores when the file moves to a different project", () => {
    upsertProject(db, makeProject("ProjectA", "ableton"));
    upsertProject(db, makeProject("ProjectB", "ableton"));
    insertAudioFile(
      db,
      makeFile({
        id: "ProjectA/onlyfive.wav",
        path: `${MUSIC_ROOT}/ProjectA/onlyfive.wav`,
        relativePath: "ProjectA/onlyfive.wav",
        filename: "onlyfive.wav",
        containingFolder: `${MUSIC_ROOT}/ProjectA`,
        projectId: "ProjectA",
      })
    );
    insertAudioFile(
      db,
      makeFile({
        id: "ProjectB/existing.wav",
        path: `${MUSIC_ROOT}/ProjectB/existing.wav`,
        relativePath: "ProjectB/existing.wav",
        filename: "existing.wav",
        containingFolder: `${MUSIC_ROOT}/ProjectB`,
        projectId: "ProjectB",
      })
    );
    setScore(db, "ProjectA/onlyfive.wav", 5);
    setScore(db, "ProjectB/existing.wav", 2);
    syncProjectFromFiles(db, "ProjectA");
    syncProjectFromFiles(db, "ProjectB");
    expect(findProjectById(db, "ProjectA")!.score).toBe(5);
    expect(findProjectById(db, "ProjectB")!.score).toBe(2);

    const result = moveFile(
      db,
      "ProjectA/onlyfive.wav",
      `${MUSIC_ROOT}/ProjectB/onlyfive.wav`,
      MUSIC_ROOT
    );

    expect(result.projectId).toBe("ProjectB");
    // ProjectA lost its only scored file, so its aggregate score should drop.
    expect(findProjectById(db, "ProjectA")!.score).toBeNull();
    // ProjectB gains a file scoring higher than its previous max.
    expect(findProjectById(db, "ProjectB")!.score).toBe(5);
  });

  it("clears projectId and recomputes the old project's aggregate when the file moves outside any project", () => {
    upsertProject(db, makeProject("ProjectA"));
    insertAudioFile(
      db,
      makeFile({
        id: "ProjectA/onlyfive.wav",
        path: `${MUSIC_ROOT}/ProjectA/onlyfive.wav`,
        relativePath: "ProjectA/onlyfive.wav",
        filename: "onlyfive.wav",
        containingFolder: `${MUSIC_ROOT}/ProjectA`,
        projectId: "ProjectA",
      })
    );
    setScore(db, "ProjectA/onlyfive.wav", 5);
    syncProjectFromFiles(db, "ProjectA");
    expect(findProjectById(db, "ProjectA")!.score).toBe(5);

    const result = moveFile(db, "ProjectA/onlyfive.wav", `${MUSIC_ROOT}/Unfiled/onlyfive.wav`, MUSIC_ROOT);

    expect(result.projectId).toBeUndefined();
    expect(findProjectById(db, "ProjectA")!.score).toBeNull();
  });

  it("rolls back the whole transaction if the destination id already exists, leaving both rows untouched", () => {
    upsertProject(db, makeProject("ProjectA"));
    insertAudioFile(
      db,
      makeFile({
        id: "ProjectA/a.wav",
        path: `${MUSIC_ROOT}/ProjectA/a.wav`,
        relativePath: "ProjectA/a.wav",
        filename: "a.wav",
        containingFolder: `${MUSIC_ROOT}/ProjectA`,
        projectId: "ProjectA",
      })
    );
    insertAudioFile(
      db,
      makeFile({
        id: "ProjectA/b.wav",
        path: `${MUSIC_ROOT}/ProjectA/b.wav`,
        relativePath: "ProjectA/b.wav",
        filename: "b.wav",
        containingFolder: `${MUSIC_ROOT}/ProjectA`,
        projectId: "ProjectA",
      })
    );
    setScore(db, "ProjectA/a.wav", 3);
    setTags(db, "ProjectA/a.wav", ["keep"]);

    expect(() =>
      moveFile(db, "ProjectA/a.wav", `${MUSIC_ROOT}/ProjectA/b.wav`, MUSIC_ROOT)
    ).toThrow();

    // Nothing partially rekeyed: the source row, its path fields, and its tag join
    // rows are exactly as they were before the failed attempt.
    const a = findById(db, "ProjectA/a.wav")!;
    expect(a).toBeDefined();
    expect(a.score).toBe(3);
    expect(a.tags).toEqual(["keep"]);
    expect(tagIdsFor(db, "ProjectA/a.wav")).toHaveLength(1);

    const b = findById(db, "ProjectA/b.wav")!;
    expect(b).toBeDefined();
    expect(b.score).toBeNull();
  });

  it("rekeys tag join rows without tripping foreign-key enforcement (PRAGMA defer_foreign_keys)", () => {
    // Scoped to this test only, mirroring production's openDb() which always runs
    // with foreign_keys = ON — the raw in-memory DB the other tests share does not,
    // so this is the one place that actually exercises real FK enforcement.
    db.pragma("foreign_keys = ON");

    upsertProject(db, makeProject("ProjectA"));
    insertAudioFile(
      db,
      makeFile({
        id: "ProjectA/track1.wav",
        path: `${MUSIC_ROOT}/ProjectA/track1.wav`,
        relativePath: "ProjectA/track1.wav",
        filename: "track1.wav",
        containingFolder: `${MUSIC_ROOT}/ProjectA`,
        projectId: "ProjectA",
      })
    );
    setTags(db, "ProjectA/track1.wav", ["mix"]);

    expect(() =>
      moveFile(db, "ProjectA/track1.wav", `${MUSIC_ROOT}/ProjectA/renamed.wav`, MUSIC_ROOT)
    ).not.toThrow();

    expect(tagIdsFor(db, "ProjectA/renamed.wav")).toHaveLength(1);
  });

  it("throws when the source id doesn't exist", () => {
    expect(() => moveFile(db, "does-not-exist.wav", `${MUSIC_ROOT}/x.wav`, MUSIC_ROOT)).toThrow();
  });
});

describe("cloneFile", () => {
  it("creates a new row preserving status/tags/score, leaving the source completely untouched", () => {
    upsertProject(db, makeProject("ProjectA", "ableton"));
    insertAudioFile(
      db,
      makeFile({
        id: "ProjectA/track1.wav",
        path: `${MUSIC_ROOT}/ProjectA/track1.wav`,
        relativePath: "ProjectA/track1.wav",
        filename: "track1.wav",
        containingFolder: `${MUSIC_ROOT}/ProjectA`,
        projectId: "ProjectA",
      })
    );
    updateStatus(db, "ProjectA/track1.wav", "released");
    setScore(db, "ProjectA/track1.wav", 4);
    setTags(db, "ProjectA/track1.wav", ["mix", "vocals"]);

    const before = findById(db, "ProjectA/track1.wav")!;
    const tagCountBefore = (db.prepare(`SELECT COUNT(*) AS c FROM tags`).get() as { c: number }).c;

    const clone = cloneFile(
      db,
      "ProjectA/track1.wav",
      `${MUSIC_ROOT}/ProjectA/track1-copy.wav`,
      MUSIC_ROOT
    );

    expect(clone.id).toBe("ProjectA/track1-copy.wav");
    expect(clone.status).toBe("released");
    expect(clone.score).toBe(4);
    expect(clone.tags.sort()).toEqual(["mix", "vocals"]);
    expect(clone.projectId).toBe("ProjectA");

    // Source row is completely untouched.
    const after = findById(db, "ProjectA/track1.wav")!;
    expect(after).toEqual(before);

    // New row's join rows point at the SAME tag_id values as the source's — not new
    // duplicate `tags` rows.
    const sourceTagIds = tagIdsFor(db, "ProjectA/track1.wav");
    const cloneTagIds = tagIdsFor(db, "ProjectA/track1-copy.wav");
    expect(cloneTagIds).toEqual(sourceTagIds);

    const tagCountAfter = (db.prepare(`SELECT COUNT(*) AS c FROM tags`).get() as { c: number }).c;
    expect(tagCountAfter).toBe(tagCountBefore);
  });

  it("landing under a different project recomputes only the new project's aggregate", () => {
    upsertProject(db, makeProject("ProjectA", "ableton"));
    upsertProject(db, makeProject("ProjectB", "ableton"));
    insertAudioFile(
      db,
      makeFile({
        id: "ProjectA/onlyfive.wav",
        path: `${MUSIC_ROOT}/ProjectA/onlyfive.wav`,
        relativePath: "ProjectA/onlyfive.wav",
        filename: "onlyfive.wav",
        containingFolder: `${MUSIC_ROOT}/ProjectA`,
        projectId: "ProjectA",
      })
    );
    setScore(db, "ProjectA/onlyfive.wav", 5);
    syncProjectFromFiles(db, "ProjectA");
    syncProjectFromFiles(db, "ProjectB");
    expect(findProjectById(db, "ProjectA")!.score).toBe(5);
    expect(findProjectById(db, "ProjectB")!.score).toBeNull();

    const clone = cloneFile(
      db,
      "ProjectA/onlyfive.wav",
      `${MUSIC_ROOT}/ProjectB/onlyfive.wav`,
      MUSIC_ROOT
    );

    expect(clone.projectId).toBe("ProjectB");
    // Source project's aggregate is unaffected — the source file itself never changed.
    expect(findProjectById(db, "ProjectA")!.score).toBe(5);
    // New project gains the clone's score.
    expect(findProjectById(db, "ProjectB")!.score).toBe(5);
  });

  it("throws when the source id doesn't exist", () => {
    expect(() => cloneFile(db, "does-not-exist.wav", `${MUSIC_ROOT}/x.wav`, MUSIC_ROOT)).toThrow();
  });
});

describe("ancestor-project matching does segment-boundary matching, not naive string-prefix matching", () => {
  it("moveFile: a file landing in a sibling folder whose name merely starts with a project's name is NOT associated with that project", () => {
    // Project "Demo" and an unrelated sibling folder "DemoTracks" that happens to share
    // "Demo" as a string prefix. A naive `fileRelativePath.startsWith(projectId)` check
    // (instead of exact path-segment matching) would incorrectly associate
    // "DemoTracks/track.wav" with project "Demo".
    upsertProject(db, makeProject("Demo", "ableton"));
    insertAudioFile(
      db,
      makeFile({
        id: "Unfiled/track.wav",
        path: `${MUSIC_ROOT}/Unfiled/track.wav`,
        relativePath: "Unfiled/track.wav",
        filename: "track.wav",
        containingFolder: `${MUSIC_ROOT}/Unfiled`,
      })
    );

    const result = moveFile(
      db,
      "Unfiled/track.wav",
      `${MUSIC_ROOT}/DemoTracks/track.wav`,
      MUSIC_ROOT
    );

    expect(result.projectId).toBeUndefined();
  });

  it("cloneFile: a file landing in a sibling folder whose name merely starts with a project's name is NOT associated with that project", () => {
    upsertProject(db, makeProject("Demo", "ableton"));
    insertAudioFile(
      db,
      makeFile({
        id: "Unfiled/track.wav",
        path: `${MUSIC_ROOT}/Unfiled/track.wav`,
        relativePath: "Unfiled/track.wav",
        filename: "track.wav",
        containingFolder: `${MUSIC_ROOT}/Unfiled`,
      })
    );

    const clone = cloneFile(
      db,
      "Unfiled/track.wav",
      `${MUSIC_ROOT}/DemoTracks/track-copy.wav`,
      MUSIC_ROOT
    );

    expect(clone.projectId).toBeUndefined();
  });

  it("moveFile: a file landing directly inside the correctly-named project IS associated with it (positive control for the above)", () => {
    upsertProject(db, makeProject("Demo", "ableton"));
    insertAudioFile(
      db,
      makeFile({
        id: "Unfiled/track.wav",
        path: `${MUSIC_ROOT}/Unfiled/track.wav`,
        relativePath: "Unfiled/track.wav",
        filename: "track.wav",
        containingFolder: `${MUSIC_ROOT}/Unfiled`,
      })
    );

    const result = moveFile(db, "Unfiled/track.wav", `${MUSIC_ROOT}/Demo/track.wav`, MUSIC_ROOT);

    expect(result.projectId).toBe("Demo");
  });
});

describe("ancestor-project matching only associates with DAW-classified project rows, not plain folders", () => {
  it("moveFile: a file landing inside a PLAIN (non-DAW) top-level folder is NOT associated with it, matching what a fresh scan would produce", () => {
    // "Samples" got a `projects` row during the scan (every top-level folder does, so the
    // UI can list plain folders alongside real projects), but it was never DAW-classified
    // (no dawType) — the scanner's real association logic never links files to it, so
    // neither should moveFile/cloneFile.
    upsertProject(db, makeProject("Samples"));
    insertAudioFile(
      db,
      makeFile({
        id: "Unfiled/track.wav",
        path: `${MUSIC_ROOT}/Unfiled/track.wav`,
        relativePath: "Unfiled/track.wav",
        filename: "track.wav",
        containingFolder: `${MUSIC_ROOT}/Unfiled`,
      })
    );

    const result = moveFile(db, "Unfiled/track.wav", `${MUSIC_ROOT}/Samples/track.wav`, MUSIC_ROOT);

    expect(result.projectId).toBeUndefined();
  });

  it("cloneFile: a file landing inside a PLAIN (non-DAW) top-level folder is NOT associated with it, matching what a fresh scan would produce", () => {
    upsertProject(db, makeProject("Samples"));
    insertAudioFile(
      db,
      makeFile({
        id: "Unfiled/track.wav",
        path: `${MUSIC_ROOT}/Unfiled/track.wav`,
        relativePath: "Unfiled/track.wav",
        filename: "track.wav",
        containingFolder: `${MUSIC_ROOT}/Unfiled`,
      })
    );

    const clone = cloneFile(
      db,
      "Unfiled/track.wav",
      `${MUSIC_ROOT}/Samples/track-copy.wav`,
      MUSIC_ROOT
    );

    expect(clone.projectId).toBeUndefined();
  });

  it("moveFile: a file landing inside a DAW-classified project folder IS associated with it (positive control for the above)", () => {
    upsertProject(db, makeProject("RealProject", "ableton"));
    insertAudioFile(
      db,
      makeFile({
        id: "Unfiled/track.wav",
        path: `${MUSIC_ROOT}/Unfiled/track.wav`,
        relativePath: "Unfiled/track.wav",
        filename: "track.wav",
        containingFolder: `${MUSIC_ROOT}/Unfiled`,
      })
    );

    const result = moveFile(
      db,
      "Unfiled/track.wav",
      `${MUSIC_ROOT}/RealProject/track.wav`,
      MUSIC_ROOT
    );

    expect(result.projectId).toBe("RealProject");
  });
});

describe("moveFile/cloneFile reject an out-of-root destination instead of silently corrupting the DB", () => {
  it("moveFile throws when newAbsolutePath resolves outside musicRoot", () => {
    upsertProject(db, makeProject("ProjectA", "ableton"));
    insertAudioFile(
      db,
      makeFile({
        id: "ProjectA/track1.wav",
        path: `${MUSIC_ROOT}/ProjectA/track1.wav`,
        relativePath: "ProjectA/track1.wav",
        filename: "track1.wav",
        containingFolder: `${MUSIC_ROOT}/ProjectA`,
        projectId: "ProjectA",
      })
    );

    expect(() =>
      moveFile(db, "ProjectA/track1.wav", "/Elsewhere/track1.wav", MUSIC_ROOT)
    ).toThrow();

    // Nothing was mutated: the source row is untouched, no bogus `..`-prefixed row exists.
    const source = findById(db, "ProjectA/track1.wav")!;
    expect(source).toBeDefined();
    expect(source.path).toBe(`${MUSIC_ROOT}/ProjectA/track1.wav`);
  });

  it("cloneFile throws when newAbsolutePath resolves outside musicRoot", () => {
    upsertProject(db, makeProject("ProjectA", "ableton"));
    insertAudioFile(
      db,
      makeFile({
        id: "ProjectA/track1.wav",
        path: `${MUSIC_ROOT}/ProjectA/track1.wav`,
        relativePath: "ProjectA/track1.wav",
        filename: "track1.wav",
        containingFolder: `${MUSIC_ROOT}/ProjectA`,
        projectId: "ProjectA",
      })
    );

    expect(() =>
      cloneFile(db, "ProjectA/track1.wav", "/Elsewhere/track1-copy.wav", MUSIC_ROOT)
    ).toThrow();

    // No stray clone row was created under a bogus `..`-prefixed id.
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM audio_files`).get() as { c: number }).c;
    expect(total).toBe(26); // 25 base fixtures + the one ProjectA/track1.wav inserted above
  });
});
