import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  insertAudioFile,
  setScore as setFileScore,
  setTags as setFileTags,
  findById as findFileById,
  type AudioFileUpsertInput,
} from "../src/database/repositories/audioFileRepository.js";
import { upsertProject, findById as findProjectById } from "../src/database/repositories/projectRepository.js";
import type { Project } from "../src/models/Project.js";
import {
  syncProjectFromFiles,
  cascadeProjectScoreToFiles,
  cascadeProjectTagsToFiles,
  applyProjectMetadataToNewFile,
} from "../src/database/repositories/linkSync.js";
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

function makeProject(overrides: Partial<Omit<Project, "status" | "isRemoved" | "tags" | "score">> & { id: string }) {
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
  upsertProject(db, makeProject({ id: "Track A" }));
  upsertProject(db, makeProject({ id: "Track B" }));
});

afterEach(() => {
  db.close();
});

describe("syncProjectFromFiles", () => {
  it("sets the project's score to the max of its active files' scores", () => {
    insertAudioFile(db, makeFile({ id: "Track A/kick.wav", projectId: "Track A" }));
    insertAudioFile(db, makeFile({ id: "Track A/snare.wav", projectId: "Track A" }));
    setFileScore(db, "Track A/kick.wav", 2);
    setFileScore(db, "Track A/snare.wav", 5);

    syncProjectFromFiles(db, "Track A");

    expect(findProjectById(db, "Track A")!.score).toBe(5);
  });

  it("unions tags across all of a project's active files", () => {
    insertAudioFile(db, makeFile({ id: "Track A/kick.wav", projectId: "Track A" }));
    insertAudioFile(db, makeFile({ id: "Track A/snare.wav", projectId: "Track A" }));
    setFileTags(db, "Track A/kick.wav", ["drums", "loud"]);
    setFileTags(db, "Track A/snare.wav", ["drums", "crisp"]);

    syncProjectFromFiles(db, "Track A");

    expect(findProjectById(db, "Track A")!.tags.sort()).toEqual(["crisp", "drums", "loud"]);
  });

  it("results in a null score and no tags when the project has no files", () => {
    syncProjectFromFiles(db, "Track A");

    const project = findProjectById(db, "Track A")!;
    expect(project.score).toBeNull();
    expect(project.tags).toEqual([]);
  });

  it("drops a score/tag that no longer belongs to any file once recomputed", () => {
    insertAudioFile(db, makeFile({ id: "Track A/kick.wav", projectId: "Track A" }));
    setFileScore(db, "Track A/kick.wav", 5);
    setFileTags(db, "Track A/kick.wav", ["loud"]);
    syncProjectFromFiles(db, "Track A");
    expect(findProjectById(db, "Track A")!.score).toBe(5);

    setFileScore(db, "Track A/kick.wav", 1);
    setFileTags(db, "Track A/kick.wav", []);
    syncProjectFromFiles(db, "Track A");

    const project = findProjectById(db, "Track A")!;
    expect(project.score).toBe(1);
    expect(project.tags).toEqual([]);
  });

  it("does not consider files belonging to a different project", () => {
    insertAudioFile(db, makeFile({ id: "Track A/kick.wav", projectId: "Track A" }));
    insertAudioFile(db, makeFile({ id: "Track B/kick.wav", projectId: "Track B" }));
    setFileScore(db, "Track A/kick.wav", 2);
    setFileScore(db, "Track B/kick.wav", 5);

    syncProjectFromFiles(db, "Track A");

    expect(findProjectById(db, "Track A")!.score).toBe(2);
  });
});

describe("cascadeProjectScoreToFiles", () => {
  it("overwrites every active file in the project with the given score", () => {
    insertAudioFile(db, makeFile({ id: "Track A/kick.wav", projectId: "Track A" }));
    insertAudioFile(db, makeFile({ id: "Track A/snare.wav", projectId: "Track A" }));
    setFileScore(db, "Track A/kick.wav", 1);

    cascadeProjectScoreToFiles(db, "Track A", 4);

    expect(findFileById(db, "Track A/kick.wav")!.score).toBe(4);
    expect(findFileById(db, "Track A/snare.wav")!.score).toBe(4);
  });

  it("does not affect files in a different project", () => {
    insertAudioFile(db, makeFile({ id: "Track B/kick.wav", projectId: "Track B" }));

    cascadeProjectScoreToFiles(db, "Track A", 4);

    expect(findFileById(db, "Track B/kick.wav")!.score).toBeNull();
  });

  it("can clear every file's score back to null", () => {
    insertAudioFile(db, makeFile({ id: "Track A/kick.wav", projectId: "Track A" }));
    setFileScore(db, "Track A/kick.wav", 3);

    cascadeProjectScoreToFiles(db, "Track A", null);

    expect(findFileById(db, "Track A/kick.wav")!.score).toBeNull();
  });
});

describe("cascadeProjectTagsToFiles", () => {
  it("adds the project's tags to every active file without removing a file's own tags", () => {
    insertAudioFile(db, makeFile({ id: "Track A/kick.wav", projectId: "Track A" }));
    setFileTags(db, "Track A/kick.wav", ["punchy"]);

    cascadeProjectTagsToFiles(db, "Track A", ["reviewed"]);

    expect(findFileById(db, "Track A/kick.wav")!.tags.sort()).toEqual(["punchy", "reviewed"]);
  });

  it("does not affect files in a different project", () => {
    insertAudioFile(db, makeFile({ id: "Track B/kick.wav", projectId: "Track B" }));

    cascadeProjectTagsToFiles(db, "Track A", ["reviewed"]);

    expect(findFileById(db, "Track B/kick.wav")!.tags).toEqual([]);
  });
});

describe("applyProjectMetadataToNewFile", () => {
  it("applies the project's existing score and tags to a freshly-inserted file", () => {
    setFileTagsAndScoreOnProject("Track A", 4, ["reviewed"]);
    insertAudioFile(db, makeFile({ id: "Track A/new.wav", projectId: "Track A" }));

    applyProjectMetadataToNewFile(db, "Track A", "Track A/new.wav");

    const file = findFileById(db, "Track A/new.wav")!;
    expect(file.score).toBe(4);
    expect(file.tags).toEqual(["reviewed"]);
  });

  it("leaves the file untouched when the project has no score or tags", () => {
    insertAudioFile(db, makeFile({ id: "Track A/new.wav", projectId: "Track A" }));

    applyProjectMetadataToNewFile(db, "Track A", "Track A/new.wav");

    const file = findFileById(db, "Track A/new.wav")!;
    expect(file.score).toBeNull();
    expect(file.tags).toEqual([]);
  });

  it("does nothing for a nonexistent project", () => {
    insertAudioFile(db, makeFile({ id: "Track A/new.wav", projectId: "Track A" }));

    expect(() => applyProjectMetadataToNewFile(db, "Nonexistent", "Track A/new.wav")).not.toThrow();
    expect(findFileById(db, "Track A/new.wav")!.score).toBeNull();
  });

  function setFileTagsAndScoreOnProject(projectId: string, score: number, tags: string[]): void {
    insertAudioFile(db, makeFile({ id: `${projectId}/seed.wav`, projectId }));
    setFileScore(db, `${projectId}/seed.wav`, score);
    setFileTags(db, `${projectId}/seed.wav`, tags);
    syncProjectFromFiles(db, projectId);
  }
});

// Regression coverage proving the two
// link-sync directions (file->project via syncProjectFromFiles, project->file via
// cascadeProjectScoreToFiles/cascadeProjectTagsToFiles) genuinely don't cross-call/cascade into
// each other. Exercised through the real HTTP routes (not linkSync.ts directly), since the
// property under test lives in which linkSync.ts function each route handler chooses to call
// (src/api/routes/files.ts / projects.ts), not in linkSync.ts's functions themselves.
describe("file<->project link-sync directions don't cascade into each other (via HTTP routes)", () => {
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    app = createServer(db, makeServerServices(db));
  });

  it("PATCH /api/files/:id/score recomputes the project's score but does not touch a sibling file's own score", async () => {
    insertAudioFile(db, makeFile({ id: "Track A/kick.wav", projectId: "Track A" }));
    insertAudioFile(db, makeFile({ id: "Track A/snare.wav", projectId: "Track A" }));
    setFileScore(db, "Track A/kick.wav", 2);
    setFileScore(db, "Track A/snare.wav", 3);
    syncProjectFromFiles(db, "Track A");

    const res = await request(app)
      .patch(`/api/files/${encodeURIComponent("Track A/kick.wav")}/score`)
      .send({ score: 5 });

    expect(res.status).toBe(200);
    expect(findFileById(db, "Track A/kick.wav")!.score).toBe(5);
    // The sibling's own score must be untouched by any hidden recompute-back cascade.
    expect(findFileById(db, "Track A/snare.wav")!.score).toBe(3);
    // The project recomputes to the max of its files.
    expect(findProjectById(db, "Track A")!.score).toBe(5);
  });

  it("PATCH /api/files/:id/tags recomputes the project's tags but does not disturb a sibling file's own distinct tag", async () => {
    insertAudioFile(db, makeFile({ id: "Track A/kick.wav", projectId: "Track A" }));
    insertAudioFile(db, makeFile({ id: "Track A/snare.wav", projectId: "Track A" }));
    setFileTags(db, "Track A/snare.wav", ["crisp"]);
    syncProjectFromFiles(db, "Track A");

    const res = await request(app)
      .patch(`/api/files/${encodeURIComponent("Track A/kick.wav")}/tags`)
      .send({ tags: ["loud"] });

    expect(res.status).toBe(200);
    expect(findFileById(db, "Track A/kick.wav")!.tags).toEqual(["loud"]);
    // The sibling's own pre-existing tag must not be disturbed/replaced/duplicated.
    expect(findFileById(db, "Track A/snare.wav")!.tags).toEqual(["crisp"]);
    expect(findProjectById(db, "Track A")!.tags.sort()).toEqual(["crisp", "loud"]);
  });

  it("PATCH /api/projects/:id/score cascades to every file and the project's own value doesn't drift from a hidden recompute-back", async () => {
    insertAudioFile(db, makeFile({ id: "Track A/kick.wav", projectId: "Track A" }));
    insertAudioFile(db, makeFile({ id: "Track A/snare.wav", projectId: "Track A" }));
    setFileScore(db, "Track A/kick.wav", 1);
    setFileScore(db, "Track A/snare.wav", 2);
    syncProjectFromFiles(db, "Track A");

    const res = await request(app)
      .patch(`/api/projects/${encodeURIComponent("Track A")}/score`)
      .send({ score: 4 });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(4);
    expect(findFileById(db, "Track A/kick.wav")!.score).toBe(4);
    expect(findFileById(db, "Track A/snare.wav")!.score).toBe(4);
    // If cascadeProjectScoreToFiles secretly called back into syncProjectFromFiles, the
    // project's score would still read back as 4 here (max of two files both at 4), so this
    // assertion alone wouldn't catch a cascade-back loop by itself — the GET below, combined
    // with the fact both files match what was explicitly set (not silently recomputed from a
    // different intermediate state), is what the "no drift" claim rests on.
    const getRes = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.score).toBe(4);
  });
});
