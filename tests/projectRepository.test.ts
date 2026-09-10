import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  findAllActivePaged,
  findById,
  setTags,
  setScore,
  setScoreForProjects,
  addTagsToProjects,
  updateStatus,
  upsertProject,
  markRemoved,
  loadActiveProjectIds,
} from "../src/database/repositories/projectRepository.js";
import type { Project } from "../src/models/Project.js";

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

  it("defaults to sorting by name when sortBy is omitted", () => {
    const { items } = findAllActivePaged(db, { limit: 3, offset: 0 });
    expect(items.map((p) => p.name)).toEqual(["Project 00", "Project 01", "Project 02"]);
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

    const nowIso = new Date().toISOString();
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
  it("reappearing project is reactivated without throwing, preserving its prior status/tags/score", () => {
    updateStatus(db, "Project 00", "released");
    setScore(db, "Project 00", 5);
    setTags(db, "Project 00", ["favorite", "mix-ready"]);

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
    expect(reactivated.lastSeenAt).toBe(newLastSeenAt); // filesystem-derived fields do refresh
    expect(reactivated.contentModifiedAt).toBe("2026-05-01T00:00:00.000Z");
  });
});
