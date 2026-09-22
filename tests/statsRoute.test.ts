import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { createServer } from "../src/api/server.js";
import { MacFinderService } from "../src/services/FinderService.js";
import { MacFolderPickerService } from "../src/services/FolderPickerService.js";
import { MacTrashService } from "../src/services/TrashService.js";
import { NodeFileOpsService } from "../src/services/FileOpsService.js";
import { getEffectiveMusicRoot } from "../src/config/musicRoot.js";
import {
  insertAudioFile,
  setTags as setFileTags,
  updateStatus as updateFileStatus,
} from "../src/database/repositories/audioFileRepository.js";
import {
  upsertProject,
  setTags as setProjectTags,
  updateStatus as updateProjectStatus,
} from "../src/database/repositories/projectRepository.js";

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
  };
}

// Covers the stats router (src/api/routes/stats.ts). This is the concrete, tested reference
// for the composed { files, projects } response shape a later frontend task is checked
// against — assertions here are deliberately precise about field names/shape, not just
// "response is 200".

describe("GET /api/stats", () => {
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

  it("returns a zero-filled { files, projects } shape with every status key present on an empty DB", async () => {
    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      files: {
        total: 0,
        byStatus: { unknown: 0, draft: 0, needs_mixing: 0, done: 0, released: 0 },
      },
      projects: {
        total: 0,
        byStatus: { unknown: 0, draft: 0, needs_mixing: 0, done: 0, released: 0 },
      },
    });
  });

  it("composes getFileStats and getProjectStats independently under 'files'/'projects' keys", async () => {
    const now = new Date().toISOString();

    insertAudioFile(db, {
      id: "track1.wav",
      path: "/Music/track1.wav",
      relativePath: "track1.wav",
      filename: "track1.wav",
      extension: ".wav",
      size: 100,
      modifiedAt: now,
      containingFolder: "/Music",
      firstSeenAt: now,
      lastSeenAt: now,
      isRemoved: false,
      status: "draft",
    });
    insertAudioFile(db, {
      id: "track2.wav",
      path: "/Music/track2.wav",
      relativePath: "track2.wav",
      filename: "track2.wav",
      extension: ".wav",
      size: 100,
      modifiedAt: now,
      containingFolder: "/Music",
      firstSeenAt: now,
      lastSeenAt: now,
      isRemoved: false,
    });
    updateFileStatus(db, "track2.wav", "released");

    upsertProject(db, {
      id: "ProjectA",
      name: "ProjectA",
      path: "/Music/ProjectA",
      firstSeenAt: now,
      lastSeenAt: now,
      hasVideo: false,
      hasImage: false,
      contentModifiedAt: null,
    });
    updateProjectStatus(db, "ProjectA", "needs_mixing");

    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      files: {
        total: 2,
        byStatus: { unknown: 0, draft: 1, needs_mixing: 0, done: 0, released: 1 },
      },
      projects: {
        total: 1,
        byStatus: { unknown: 0, draft: 0, needs_mixing: 1, done: 0, released: 0 },
      },
    });
  });
});

describe("GET /api/stats/tag-counts", () => {
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

  it("returns { files: {}, projects: {} } when no fileTag/projectTag params are given", async () => {
    const res = await request(app).get("/api/stats/tag-counts");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ files: {}, projects: {} });
  });

  it("returns correct counts for a real request with both fileTag and projectTag params, including repeated-param parsing", async () => {
    const now = new Date().toISOString();

    insertAudioFile(db, {
      id: "track1.wav",
      path: "/Music/track1.wav",
      relativePath: "track1.wav",
      filename: "track1.wav",
      extension: ".wav",
      size: 100,
      modifiedAt: now,
      containingFolder: "/Music",
      firstSeenAt: now,
      lastSeenAt: now,
      isRemoved: false,
    });
    insertAudioFile(db, {
      id: "track2.wav",
      path: "/Music/track2.wav",
      relativePath: "track2.wav",
      filename: "track2.wav",
      extension: ".wav",
      size: 100,
      modifiedAt: now,
      containingFolder: "/Music",
      firstSeenAt: now,
      lastSeenAt: now,
      isRemoved: false,
    });
    setFileTags(db, "track1.wav", ["rock"]);
    setFileTags(db, "track2.wav", ["rock"]);

    upsertProject(db, {
      id: "ProjectA",
      name: "ProjectA",
      path: "/Music/ProjectA",
      firstSeenAt: now,
      lastSeenAt: now,
      hasVideo: false,
      hasImage: false,
      contentModifiedAt: null,
    });
    setProjectTags(db, "ProjectA", ["demo"]);

    const res = await request(app).get(
      "/api/stats/tag-counts?fileTag=rock&fileTag=jazz&projectTag=demo"
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      files: { rock: 2, jazz: 0 },
      projects: { demo: 1 },
    });
  });
});
