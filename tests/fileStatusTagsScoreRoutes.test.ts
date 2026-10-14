import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { createServer } from "../src/api/server.js";
import { insertAudioFile, type AudioFileUpsertInput } from "../src/database/repositories/audioFileRepository.js";
import { upsertProject } from "../src/database/repositories/projectRepository.js";
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

describe("PATCH /api/files/:id/{status,tags,score} — unknown id returns 404, not 500", () => {
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

  it("returns 404 for PATCH /:id/status on an unknown file id", async () => {
    const res = await request(app).patch("/api/files/UNKNOWN/status").send({ status: "unknown" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });

  it("returns 404 for PATCH /:id/tags on an unknown file id", async () => {
    const res = await request(app).patch("/api/files/UNKNOWN/tags").send({ tags: ["drums"] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });

  it("returns 404 for PATCH /:id/score on an unknown file id", async () => {
    const res = await request(app).patch("/api/files/UNKNOWN/score").send({ score: 3 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });

  it("returns 404 for PATCH /:id/notes on an unknown file id", async () => {
    const res = await request(app).patch("/api/files/UNKNOWN/notes").send({ notes: "hi" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });
});

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

describe("PATCH /api/{files,projects}/:id/notes", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createServer(db, makeServerServices(db));
    insertAudioFile(db, makeFile({ id: "file-1.wav" }));
    upsertProject(db, {
      id: "Project A",
      name: "Project A",
      path: "/Music/Project A",
      hasVideo: false,
      hasImage: false,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      contentModifiedAt: null,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("sets a file's notes and returns the updated file", async () => {
    const res = await request(app).patch("/api/files/file-1.wav/notes").send({ notes: "Mix needs reverb." });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("Mix needs reverb.");

    const getRes = await request(app).get("/api/files/file-1.wav");
    expect(getRes.body.notes).toBe("Mix needs reverb.");
  });

  it("sets a project's notes and returns the updated project", async () => {
    const res = await request(app).patch("/api/projects/Project A/notes").send({ notes: "Final mastering pass." });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("Final mastering pass.");
  });

  it("accepts an empty string, clearing notes", async () => {
    await request(app).patch("/api/files/file-1.wav/notes").send({ notes: "Something" });
    const res = await request(app).patch("/api/files/file-1.wav/notes").send({ notes: "" });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("");
  });

  it("returns 400 for a non-string notes value on a file", async () => {
    const res = await request(app).patch("/api/files/file-1.wav/notes").send({ notes: 123 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "notes must be a string" });
  });

  it("returns 400 for a non-string notes value on a project", async () => {
    const res = await request(app).patch("/api/projects/Project A/notes").send({ notes: null });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "notes must be a string" });
  });

  it("returns 404 for PATCH /:id/notes on an unknown project id", async () => {
    const res = await request(app).patch("/api/projects/UNKNOWN/notes").send({ notes: "hi" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Project not found" });
  });
});
