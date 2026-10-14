import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  findAllActivePaged,
  findById,
  setTags,
  setScore,
  setNotes,
  setScoreForProjects,
  addTagsToProjects,
  updateStatus,
  upsertProject,
  markRemoved,
  loadActiveProjectIds,
  getProjectStats,
  getProjectTagCounts,
} from "../src/database/repositories/projectRepository.js";
import { insertAudioFile, type AudioFileUpsertInput } from "../src/database/repositories/audioFileRepository.js";
import type { Project } from "../src/models/Project.js";
import { UNKNOWN_STATUS_KEY } from "../src/models/AudioFile.js";
import { findAll as findAllStatuses } from "../src/database/repositories/statusRepository.js";

let db: Database.Database;

function makeProject(overrides: Partial<Omit<Project, "status" | "isRemoved" | "tags">> & { id: string }) {
  const now = new Date().toISOString();
  return {
    name: overrides.id,
    path: `/Music/${overrides.id}`,
    firstSeenAt: now,
    lastSeenAt: now,
    hasVideo: false,
    hasImage: false,
    contentModifiedAt: null,
    ...overrides,
  };
}

/** Minimal audio-file fixture, for the one test here that needs real files to exercise the
 * "audioFileCount" sort key (mirrors audioFileRepository.test.ts's own makeFile). */
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
  for (let i = 0; i < 22; i++) {
    const id = `Project ${String(i).padStart(2, "0")}`;
    upsertProject(db, makeProject({ id, name: id }));
  }
});

afterEach(() => {
  db.close();
});

describe("projectRepository.findAllActivePaged", () => {
  it("returns the full total count regardless of page size", () => {
    const { total } = findAllActivePaged(db, { limit: 10, offset: 0 });
    expect(total).toBe(22);
  });

  it("returns only the requested page slice, ordered by name", () => {
    const page1 = findAllActivePaged(db, { limit: 10, offset: 0 });
    const page2 = findAllActivePaged(db, { limit: 10, offset: 10 });
    const page3 = findAllActivePaged(db, { limit: 10, offset: 20 });

    expect(page1.items).toHaveLength(10);
    expect(page2.items).toHaveLength(10);
    expect(page3.items).toHaveLength(2);

    const allIds = [...page1.items, ...page2.items, ...page3.items].map((p) => p.id);
    expect(new Set(allIds).size).toBe(22);
    expect(page1.items[0]!.name).toBe("Project 00");
  });

  it("filters by search across name and id, and reflects the filtered count", () => {
    upsertProject(db, makeProject({ id: "Ambient Sketch", name: "Ambient Sketch" }));

    const { items, total } = findAllActivePaged(db, { search: "ambient", limit: 10, offset: 0 });

    expect(total).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("Ambient Sketch");
  });

  it("filters by status", () => {
    updateStatus(db, "Project 00", "draft");
    updateStatus(db, "Project 01", "released");

    const { items, total } = findAllActivePaged(db, { statuses: ["draft"], limit: 10, offset: 0 });

    expect(total).toBe(1);
    expect(items[0]!.id).toBe("Project 00");
  });

  it("matches any of several statuses (OR)", () => {
    updateStatus(db, "Project 00", "draft");
    updateStatus(db, "Project 01", "released");
    updateStatus(db, "Project 02", "done");

    const { total } = findAllActivePaged(db, { statuses: ["draft", "released"], limit: 10, offset: 0 });

    expect(total).toBe(2);
  });

  it("filters by an exact score", () => {
    setScore(db, "Project 00", 3);
    setScore(db, "Project 01", 5);

    const { items, total } = findAllActivePaged(db, { scores: [3], limit: 10, offset: 0 });

    expect(total).toBe(1);
    expect(items[0]!.id).toBe("Project 00");
  });

  it("matches any of several scores (OR)", () => {
    setScore(db, "Project 00", 3);
    setScore(db, "Project 01", 5);
    setScore(db, "Project 02", 1);

    const { total } = findAllActivePaged(db, { scores: [3, 5], limit: 10, offset: 0 });

    expect(total).toBe(2);
  });

  it("filters for unscored projects with scores: [null]", () => {
    setScore(db, "Project 00", 3);

    const { total } = findAllActivePaged(db, { scores: [null], limit: 30, offset: 0 });

    expect(total).toBe(21); // all 22 fixtures minus Project 00
  });

  it("filters by tag", () => {
    setTags(db, "Project 00", ["favorite"]);
    setTags(db, "Project 01", ["favorite"]);

    const { items, total } = findAllActivePaged(db, { tags: ["favorite"], limit: 10, offset: 0 });

    expect(total).toBe(2);
    expect(items.map((p) => p.id).sort()).toEqual(["Project 00", "Project 01"]);
  });

  it("matches any of several tags (OR)", () => {
    setTags(db, "Project 00", ["favorite"]);
    setTags(db, "Project 01", ["archived"]);
    setTags(db, "Project 02", ["unrelated"]);

    const { total } = findAllActivePaged(db, { tags: ["favorite", "archived"], limit: 10, offset: 0 });

    expect(total).toBe(2);
  });

  it("sorts by content_modified_at when sortBy is 'modifiedAt'", () => {
    upsertProject(db, makeProject({ id: "SortTest Oldest", contentModifiedAt: "2026-01-01T00:00:00.000Z" }));
    upsertProject(db, makeProject({ id: "SortTest Newest", contentModifiedAt: "2026-03-01T00:00:00.000Z" }));
    upsertProject(db, makeProject({ id: "SortTest Middle", contentModifiedAt: "2026-02-01T00:00:00.000Z" }));

    const asc = findAllActivePaged(db, { search: "SortTest", sortBy: "modifiedAt", sortDir: "asc", limit: 10, offset: 0 });
    expect(asc.items.map((p) => p.id)).toEqual(["SortTest Oldest", "SortTest Middle", "SortTest Newest"]);

    const desc = findAllActivePaged(db, { search: "SortTest", sortBy: "modifiedAt", sortDir: "desc", limit: 10, offset: 0 });
    expect(desc.items.map((p) => p.id)).toEqual(["SortTest Newest", "SortTest Middle", "SortTest Oldest"]);
  });

  it("sorts by score when sortBy is 'score', with unscored projects first ascending / last descending", () => {
    upsertProject(db, makeProject({ id: "SortScore Unscored" }));
    upsertProject(db, makeProject({ id: "SortScore Low" }));
    setScore(db, "SortScore Low", 1);
    upsertProject(db, makeProject({ id: "SortScore Mid" }));
    setScore(db, "SortScore Mid", 3);
    upsertProject(db, makeProject({ id: "SortScore High" }));
    setScore(db, "SortScore High", 5);

    const asc = findAllActivePaged(db, { search: "SortScore", sortBy: "score", sortDir: "asc", limit: 10, offset: 0 });
    expect(asc.items.map((p) => p.id)).toEqual([
      "SortScore Unscored",
      "SortScore Low",
      "SortScore Mid",
      "SortScore High",
    ]);

    const desc = findAllActivePaged(db, { search: "SortScore", sortBy: "score", sortDir: "desc", limit: 10, offset: 0 });
    expect(desc.items.map((p) => p.id)).toEqual([
      "SortScore High",
      "SortScore Mid",
      "SortScore Low",
      "SortScore Unscored",
    ]);
  });

  it("defaults to sorting by name when sortBy is omitted", () => {
    const { items } = findAllActivePaged(db, { limit: 3, offset: 0 });
    expect(items.map((p) => p.name)).toEqual(["Project 00", "Project 01", "Project 02"]);
  });

  it("sorts by status, type, tags, and audioFileCount (the 4 new sort keys)", () => {
    upsertProject(db, makeProject({ id: "SortKeys A", dawType: "ableton" }));
    upsertProject(db, makeProject({ id: "SortKeys B", dawType: "cubase" }));
    upsertProject(db, makeProject({ id: "SortKeys C" })); // no dawType
    setTags(db, "SortKeys A", ["aardvark"]);
    setTags(db, "SortKeys B", ["mango"]);
    // SortKeys C stays untagged
    updateStatus(db, "SortKeys A", "done");
    updateStatus(db, "SortKeys B", "draft");
    // SortKeys C keeps its default status (UNKNOWN_STATUS_KEY = "unknown")
    insertAudioFile(db, makeFile({ id: "sk-1.wav", projectId: "SortKeys A" }));
    insertAudioFile(db, makeFile({ id: "sk-2.wav", projectId: "SortKeys B" }));
    insertAudioFile(db, makeFile({ id: "sk-3.wav", projectId: "SortKeys B" }));
    // SortKeys C has 0 audio files

    const byStatus = findAllActivePaged(db, { search: "SortKeys", sortBy: "status", sortDir: "asc", limit: 10, offset: 0 });
    expect(byStatus.items.map((p) => p.id)).toEqual(["SortKeys A", "SortKeys B", "SortKeys C"]); // done < draft < unknown

    const byType = findAllActivePaged(db, { search: "SortKeys", sortBy: "type", sortDir: "asc", limit: 10, offset: 0 });
    expect(byType.items.map((p) => p.id)).toEqual(["SortKeys C", "SortKeys A", "SortKeys B"]); // null, "ableton", "cubase"

    const byTags = findAllActivePaged(db, { search: "SortKeys", sortBy: "tags", sortDir: "asc", limit: 10, offset: 0 });
    expect(byTags.items.map((p) => p.id)).toEqual(["SortKeys C", "SortKeys A", "SortKeys B"]); // null sorts first, then "aardvark" < "mango"

    const byCount = findAllActivePaged(db, { search: "SortKeys", sortBy: "audioFileCount", sortDir: "asc", limit: 10, offset: 0 });
    expect(byCount.items.map((p) => p.id)).toEqual(["SortKeys C", "SortKeys A", "SortKeys B"]); // 0, 1, 2
  });
});

describe("projectRepository.setTags", () => {
  it("attaches the correct tags per project without leaking tags across rows", () => {
    setTags(db, "Project 00", ["a", "b"]);
    setTags(db, "Project 01", ["c"]);

    expect(findById(db, "Project 00")!.tags.sort()).toEqual(["a", "b"]);
    expect(findById(db, "Project 01")!.tags).toEqual(["c"]);
    expect(findById(db, "Project 02")!.tags).toEqual([]);
  });

  it("replaces the full tag set on each call rather than appending", () => {
    setTags(db, "Project 00", ["a", "b"]);
    setTags(db, "Project 00", ["c"]);

    expect(findById(db, "Project 00")!.tags).toEqual(["c"]);
  });

  it("deduplicates and trims tag names", () => {
    setTags(db, "Project 00", [" a ", "a", "b", ""]);

    expect(findById(db, "Project 00")!.tags.sort()).toEqual(["a", "b"]);
  });
});

describe("projectRepository.setScoreForProjects", () => {
  it("overwrites the score for every listed project, leaving others untouched", () => {
    setScore(db, "Project 00", 1);

    setScoreForProjects(db, ["Project 00", "Project 01"], 4);

    expect(findById(db, "Project 00")!.score).toBe(4);
    expect(findById(db, "Project 01")!.score).toBe(4);
    expect(findById(db, "Project 02")!.score).toBeNull();
  });
});

describe("projectRepository.addTagsToProjects", () => {
  it("adds tags to every listed project without removing a project's existing tags", () => {
    setTags(db, "Project 00", ["existing"]);

    addTagsToProjects(db, ["Project 00", "Project 01"], ["batch"]);

    expect(findById(db, "Project 00")!.tags.sort()).toEqual(["batch", "existing"]);
    expect(findById(db, "Project 01")!.tags).toEqual(["batch"]);
    expect(findById(db, "Project 02")!.tags).toEqual([]);
  });
});

describe("projectRepository.markRemoved", () => {
  it("soft-removes only the listed project, preserving its prior status/tags/score", () => {
    updateStatus(db, "Project 00", "released");
    setScore(db, "Project 00", 5);
    setTags(db, "Project 00", ["favorite", "mix-ready"]);
    const siblingBefore = findById(db, "Project 01")!;

    // Forced 1s ahead of wall-clock `now` (the project notes' backend-testing-conventions idiom):
    // the in-memory-SQLite `beforeEach` fixture seed also stamps
    // `lastSeenAt` via `new Date().toISOString()`, and both calls are fast enough to land in the
    // same millisecond a meaningful fraction of the time — which would let a regression that
    // dropped `markRemoved`'s `last_seen_at = ?` SET clause entirely slip through by coincidence
    // (confirmed empirically: that exact mutation was previously caught only ~50% of the time).
    const nowIso = new Date(Date.now() + 1000).toISOString();
    markRemoved(db, ["Project 00"], nowIso);

    const removed = findById(db, "Project 00")!;
    expect(removed.isRemoved).toBe(true);
    expect(removed.lastSeenAt).toBe(nowIso);
    // Status/score/tags must be preserved, not cleared, in case the project reappears.
    expect(removed.status).toBe("released");
    expect(removed.score).toBe(5);
    expect(removed.tags.sort()).toEqual(["favorite", "mix-ready"]);

    // Absent from the active listing.
    const { items, total } = findAllActivePaged(db, { limit: 30, offset: 0 });
    expect(items.map((p) => p.id)).not.toContain("Project 00");
    expect(total).toBe(21); // 22 fixtures minus the one removed

    // Absent from the active-ids set used by the scanner to detect removals.
    expect(loadActiveProjectIds(db).has("Project 00")).toBe(false);
    expect(loadActiveProjectIds(db).has("Project 01")).toBe(true);

    // Sibling project untouched.
    const siblingAfter = findById(db, "Project 01")!;
    expect(siblingAfter.isRemoved).toBe(false);
    expect(siblingAfter.lastSeenAt).toBe(siblingBefore.lastSeenAt);
  });
});

describe("reactivating a soft-removed project (upsertProject)", () => {
  it("reappearing project is reactivated without throwing, preserving its prior status/tags/score/notes", () => {
    updateStatus(db, "Project 00", "released");
    setScore(db, "Project 00", 5);
    setTags(db, "Project 00", ["favorite", "mix-ready"]);
    setNotes(db, "Project 00", "Needs a final mix pass.");

    markRemoved(db, ["Project 00"], new Date().toISOString());
    expect(findById(db, "Project 00")!.isRemoved).toBe(true);

    const newLastSeenAt = new Date(Date.now() + 1000).toISOString();

    // Reappearance: the row's id already exists (soft-removed), so the scanner routes
    // it back through upsertProject's ON CONFLICT branch — this must not throw, and must
    // leave status/tags/score untouched while refreshing filesystem-derived fields.
    expect(() =>
      upsertProject(
        db,
        makeProject({
          id: "Project 00",
          name: "Project 00",
          lastSeenAt: newLastSeenAt,
          contentModifiedAt: "2026-05-01T00:00:00.000Z",
        })
      )
    ).not.toThrow();

    const reactivated = findById(db, "Project 00")!;
    expect(reactivated.isRemoved).toBe(false);
    expect(reactivated.status).toBe("released");
    expect(reactivated.score).toBe(5);
    expect(reactivated.tags.sort()).toEqual(["favorite", "mix-ready"]);
    expect(reactivated.notes).toBe("Needs a final mix pass.");
    expect(reactivated.lastSeenAt).toBe(newLastSeenAt); // filesystem-derived fields do refresh
    expect(reactivated.contentModifiedAt).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("projectRepository.setNotes", () => {
  it("defaults a newly-created project's notes to an empty string, not null/undefined", () => {
    expect(findById(db, "Project 00")!.notes).toBe("");
  });

  it("sets and clears a project's notes", () => {
    setNotes(db, "Project 00", "Great take, needs mastering.");
    expect(findById(db, "Project 00")!.notes).toBe("Great take, needs mastering.");

    setNotes(db, "Project 00", "");
    expect(findById(db, "Project 00")!.notes).toBe("");
  });

  it("leaves other projects' notes untouched", () => {
    setNotes(db, "Project 00", "Only this project.");
    expect(findById(db, "Project 01")!.notes).toBe("");
  });
});

describe("projectRepository.getProjectStats", () => {
  it("computes unfiltered, library-wide per-status counts", () => {
    // Base fixture: 22 projects, all "unknown" status, none DAW-classified.
    updateStatus(db, "Project 00", "draft");
    updateStatus(db, "Project 01", "draft");
    updateStatus(db, "Project 02", "needs_mixing");
    updateStatus(db, "Project 03", "done");
    updateStatus(db, "Project 04", "released");

    const stats = getProjectStats(db);

    expect(stats.total).toBe(22);
    expect(stats.byStatus).toEqual({
      unknown: 17,
      draft: 2,
      needs_mixing: 1,
      done: 1,
      released: 1,
    });
  });

  it("includes every status key with an explicit 0 when no rows match it, not omitted (zero-fill guarantee)", () => {
    // Base fixture is 22 "unknown"-status projects; no draft/needs_mixing/done/released rows
    // exist at all. A GROUP BY-based implementation would silently omit those keys instead
    // of returning an explicit 0 for them.
    const stats = getProjectStats(db);

    const expectedKeys = [UNKNOWN_STATUS_KEY, ...findAllStatuses(db).map((s) => s.key)];
    expect(Object.keys(stats.byStatus).sort()).toEqual(expectedKeys.sort());
    expect(stats.byStatus.draft).toBe(0);
    expect(stats.byStatus.needs_mixing).toBe(0);
    expect(stats.byStatus.done).toBe(0);
    expect(stats.byStatus.released).toBe(0);
    expect(stats.byStatus.unknown).toBe(22);
  });

  it("does not choke on a SQL-metacharacter-laden status value (parameterized query regression check)", () => {
    // Statuses are now user-created catalog strings, not a compile-time constant, so the
    // previous string-interpolation-into-column-alias approach would have been SQL-injection-
    // shaped here. Confirm getProjectStats still just counts an adversarial value safely via
    // the parameterized GROUP BY, without throwing or corrupting the schema.
    const evilStatus = `x'; DROP TABLE projects; --`;
    updateStatus(db, "Project 00", evilStatus);

    expect(() => getProjectStats(db)).not.toThrow();
    const stats = getProjectStats(db);
    // The row is never lost, and the table survives intact — proof that the query text is
    // genuinely parameterized (a status value never appears in the query text itself). An
    // adversarial value that isn't a real catalog key doesn't get its own zero-filled bucket
    // in byStatus (same as any never-validated orphan value wouldn't), but it's still safely
    // counted in `total`, which is the injection-relevant guarantee here.
    expect(stats.total).toBe(22);
    expect(stats.byStatus.unknown).toBe(21); // unaffected by the adversarial row
    const row = db.prepare(`SELECT COUNT(*) AS c FROM projects`).get() as { c: number };
    expect(row.c).toBe(22);
  });

  it("excludes removed projects from the total and their status bucket", () => {
    updateStatus(db, "Project 00", "draft");
    const before = getProjectStats(db);
    expect(before.total).toBe(22);
    expect(before.byStatus.draft).toBe(1);

    markRemoved(db, ["Project 00"], new Date().toISOString());

    const after = getProjectStats(db);
    expect(after.total).toBe(21);
    expect(after.byStatus.draft).toBe(0);
  });

  it("counts a plain, non-DAW-classified project folder (daw_type IS NULL) in the total and its status bucket", () => {
    // All 22 base fixtures are already plain (non-DAW) folders (makeProject defaults
    // dawType to undefined) — this asserts that inclusion explicitly, confirming the
    // product decision that every active project folder counts, regardless of daw_type.
    // This test would fail if a future change added a `daw_type IS NOT NULL` filter.
    upsertProject(db, makeProject({ id: "PlainFolder", name: "PlainFolder" }));
    updateStatus(db, "PlainFolder", "done");

    const stats = getProjectStats(db);

    expect(stats.total).toBe(23); // 22 base fixtures + PlainFolder
    expect(stats.byStatus.done).toBe(1);
  });

  it("counts a DAW-classified project (daw_type set, e.g. 'ableton') in the total and its status bucket", () => {
    // Complements the plain-folder test above: proves the other half of the "no daw_type
    // filter" decision — a project with a real, non-null daw_type is counted too, not just
    // NULL ones. This test would fail if a future change added a `daw_type IS NULL` filter.
    upsertProject(db, makeProject({ id: "AbletonProject", name: "AbletonProject", dawType: "ableton" }));
    updateStatus(db, "AbletonProject", "done");

    const stats = getProjectStats(db);

    expect(stats.total).toBe(23); // 22 base fixtures + AbletonProject
    expect(stats.byStatus.done).toBe(1);
  });
});

describe("getProjectTagCounts", () => {
  it("counts active projects per requested tag", () => {
    setTags(db, "Project 00", ["rock"]);
    setTags(db, "Project 01", ["rock"]);
    setTags(db, "Project 02", ["rock"]);
    setTags(db, "Project 03", ["jazz"]);

    const counts = getProjectTagCounts(db, ["rock", "jazz"]);

    expect(counts).toEqual({ rock: 3, jazz: 1 });
  });

  it("excludes a soft-removed project with a matching tag from that tag's count", () => {
    setTags(db, "Project 00", ["rock"]);
    setTags(db, "Project 01", ["rock"]);
    markRemoved(db, ["Project 00"], new Date().toISOString());

    const counts = getProjectTagCounts(db, ["rock"]);

    expect(counts.rock).toBe(1);
  });

  it("zero-fills a requested tag that exists in the tags table but has no project associations", () => {
    // Give the "orphan" tag a real row in `tags` (by tagging then untagging a project), so it
    // exists in the catalog but currently references nothing.
    setTags(db, "Project 00", ["orphan"]);
    setTags(db, "Project 00", []); // clears project_tags, tags row for "orphan" remains

    const counts = getProjectTagCounts(db, ["orphan"]);

    expect(counts.orphan).toBe(0);
  });

  it("zero-fills a requested tag name that doesn't exist in the tags table at all, without throwing or returning undefined", () => {
    const counts = getProjectTagCounts(db, ["never-created"]);

    expect(counts["never-created"]).toBe(0);
  });

  it("returns {} with no crash for an empty input array", () => {
    expect(getProjectTagCounts(db, [])).toEqual({});
  });

  it("does not choke on a SQL-metacharacter-laden requested tag name (parameterized query regression check)", () => {
    // Mirrors getProjectStats's own SQL-injection regression-test convention above: the
    // requested tag name is only ever bound as a query parameter, never string-interpolated
    // into the SQL text, so an adversarial value used as a lookup key is harmless.
    setTags(db, "Project 00", ["rock"]);
    const evilTag = `rock'; DROP TABLE projects; --`;

    expect(() => getProjectTagCounts(db, [evilTag, "rock"])).not.toThrow();
    const counts = getProjectTagCounts(db, [evilTag, "rock"]);

    expect(counts[evilTag]).toBe(0);
    expect(counts.rock).toBe(1);
    const row = db.prepare(`SELECT COUNT(*) AS c FROM projects`).get() as { c: number };
    expect(row.c).toBe(22);
  });

  it("returns the real count when the requested tag name differs in case from the stored tag (COLLATE NOCASE regression)", () => {
    // tags.name is UNIQUE COLLATE NOCASE, so a tag stored as "rock" must still be found when
    // requested as "Rock" — the SQL IN (...) match is case-insensitive, and the JS zero-fill
    // lookup must be too, or a case-only tag rename would silently zero out the Metrics tile.
    setTags(db, "Project 00", ["rock"]);
    setTags(db, "Project 01", ["rock"]);

    const counts = getProjectTagCounts(db, ["Rock"]);

    expect(counts.Rock).toBe(2);
  });

  it("keys the returned result by the caller's requested casing, not the tag's stored casing", () => {
    setTags(db, "Project 00", ["rock"]);

    const counts = getProjectTagCounts(db, ["ROCK"]);

    expect(Object.keys(counts)).toEqual(["ROCK"]);
    expect(counts.ROCK).toBe(1);
    expect(counts.rock).toBeUndefined();
  });
});
