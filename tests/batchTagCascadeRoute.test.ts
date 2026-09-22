import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  insertAudioFile,
  findById as findFileById,
  markRemoved as markFileRemoved,
  type AudioFileUpsertInput,
} from "../src/database/repositories/audioFileRepository.js";
import {
  upsertProject,
  markRemoved as markProjectRemoved,
  findById as findProjectById,
} from "../src/database/repositories/projectRepository.js";
import type { Project } from "../src/models/Project.js";
import { createServer } from "../src/api/server.js";

// PATCH /api/projects/batch/tags had no
// coverage proving the per-project cascade actually reaches every selected project's files
// (not just an HTTP 200 shape), plus a real bug found during scoping: addTagsToProjects wraps
// the whole batch in one db.transaction() and does `INSERT OR IGNORE INTO project_tags`, but
// INSERT OR IGNORE does NOT suppress FK violations — an unknown project id in the batch throws
// SqliteError: FOREIGN KEY constraint failed and rolls back the ENTIRE transaction, losing
// tags for every valid project in the same batch (and even new tag names from the global
// `tags` dictionary insert, which shares the same transaction). The fix filters the id list
// down to existing, active rows (filterExistingProjectIds — per a
// product decision to also exclude soft-removed projects, not just unknown ids) before calling
// addTagsToProjects/cascadeProjectTagsToFiles. The same helper is also applied to the sibling
// PATCH /api/projects/batch/score route so both routes report an honest `updated` count and
// neither diverges from the other in the future.

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

function makeProject(
  overrides: Partial<Omit<Project, "status" | "isRemoved" | "tags" | "score">> & { id: string }
) {
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

describe("PATCH /api/projects/batch/tags — cascade + unknown-id handling", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createServer(db);
  });

  afterEach(() => {
    db.close();
  });

  it("cascades a batch tag to every selected project's active file (not just the first/last)", async () => {
    upsertProject(db, makeProject({ id: "Project A" }));
    upsertProject(db, makeProject({ id: "Project B" }));
    insertAudioFile(db, makeFile({ id: "a1.wav", projectId: "Project A" }));
    insertAudioFile(db, makeFile({ id: "b1.wav", projectId: "Project B" }));

    const res = await request(app)
      .patch("/api/projects/batch/tags")
      .send({ ids: ["Project A", "Project B"], tags: ["mix-ready"] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 2 });
    expect(findFileById(db, "a1.wav")?.tags).toEqual(["mix-ready"]);
    expect(findFileById(db, "b1.wav")?.tags).toEqual(["mix-ready"]);
  });

  it("does not leak the batch tag onto an unselected project's file", async () => {
    upsertProject(db, makeProject({ id: "Project A" }));
    upsertProject(db, makeProject({ id: "Project C" }));
    insertAudioFile(db, makeFile({ id: "a1.wav", projectId: "Project A" }));
    insertAudioFile(db, makeFile({ id: "c1.wav", projectId: "Project C" }));

    const res = await request(app)
      .patch("/api/projects/batch/tags")
      .send({ ids: ["Project A"], tags: ["mix-ready"] });

    expect(res.status).toBe(200);
    expect(findFileById(db, "c1.wav")?.tags).toEqual([]);
  });

  it("unions with a file's pre-existing own tag rather than replacing it", async () => {
    upsertProject(db, makeProject({ id: "Project A" }));
    insertAudioFile(db, makeFile({ id: "a1.wav", projectId: "Project A" }));

    // Give the file its own tag directly, bypassing the project cascade.
    await request(app).patch("/api/files/a1.wav/tags").send({ tags: ["own-tag"] });

    const res = await request(app)
      .patch("/api/projects/batch/tags")
      .send({ ids: ["Project A"], tags: ["mix-ready"] });

    expect(res.status).toBe(200);
    expect(findFileById(db, "a1.wav")?.tags?.sort()).toEqual(["mix-ready", "own-tag"]);
  });

  it("succeeds with no crash for a project with zero files", async () => {
    upsertProject(db, makeProject({ id: "Project Empty" }));

    const res = await request(app)
      .patch("/api/projects/batch/tags")
      .send({ ids: ["Project Empty"], tags: ["mix-ready"] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 1 });
  });

  it("does not tag a soft-removed file within a selected project (is_removed = 0 filter still holds)", async () => {
    upsertProject(db, makeProject({ id: "Project A" }));
    insertAudioFile(db, makeFile({ id: "a1.wav", projectId: "Project A" }));
    markFileRemoved(db, ["a1.wav"], new Date().toISOString());

    const res = await request(app)
      .patch("/api/projects/batch/tags")
      .send({ ids: ["Project A"], tags: ["mix-ready"] });

    expect(res.status).toBe(200);
    expect(findFileById(db, "a1.wav")?.tags).toEqual([]);
  });

  it("is a no-op (200, no crash) for an empty tags array", async () => {
    upsertProject(db, makeProject({ id: "Project A" }));
    insertAudioFile(db, makeFile({ id: "a1.wav", projectId: "Project A" }));

    const res = await request(app).patch("/api/projects/batch/tags").send({ ids: ["Project A"], tags: [] });

    expect(res.status).toBe(200);
    expect(findFileById(db, "a1.wav")?.tags).toEqual([]);
  });

  it("mixed batch with an unknown id tags both real projects (and their files) without rolling back", async () => {
    upsertProject(db, makeProject({ id: "Project A" }));
    upsertProject(db, makeProject({ id: "Project B" }));
    insertAudioFile(db, makeFile({ id: "a1.wav", projectId: "Project A" }));
    insertAudioFile(db, makeFile({ id: "b1.wav", projectId: "Project B" }));

    const res = await request(app)
      .patch("/api/projects/batch/tags")
      .send({ ids: ["Project A", "GHOST", "Project B"], tags: ["mix-ready"] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 2 });
    expect(findProjectById(db, "Project A")?.tags).toEqual(["mix-ready"]);
    expect(findProjectById(db, "Project B")?.tags).toEqual(["mix-ready"]);
    expect(findFileById(db, "a1.wav")?.tags).toEqual(["mix-ready"]);
    expect(findFileById(db, "b1.wav")?.tags).toEqual(["mix-ready"]);
  });

  it("an all-unknown batch returns updated: 0 with no rows affected", async () => {
    upsertProject(db, makeProject({ id: "Project A" }));

    const res = await request(app)
      .patch("/api/projects/batch/tags")
      .send({ ids: ["GHOST1", "GHOST2"], tags: ["mix-ready"] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 0 });
    expect(findProjectById(db, "Project A")?.tags).toEqual([]);
  });

  it("a ghost id in the batch does not prevent a brand-new tag name from entering the global tags table", async () => {
    upsertProject(db, makeProject({ id: "Project A" }));
    insertAudioFile(db, makeFile({ id: "a1.wav", projectId: "Project A" }));

    const brandNewTag = "never-used-before-tag";
    const before = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(brandNewTag);
    expect(before).toBeUndefined();

    const res = await request(app)
      .patch("/api/projects/batch/tags")
      .send({ ids: ["Project A", "GHOST"], tags: [brandNewTag] });

    expect(res.status).toBe(200);
    const after = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(brandNewTag);
    expect(after).toBeDefined();
  });

  it("excludes a soft-removed PROJECT from the batch (active-only filter)", async () => {
    upsertProject(db, makeProject({ id: "Project Removed" }));
    insertAudioFile(db, makeFile({ id: "r1.wav", projectId: "Project Removed" }));
    markProjectRemoved(db, ["Project Removed"], new Date().toISOString());

    const res = await request(app)
      .patch("/api/projects/batch/tags")
      .send({ ids: ["Project Removed"], tags: ["mix-ready"] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 0 });
    expect(findProjectById(db, "Project Removed")?.tags).toEqual([]);
    expect(findFileById(db, "r1.wav")?.tags).toEqual([]);
  });

  it("reports updated equal to the count of ids that actually exist (2 for a 2-real-1-ghost mixed batch)", async () => {
    upsertProject(db, makeProject({ id: "Project A" }));
    upsertProject(db, makeProject({ id: "Project B" }));

    const res = await request(app)
      .patch("/api/projects/batch/tags")
      .send({ ids: ["Project A", "GHOST", "Project B"], tags: ["mix-ready"] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 2 });
  });

  it("dedupes a duplicate-id batch to updated: 1", async () => {
    upsertProject(db, makeProject({ id: "Project A" }));

    const res = await request(app)
      .patch("/api/projects/batch/tags")
      .send({ ids: ["Project A", "Project A"], tags: ["mix-ready"] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 1 });
  });

  it("parity control: the identical mixed-batch shape against batch/score also returns the correct honest count", async () => {
    upsertProject(db, makeProject({ id: "Project A" }));
    upsertProject(db, makeProject({ id: "Project B" }));

    const res = await request(app)
      .patch("/api/projects/batch/score")
      .send({ ids: ["Project A", "GHOST", "Project B"], score: 4 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 2 });
    expect(findProjectById(db, "Project A")?.score).toBe(4);
    expect(findProjectById(db, "Project B")?.score).toBe(4);
  });
});
