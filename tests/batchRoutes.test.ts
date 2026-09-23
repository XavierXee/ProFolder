import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { insertAudioFile, type AudioFileUpsertInput } from "../src/database/repositories/audioFileRepository.js";
import { upsertProject } from "../src/database/repositories/projectRepository.js";
import type { Project } from "../src/models/Project.js";
import { createServer } from "../src/api/server.js";
import { MacFinderService } from "../src/services/FinderService.js";
import { MacFolderPickerService } from "../src/services/FolderPickerService.js";
import { MacTrashService } from "../src/services/TrashService.js";
import { NodeFileOpsService } from "../src/services/FileOpsService.js";
import { getEffectiveMusicRoot } from "../src/config/musicRoot.js";

// createServer now takes its platform services as explicit DI params instead of
// constructing them internally (see src/api/server.ts). This helper constructs the same
// real Mac* classes the plain web-mode entrypoint uses, matching this test's pre-refactor
// behavior exactly.
function makeServerServices(db: Database.Database) {
  return {
    finderService: new MacFinderService(() => getEffectiveMusicRoot(db)),
    folderPickerService: new MacFolderPickerService(),
    trashService: new MacTrashService(() => getEffectiveMusicRoot(db)),
    fileOpsService: new NodeFileOpsService(() => getEffectiveMusicRoot(db)),
    runtimeMode: "web" as const,
  };
}

// Covers the "batch/* must be registered before /:id/*" regression noted in
// docs/REQUIREMENTS.md Appendix C, plus the 400-on-malformed-body behavior of the
// batch score/tags endpoints for both the files and projects routers.

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

describe("batch route registration order and validation", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createServer(db, makeServerServices(db));
  });

  afterEach(() => {
    db.close();
  });

  describe("/api/files/batch/*", () => {
    beforeEach(() => {
      insertAudioFile(db, makeFile({ id: "file-a.wav" }));
      insertAudioFile(db, makeFile({ id: "file-b.wav" }));
    });

    it("routes PATCH batch/score to the batch handler rather than /:id/score (id='batch')", async () => {
      // If /:id/score were matched first, the response would be a single-file object
      // (or a 500, since a project/file literally named "batch" doesn't exist) instead
      // of the batch handler's { updated: N } shape.
      const res = await request(app)
        .patch("/api/files/batch/score")
        .send({ ids: ["file-a.wav", "file-b.wav"], score: 4 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 2 });
    });

    it("routes PATCH batch/tags to the batch handler rather than /:id/tags (id='batch')", async () => {
      const res = await request(app)
        .patch("/api/files/batch/tags")
        .send({ ids: ["file-a.wav", "file-b.wav"], tags: ["drums"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 2 });
    });

    it("returns 400 for batch/score with a missing ids array", async () => {
      const res = await request(app).patch("/api/files/batch/score").send({ score: 3 });

      expect(res.status).toBe(400);
    });

    it("returns 400 for batch/score with an out-of-range score", async () => {
      const res = await request(app)
        .patch("/api/files/batch/score")
        .send({ ids: ["file-a.wav"], score: 9 });

      expect(res.status).toBe(400);
    });

    it("returns 400 for batch/tags with a non-array tags field", async () => {
      const res = await request(app)
        .patch("/api/files/batch/tags")
        .send({ ids: ["file-a.wav"], tags: "not-an-array" });

      expect(res.status).toBe(400);
    });
  });

  describe("/api/projects/batch/*", () => {
    beforeEach(() => {
      upsertProject(db, makeProject({ id: "Project A" }));
      upsertProject(db, makeProject({ id: "Project B" }));
    });

    it("routes PATCH batch/score to the batch handler rather than /:id/score (id='batch')", async () => {
      const res = await request(app)
        .patch("/api/projects/batch/score")
        .send({ ids: ["Project A", "Project B"], score: 5 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 2 });
    });

    it("routes PATCH batch/tags to the batch handler rather than /:id/tags (id='batch')", async () => {
      const res = await request(app)
        .patch("/api/projects/batch/tags")
        .send({ ids: ["Project A", "Project B"], tags: ["mix-ready"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 2 });
    });

    it("returns 400 for batch/score with an empty ids array", async () => {
      const res = await request(app).patch("/api/projects/batch/score").send({ ids: [], score: 3 });

      expect(res.status).toBe(400);
    });

    it("returns 400 for batch/tags with a missing tags field", async () => {
      const res = await request(app).patch("/api/projects/batch/tags").send({ ids: ["Project A"] });

      expect(res.status).toBe(400);
    });
  });

  describe("/api/files/:id/status", () => {
    beforeEach(() => {
      insertAudioFile(db, makeFile({ id: "file-a.wav" }));
    });

    it("returns 400 for an invalid status value", async () => {
      const res = await request(app).patch("/api/files/file-a.wav/status").send({ status: "bogus" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'status must be a known status key (got "bogus")',
      });
    });
  });

  describe("/api/projects/:id/status", () => {
    beforeEach(() => {
      upsertProject(db, makeProject({ id: "project-a" }));
    });

    it("returns 400 for an invalid status value", async () => {
      const res = await request(app).patch("/api/projects/project-a/status").send({ status: "bogus" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'status must be a known status key (got "bogus")',
      });
    });
  });
});
