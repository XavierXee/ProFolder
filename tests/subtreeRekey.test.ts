import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  insertAudioFile,
  updateStatus as updateFileStatus,
  setScore as setFileScore,
  setTags as setFileTags,
  findById as findFileById,
  type AudioFileUpsertInput,
} from "../src/database/repositories/audioFileRepository.js";
import {
  upsertProject,
  updateStatus as updateProjectStatus,
  setScore as setProjectScore,
  setTags as setProjectTags,
  findById as findProjectById,
} from "../src/database/repositories/projectRepository.js";
import { moveProjectSubtree, cloneProjectSubtree } from "../src/database/repositories/subtreeRekey.js";
import type { DawType } from "../src/scanner/dawDetector.js";

let db: Database.Database;

const MUSIC_ROOT = "/Music";

function makeProject(id: string, dawType?: DawType, markerPath?: string) {
  const now = new Date().toISOString();
  return {
    id,
    name: id,
    path: `${MUSIC_ROOT}/${id}`,
    dawType,
    markerPath,
    firstSeenAt: now,
    lastSeenAt: now,
    hasVideo: false,
    hasImage: false,
    contentModifiedAt: null,
  };
}

function makeFile(overrides: Partial<AudioFileUpsertInput> & { id: string }): AudioFileUpsertInput {
  const now = new Date().toISOString();
  return {
    path: `${MUSIC_ROOT}/${overrides.id}`,
    relativePath: overrides.id,
    filename: overrides.id.split("/").pop()!,
    extension: ".wav",
    size: 100,
    modifiedAt: now,
    containingFolder: MUSIC_ROOT,
    firstSeenAt: now,
    lastSeenAt: now,
    isRemoved: false,
    ...overrides,
  };
}

function rawProject(dbInstance: Database.Database, id: string) {
  return dbInstance.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | { id: string; path: string; marker_path: string | null }
    | undefined;
}

function rawFile(dbInstance: Database.Database, id: string) {
  return dbInstance.prepare(`SELECT * FROM audio_files WHERE id = ?`).get(id) as
    | {
        id: string;
        path: string;
        relative_path: string;
        containing_folder: string;
        project_id: string | null;
      }
    | undefined;
}

function fileTagIdsFor(dbInstance: Database.Database, audioFileId: string): number[] {
  const rows = dbInstance
    .prepare(`SELECT tag_id FROM audio_file_tags WHERE audio_file_id = ?`)
    .all(audioFileId) as { tag_id: number }[];
  return rows.map((r) => r.tag_id).sort((a, b) => a - b);
}

function projectTagIdsFor(dbInstance: Database.Database, projectId: string): number[] {
  const rows = dbInstance
    .prepare(`SELECT tag_id FROM project_tags WHERE project_id = ?`)
    .all(projectId) as { tag_id: number }[];
  return rows.map((r) => r.tag_id).sort((a, b) => a - b);
}

function tagsTableCount(dbInstance: Database.Database): number {
  return (dbInstance.prepare(`SELECT COUNT(*) AS count FROM tags`).get() as { count: number }).count;
}

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe("moveProjectSubtree — single project, no nesting", () => {
  it("rekeys id/path fields on the project and its files, preserving status/tags/score", () => {
    upsertProject(db, makeProject("SimpleProj", "ableton"));
    insertAudioFile(
      db,
      makeFile({
        id: "SimpleProj/a.wav",
        containingFolder: `${MUSIC_ROOT}/SimpleProj`,
        projectId: "SimpleProj",
      })
    );
    insertAudioFile(
      db,
      makeFile({
        id: "SimpleProj/b.wav",
        containingFolder: `${MUSIC_ROOT}/SimpleProj`,
        projectId: "SimpleProj",
      })
    );
    updateProjectStatus(db, "SimpleProj", "draft");
    setProjectScore(db, "SimpleProj", 3);
    setProjectTags(db, "SimpleProj", ["wip"]);
    updateFileStatus(db, "SimpleProj/a.wav", "done");
    setFileScore(db, "SimpleProj/a.wav", 5);
    setFileTags(db, "SimpleProj/a.wav", ["lead"]);

    moveProjectSubtree(db, "SimpleProj", `${MUSIC_ROOT}/Renamed`, MUSIC_ROOT);

    expect(findProjectById(db, "SimpleProj")).toBeUndefined();
    const project = findProjectById(db, "Renamed")!;
    expect(project).toBeDefined();
    expect(project.path).toBe(`${MUSIC_ROOT}/Renamed`);
    expect(project.status).toBe("draft");
    expect(project.score).toBe(3);
    expect(project.tags).toEqual(["wip"]);

    expect(findFileById(db, "SimpleProj/a.wav")).toBeUndefined();
    const a = findFileById(db, "Renamed/a.wav")!;
    expect(a).toBeDefined();
    expect(a.path).toBe(`${MUSIC_ROOT}/Renamed/a.wav`);
    expect(a.relativePath).toBe("Renamed/a.wav");
    expect(a.containingFolder).toBe(`${MUSIC_ROOT}/Renamed`);
    expect(a.projectId).toBe("Renamed");
    expect(a.status).toBe("done");
    expect(a.score).toBe(5);
    expect(a.tags).toEqual(["lead"]);

    const b = findFileById(db, "Renamed/b.wav")!;
    expect(b).toBeDefined();
    expect(b.projectId).toBe("Renamed");
  });
});

/**
 * Builds the nested-project + LIKE-wildcard-hazard fixture shared by several tests
 * below. Layout (see docs/REQUIREMENTS.md §2.5 for the "project nested inside another
 * project still gets its own row" rule this mirrors):
 *
 *   50%_Off/                 <- OUTER project (id contains literal % and _)
 *     Outer.als                 (marker_path)
 *     master.wav                <- file directly in outer, projectId = "50%_Off"
 *     InnerMix/                 <- NESTED sub-project inside the outer one
 *       take1.wav                  <- file directly in nested, projectId = "50%_Off/InnerMix"
 *   50-blahXOff/              <- UNRELATED sibling folder whose name a naive
 *     track.wav                   `id LIKE '50%_Off/%'` query would wrongly match
 *                                  (see the "LIKE-wildcard bug" test below) even
 *                                  though it isn't a descendant of "50%_Off" at all.
 *   Unrelated/
 *     loose.wav                <- control file entirely outside the moved subtree,
 *                                  projectId undefined (a file can only ever be
 *                                  unassociated when it's outside any DAW-classified
 *                                  project's subtree entirely — see the module doc
 *                                  comment in subtreeRekey.ts for why no audio file
 *                                  *inside* a DAW-classified subtree can ever be
 *                                  unassociated, per the scanner's own construction
 *                                  rules — so this file proves move-scope correctness
 *                                  from outside the subtree instead).
 */
function buildNestedFixture() {
  upsertProject(db, makeProject("50%_Off", "ableton", `${MUSIC_ROOT}/50%_Off/Outer.als`));
  upsertProject(db, makeProject("50%_Off/InnerMix", "logic"));
  upsertProject(db, makeProject("50-blahXOff"));

  insertAudioFile(
    db,
    makeFile({
      id: "50%_Off/master.wav",
      containingFolder: `${MUSIC_ROOT}/50%_Off`,
      projectId: "50%_Off",
    })
  );
  insertAudioFile(
    db,
    makeFile({
      id: "50%_Off/InnerMix/take1.wav",
      containingFolder: `${MUSIC_ROOT}/50%_Off/InnerMix`,
      projectId: "50%_Off/InnerMix",
    })
  );
  insertAudioFile(
    db,
    makeFile({
      id: "50-blahXOff/track.wav",
      containingFolder: `${MUSIC_ROOT}/50-blahXOff`,
      projectId: "50-blahXOff",
    })
  );
  insertAudioFile(
    db,
    makeFile({
      id: "Unrelated/loose.wav",
      containingFolder: `${MUSIC_ROOT}/Unrelated`,
    })
  );

  updateProjectStatus(db, "50%_Off", "draft");
  setProjectScore(db, "50%_Off", 3);
  setProjectTags(db, "50%_Off", ["keep-outer"]);

  updateProjectStatus(db, "50%_Off/InnerMix", "done");
  setProjectScore(db, "50%_Off/InnerMix", 5);
  setProjectTags(db, "50%_Off/InnerMix", ["keep-inner"]);

  updateFileStatus(db, "50%_Off/master.wav", "draft");
  setFileScore(db, "50%_Off/master.wav", 2);
  setFileTags(db, "50%_Off/master.wav", ["a"]);

  updateFileStatus(db, "50%_Off/InnerMix/take1.wav", "needs_mixing");
  setFileScore(db, "50%_Off/InnerMix/take1.wav", 4);
  setFileTags(db, "50%_Off/InnerMix/take1.wav", ["b"]);

  setFileTags(db, "50-blahXOff/track.wav", ["c"]);
}

describe("LIKE-wildcard hazard: naive matching vs. the actual implementation", () => {
  it("a naive `id LIKE prefix || '/%'` query WOULD wrongly match the unrelated sibling", () => {
    buildNestedFixture();

    const naiveMatches = db
      .prepare(`SELECT id FROM audio_files WHERE id LIKE ?`)
      .all(`50%_Off/%`) as { id: string }[];
    const naiveIds = naiveMatches.map((r) => r.id);

    // Positive control: proves the wildcard hazard is real for this fixture — a naive
    // LIKE-based prefix match incorrectly treats the unrelated sibling folder as a
    // descendant of "50%_Off", purely because '%'/'_' in the id are interpreted as
    // SQL wildcards rather than literal characters.
    expect(naiveIds).toContain("50-blahXOff/track.wav");
  });

  it("moveProjectSubtree does NOT touch the unrelated sibling, unlike the naive LIKE query", () => {
    buildNestedFixture();

    moveProjectSubtree(db, "50%_Off", `${MUSIC_ROOT}/60_Percent Off`, MUSIC_ROOT);

    const sibling = findFileById(db, "50-blahXOff/track.wav")!;
    expect(sibling).toBeDefined();
    expect(sibling.path).toBe(`${MUSIC_ROOT}/50-blahXOff/track.wav`);
    expect(sibling.projectId).toBe("50-blahXOff");
    expect(sibling.tags).toEqual(["c"]);

    const siblingProject = findProjectById(db, "50-blahXOff")!;
    expect(siblingProject).toBeDefined();
    expect(siblingProject.path).toBe(`${MUSIC_ROOT}/50-blahXOff`);
  });
});

describe("moveProjectSubtree — nested sub-project", () => {
  it("rekeys every affected column on both projects and both files, preserving tags/status/score, and leaves unrelated rows untouched", () => {
    buildNestedFixture();

    moveProjectSubtree(db, "50%_Off", `${MUSIC_ROOT}/60_Percent Off`, MUSIC_ROOT);

    // Old ids are gone.
    expect(findProjectById(db, "50%_Off")).toBeUndefined();
    expect(findProjectById(db, "50%_Off/InnerMix")).toBeUndefined();
    expect(findFileById(db, "50%_Off/master.wav")).toBeUndefined();
    expect(findFileById(db, "50%_Off/InnerMix/take1.wav")).toBeUndefined();

    // Outer project: every affected column + preserved metadata.
    const outer = findProjectById(db, "60_Percent Off")!;
    expect(outer).toBeDefined();
    expect(outer.path).toBe(`${MUSIC_ROOT}/60_Percent Off`);
    expect(outer.markerPath).toBe(`${MUSIC_ROOT}/60_Percent Off/Outer.als`);
    expect(outer.status).toBe("draft");
    expect(outer.score).toBe(3);
    expect(outer.tags).toEqual(["keep-outer"]);

    // Nested sub-project: id/path rekeyed via the SAME two prefixes as the outer one.
    const inner = findProjectById(db, "60_Percent Off/InnerMix")!;
    expect(inner).toBeDefined();
    expect(inner.path).toBe(`${MUSIC_ROOT}/60_Percent Off/InnerMix`);
    expect(inner.status).toBe("done");
    expect(inner.score).toBe(5);
    expect(inner.tags).toEqual(["keep-inner"]);

    // File directly in outer.
    const master = findFileById(db, "60_Percent Off/master.wav")!;
    expect(master).toBeDefined();
    expect(master.path).toBe(`${MUSIC_ROOT}/60_Percent Off/master.wav`);
    expect(master.relativePath).toBe("60_Percent Off/master.wav");
    expect(master.containingFolder).toBe(`${MUSIC_ROOT}/60_Percent Off`);
    expect(master.projectId).toBe("60_Percent Off");
    expect(master.status).toBe("draft");
    expect(master.score).toBe(2);
    expect(master.tags).toEqual(["a"]);

    // File directly in the nested sub-project.
    const take1 = findFileById(db, "60_Percent Off/InnerMix/take1.wav")!;
    expect(take1).toBeDefined();
    expect(take1.path).toBe(`${MUSIC_ROOT}/60_Percent Off/InnerMix/take1.wav`);
    expect(take1.relativePath).toBe("60_Percent Off/InnerMix/take1.wav");
    expect(take1.containingFolder).toBe(`${MUSIC_ROOT}/60_Percent Off/InnerMix`);
    expect(take1.projectId).toBe("60_Percent Off/InnerMix");
    expect(take1.status).toBe("needs_mixing");
    expect(take1.score).toBe(4);
    expect(take1.tags).toEqual(["b"]);

    // Tag join rows actually rekeyed, not orphaned.
    expect(fileTagIdsFor(db, "50%_Off/master.wav")).toEqual([]);
    expect(fileTagIdsFor(db, "60_Percent Off/master.wav")).toHaveLength(1);
    expect(projectTagIdsFor(db, "50%_Off")).toEqual([]);
    expect(projectTagIdsFor(db, "60_Percent Off")).toHaveLength(1);

    // Control file entirely outside the subtree: untouched.
    const loose = findFileById(db, "Unrelated/loose.wav")!;
    expect(loose).toBeDefined();
    expect(loose.projectId).toBeUndefined();
    expect(loose.path).toBe(`${MUSIC_ROOT}/Unrelated/loose.wav`);
  });
});

describe("moveProjectSubtree — atomicity", () => {
  it("rolls back the whole transaction if the destination project id collides with an existing row", () => {
    buildNestedFixture();
    upsertProject(db, makeProject("60_Percent Off")); // pre-existing row that will collide

    expect(() =>
      moveProjectSubtree(db, "50%_Off", `${MUSIC_ROOT}/60_Percent Off`, MUSIC_ROOT)
    ).toThrow();

    // Nothing partially rekeyed: source project/file rows are exactly as they were.
    const outer = findProjectById(db, "50%_Off")!;
    expect(outer).toBeDefined();
    expect(outer.score).toBe(3);
    expect(outer.tags).toEqual(["keep-outer"]);

    const inner = findProjectById(db, "50%_Off/InnerMix")!;
    expect(inner).toBeDefined();
    expect(inner.score).toBe(5);

    const master = findFileById(db, "50%_Off/master.wav")!;
    expect(master).toBeDefined();
    expect(master.projectId).toBe("50%_Off");
    expect(master.tags).toEqual(["a"]);

    const take1 = findFileById(db, "50%_Off/InnerMix/take1.wav")!;
    expect(take1).toBeDefined();

    // The pre-existing colliding row is also untouched (never received a rewritten path).
    const collider = findProjectById(db, "60_Percent Off")!;
    expect(collider).toBeDefined();
    expect(collider.path).toBe(`${MUSIC_ROOT}/60_Percent Off`);
  });

  it("rolls back project rows too when a LATER file update collides, even though both project rows were already rewritten earlier in the same transaction", () => {
    // Both projects are rekeyed before any file is touched (see the implementation's
    // "projects loop, then files loop" order), so this specifically proves the already-
    // successful project UPDATEs get rolled back too — a weaker test that only collided
    // on the very first statement processed wouldn't distinguish a real transaction
    // rollback from a no-op (nothing to roll back because nothing had succeeded yet).
    buildNestedFixture();
    insertAudioFile(
      db,
      makeFile({
        id: "60_Percent Off/master.wav", // collides with the file's post-move id
        containingFolder: `${MUSIC_ROOT}/60_Percent Off`,
      })
    );

    expect(() =>
      moveProjectSubtree(db, "50%_Off", `${MUSIC_ROOT}/60_Percent Off`, MUSIC_ROOT)
    ).toThrow();

    // Both project rows must still be at their OLD ids — proving the transaction rolled
    // back writes that had already succeeded earlier in the same call.
    expect(findProjectById(db, "50%_Off")).toBeDefined();
    expect(findProjectById(db, "50%_Off/InnerMix")).toBeDefined();
    expect(findProjectById(db, "60_Percent Off")).toBeUndefined();
    expect(findProjectById(db, "60_Percent Off/InnerMix")).toBeUndefined();

    // The file that never got a chance to move (InnerMix/take1.wav, processed in the
    // same loop as the colliding file) is also still at its old id.
    expect(findFileById(db, "50%_Off/InnerMix/take1.wav")).toBeDefined();
    expect(findFileById(db, "60_Percent Off/InnerMix/take1.wav")).toBeUndefined();

    // The pre-existing colliding file row is untouched.
    const collider = findFileById(db, "60_Percent Off/master.wav")!;
    expect(collider).toBeDefined();
    expect(collider.projectId).toBeUndefined();
  });

  it("throws when the source project id doesn't exist", () => {
    expect(() =>
      moveProjectSubtree(db, "does-not-exist", `${MUSIC_ROOT}/x`, MUSIC_ROOT)
    ).toThrow();
  });
});

describe("cloneProjectSubtree — nested sub-project", () => {
  it("creates a correct new subtree, leaves the source completely untouched, and reuses existing tag ids (no growth in `tags`)", () => {
    buildNestedFixture();
    const tagsBefore = tagsTableCount(db);
    const sourceMasterTagIds = fileTagIdsFor(db, "50%_Off/master.wav");
    const sourceOuterTagIds = projectTagIdsFor(db, "50%_Off");

    cloneProjectSubtree(db, "50%_Off", `${MUSIC_ROOT}/60_Percent Off`, MUSIC_ROOT);

    // Source completely untouched.
    const sourceOuter = findProjectById(db, "50%_Off")!;
    expect(sourceOuter).toBeDefined();
    expect(sourceOuter.path).toBe(`${MUSIC_ROOT}/50%_Off`);
    expect(sourceOuter.markerPath).toBe(`${MUSIC_ROOT}/50%_Off/Outer.als`);
    expect(sourceOuter.tags).toEqual(["keep-outer"]);
    const sourceInner = findProjectById(db, "50%_Off/InnerMix")!;
    expect(sourceInner).toBeDefined();
    const sourceMaster = findFileById(db, "50%_Off/master.wav")!;
    expect(sourceMaster).toBeDefined();
    expect(sourceMaster.tags).toEqual(["a"]);
    const sourceTake1 = findFileById(db, "50%_Off/InnerMix/take1.wav")!;
    expect(sourceTake1).toBeDefined();

    // New subtree correct.
    const newOuter = findProjectById(db, "60_Percent Off")!;
    expect(newOuter).toBeDefined();
    expect(newOuter.path).toBe(`${MUSIC_ROOT}/60_Percent Off`);
    expect(newOuter.markerPath).toBe(`${MUSIC_ROOT}/60_Percent Off/Outer.als`);
    expect(newOuter.status).toBe("draft");
    expect(newOuter.score).toBe(3);
    expect(newOuter.tags).toEqual(["keep-outer"]);

    const newInner = findProjectById(db, "60_Percent Off/InnerMix")!;
    expect(newInner).toBeDefined();
    expect(newInner.path).toBe(`${MUSIC_ROOT}/60_Percent Off/InnerMix`);
    expect(newInner.score).toBe(5);
    expect(newInner.tags).toEqual(["keep-inner"]);

    const newMaster = findFileById(db, "60_Percent Off/master.wav")!;
    expect(newMaster).toBeDefined();
    expect(newMaster.path).toBe(`${MUSIC_ROOT}/60_Percent Off/master.wav`);
    expect(newMaster.relativePath).toBe("60_Percent Off/master.wav");
    expect(newMaster.containingFolder).toBe(`${MUSIC_ROOT}/60_Percent Off`);
    expect(newMaster.projectId).toBe("60_Percent Off");
    expect(newMaster.status).toBe("draft");
    expect(newMaster.score).toBe(2);
    expect(newMaster.tags).toEqual(["a"]);

    const newTake1 = findFileById(db, "60_Percent Off/InnerMix/take1.wav")!;
    expect(newTake1).toBeDefined();
    expect(newTake1.projectId).toBe("60_Percent Off/InnerMix");
    expect(newTake1.score).toBe(4);
    expect(newTake1.tags).toEqual(["b"]);

    // Unrelated rows untouched.
    const sibling = findFileById(db, "50-blahXOff/track.wav")!;
    expect(sibling).toBeDefined();
    const loose = findFileById(db, "Unrelated/loose.wav")!;
    expect(loose).toBeDefined();

    // Tag reuse: the clone's join rows point at the SAME tag_id as the source (proven
    // via direct id comparison, not just equal name strings), and the `tags` table
    // itself did not grow.
    expect(fileTagIdsFor(db, "60_Percent Off/master.wav")).toEqual(sourceMasterTagIds);
    expect(projectTagIdsFor(db, "60_Percent Off")).toEqual(sourceOuterTagIds);
    expect(tagsTableCount(db)).toBe(tagsBefore);
  });

  it("throws when the source project id doesn't exist", () => {
    expect(() =>
      cloneProjectSubtree(db, "does-not-exist", `${MUSIC_ROOT}/x`, MUSIC_ROOT)
    ).toThrow();
  });
});

describe("cloneProjectSubtree — atomicity", () => {
  it("rolls back the whole transaction if the destination project id collides with an existing row, leaving the source untouched and creating no partial rows", () => {
    buildNestedFixture();
    upsertProject(db, makeProject("60_Percent Off")); // pre-existing row that will collide

    expect(() =>
      cloneProjectSubtree(db, "50%_Off", `${MUSIC_ROOT}/60_Percent Off`, MUSIC_ROOT)
    ).toThrow();

    // Source untouched.
    expect(findProjectById(db, "50%_Off")).toBeDefined();
    expect(findProjectById(db, "50%_Off/InnerMix")).toBeDefined();
    expect(findFileById(db, "50%_Off/master.wav")).toBeDefined();
    expect(findFileById(db, "50%_Off/InnerMix/take1.wav")).toBeDefined();

    // No partial clone: the nested sub-project's clone must NOT exist even though the
    // top-level clone is what actually collided.
    expect(findProjectById(db, "60_Percent Off/InnerMix")).toBeUndefined();
    expect(findFileById(db, "60_Percent Off/master.wav")).toBeUndefined();
    expect(findFileById(db, "60_Percent Off/InnerMix/take1.wav")).toBeUndefined();
  });
});

describe("Foo vs Foo2 prefix-adjacency", () => {
  it("moving 'Foo' does NOT rekey or delete unrelated sibling project 'Foo2' (literal prefix, not string-prefix)", () => {
    upsertProject(db, makeProject("Foo", "ableton"));
    upsertProject(db, makeProject("Foo2", "logic"));
    insertAudioFile(db, makeFile({ id: "Foo/a.wav", containingFolder: `${MUSIC_ROOT}/Foo`, projectId: "Foo" }));
    insertAudioFile(db, makeFile({ id: "Foo2/b.wav", containingFolder: `${MUSIC_ROOT}/Foo2`, projectId: "Foo2" }));

    moveProjectSubtree(db, "Foo", `${MUSIC_ROOT}/Bar`, MUSIC_ROOT);

    // Foo2 must be completely untouched — it is NOT a descendant of "Foo" even though
    // "Foo2" starts with the literal substring "Foo".
    const foo2 = findProjectById(db, "Foo2")!;
    expect(foo2).toBeDefined();
    expect(foo2.path).toBe(`${MUSIC_ROOT}/Foo2`);

    const foo2File = findFileById(db, "Foo2/b.wav")!;
    expect(foo2File).toBeDefined();
    expect(foo2File.projectId).toBe("Foo2");
    expect(foo2File.path).toBe(`${MUSIC_ROOT}/Foo2/b.wav`);

    // Foo itself was moved.
    expect(findProjectById(db, "Foo")).toBeUndefined();
    const bar = findProjectById(db, "Bar")!;
    expect(bar).toBeDefined();
    const barFile = findFileById(db, "Bar/a.wav")!;
    expect(barFile).toBeDefined();
    expect(barFile.projectId).toBe("Bar");
  });

  it("moving 'Foo' does NOT rekey a file literally named 'Foo2/x.wav' living directly under root (not nested under Foo)", () => {
    upsertProject(db, makeProject("Foo", "ableton"));
    insertAudioFile(db, makeFile({ id: "Foo/a.wav", containingFolder: `${MUSIC_ROOT}/Foo`, projectId: "Foo" }));
    // File whose id has "Foo" as a literal string prefix but is not path-nested under it.
    insertAudioFile(db, makeFile({ id: "Foo2.wav", containingFolder: MUSIC_ROOT }));

    moveProjectSubtree(db, "Foo", `${MUSIC_ROOT}/Bar`, MUSIC_ROOT);

    const untouched = findFileById(db, "Foo2.wav")!;
    expect(untouched).toBeDefined();
    expect(untouched.path).toBe(`${MUSIC_ROOT}/Foo2.wav`);
  });

  it("cloneProjectSubtree of 'Foo' leaves prefix-adjacent 'Foo2' completely untouched (no new rows derived from it)", () => {
    upsertProject(db, makeProject("Foo", "ableton"));
    upsertProject(db, makeProject("Foo2", "logic"));
    insertAudioFile(db, makeFile({ id: "Foo/a.wav", containingFolder: `${MUSIC_ROOT}/Foo`, projectId: "Foo" }));
    insertAudioFile(db, makeFile({ id: "Foo2/b.wav", containingFolder: `${MUSIC_ROOT}/Foo2`, projectId: "Foo2" }));

    cloneProjectSubtree(db, "Foo", `${MUSIC_ROOT}/Bar`, MUSIC_ROOT);

    expect(findProjectById(db, "Foo2")).toBeDefined();
    expect(findFileById(db, "Foo2/b.wav")).toBeDefined();
    // No accidental "Bar2" clone of Foo2 created.
    expect(findProjectById(db, "Bar2")).toBeUndefined();
  });
});

describe("three-level-deep nesting (outer > middle > inner)", () => {
  function buildThreeLevelFixture() {
    upsertProject(db, makeProject("Outer", "ableton"));
    upsertProject(db, makeProject("Outer/Middle", "logic"));
    upsertProject(db, makeProject("Outer/Middle/Inner", "reaper"));

    insertAudioFile(
      db,
      makeFile({ id: "Outer/top.wav", containingFolder: `${MUSIC_ROOT}/Outer`, projectId: "Outer" })
    );
    insertAudioFile(
      db,
      makeFile({
        id: "Outer/Middle/mid.wav",
        containingFolder: `${MUSIC_ROOT}/Outer/Middle`,
        projectId: "Outer/Middle",
      })
    );
    insertAudioFile(
      db,
      makeFile({
        id: "Outer/Middle/Inner/deep.wav",
        containingFolder: `${MUSIC_ROOT}/Outer/Middle/Inner`,
        projectId: "Outer/Middle/Inner",
      })
    );
  }

  it("moveProjectSubtree on the outermost project rekeys all THREE nested project rows and all three files", () => {
    buildThreeLevelFixture();

    moveProjectSubtree(db, "Outer", `${MUSIC_ROOT}/Moved`, MUSIC_ROOT);

    // Old ids all gone.
    expect(findProjectById(db, "Outer")).toBeUndefined();
    expect(findProjectById(db, "Outer/Middle")).toBeUndefined();
    expect(findProjectById(db, "Outer/Middle/Inner")).toBeUndefined();
    expect(findFileById(db, "Outer/top.wav")).toBeUndefined();
    expect(findFileById(db, "Outer/Middle/mid.wav")).toBeUndefined();
    expect(findFileById(db, "Outer/Middle/Inner/deep.wav")).toBeUndefined();

    // All three new project rows exist with rekeyed paths.
    const outer = findProjectById(db, "Moved")!;
    expect(outer).toBeDefined();
    expect(outer.path).toBe(`${MUSIC_ROOT}/Moved`);

    const middle = findProjectById(db, "Moved/Middle")!;
    expect(middle).toBeDefined();
    expect(middle.path).toBe(`${MUSIC_ROOT}/Moved/Middle`);

    const inner = findProjectById(db, "Moved/Middle/Inner")!;
    expect(inner).toBeDefined();
    expect(inner.path).toBe(`${MUSIC_ROOT}/Moved/Middle/Inner`);

    // All three files rekeyed, project_id chain correct at each depth.
    const top = findFileById(db, "Moved/top.wav")!;
    expect(top).toBeDefined();
    expect(top.projectId).toBe("Moved");

    const mid = findFileById(db, "Moved/Middle/mid.wav")!;
    expect(mid).toBeDefined();
    expect(mid.projectId).toBe("Moved/Middle");

    const deep = findFileById(db, "Moved/Middle/Inner/deep.wav")!;
    expect(deep).toBeDefined();
    expect(deep.projectId).toBe("Moved/Middle/Inner");
    expect(deep.path).toBe(`${MUSIC_ROOT}/Moved/Middle/Inner/deep.wav`);
    expect(deep.relativePath).toBe("Moved/Middle/Inner/deep.wav");
    expect(deep.containingFolder).toBe(`${MUSIC_ROOT}/Moved/Middle/Inner`);
  });

  it("moving the MIDDLE project of a three-level chain rekeys middle+inner but leaves the outer project and its own direct file untouched", () => {
    buildThreeLevelFixture();

    moveProjectSubtree(db, "Outer/Middle", `${MUSIC_ROOT}/Outer/Relocated`, MUSIC_ROOT);

    // Outer project + its direct file untouched.
    const outer = findProjectById(db, "Outer")!;
    expect(outer).toBeDefined();
    expect(outer.path).toBe(`${MUSIC_ROOT}/Outer`);
    const top = findFileById(db, "Outer/top.wav")!;
    expect(top).toBeDefined();
    expect(top.projectId).toBe("Outer");

    // Middle + inner rekeyed.
    expect(findProjectById(db, "Outer/Middle")).toBeUndefined();
    expect(findProjectById(db, "Outer/Middle/Inner")).toBeUndefined();
    const middle = findProjectById(db, "Outer/Relocated")!;
    expect(middle).toBeDefined();
    const inner = findProjectById(db, "Outer/Relocated/Inner")!;
    expect(inner).toBeDefined();

    const mid = findFileById(db, "Outer/Relocated/mid.wav")!;
    expect(mid).toBeDefined();
    expect(mid.projectId).toBe("Outer/Relocated");

    const deep = findFileById(db, "Outer/Relocated/Inner/deep.wav")!;
    expect(deep).toBeDefined();
    expect(deep.projectId).toBe("Outer/Relocated/Inner");
  });

  it("cloneProjectSubtree on the outermost project of a three-level chain creates all three new project rows, all three files, and leaves the source fully intact", () => {
    buildThreeLevelFixture();

    cloneProjectSubtree(db, "Outer", `${MUSIC_ROOT}/Cloned`, MUSIC_ROOT);

    // Source fully intact.
    expect(findProjectById(db, "Outer")).toBeDefined();
    expect(findProjectById(db, "Outer/Middle")).toBeDefined();
    expect(findProjectById(db, "Outer/Middle/Inner")).toBeDefined();
    expect(findFileById(db, "Outer/top.wav")).toBeDefined();
    expect(findFileById(db, "Outer/Middle/mid.wav")).toBeDefined();
    expect(findFileById(db, "Outer/Middle/Inner/deep.wav")).toBeDefined();

    // New subtree: all three levels present.
    expect(findProjectById(db, "Cloned")).toBeDefined();
    expect(findProjectById(db, "Cloned/Middle")).toBeDefined();
    const clonedInner = findProjectById(db, "Cloned/Middle/Inner")!;
    expect(clonedInner).toBeDefined();
    expect(clonedInner.path).toBe(`${MUSIC_ROOT}/Cloned/Middle/Inner`);

    const clonedTop = findFileById(db, "Cloned/top.wav")!;
    expect(clonedTop).toBeDefined();
    expect(clonedTop.projectId).toBe("Cloned");
    const clonedMid = findFileById(db, "Cloned/Middle/mid.wav")!;
    expect(clonedMid).toBeDefined();
    expect(clonedMid.projectId).toBe("Cloned/Middle");
    const clonedDeep = findFileById(db, "Cloned/Middle/Inner/deep.wav")!;
    expect(clonedDeep).toBeDefined();
    expect(clonedDeep.projectId).toBe("Cloned/Middle/Inner");
  });
});

describe("empty-subtree edge case", () => {
  it("moving a project with no nested sub-projects and no files still succeeds and rekeys only the project row", () => {
    upsertProject(db, makeProject("Lonely", "ableton"));
    moveProjectSubtree(db, "Lonely", `${MUSIC_ROOT}/StillLonely`, MUSIC_ROOT);
    expect(findProjectById(db, "Lonely")).toBeUndefined();
    expect(findProjectById(db, "StillLonely")).toBeDefined();
  });
});
