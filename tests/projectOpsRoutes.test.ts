import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  upsertProject,
  findById as findProjectById,
  setScore as setProjectScore,
  setTags as setProjectTags,
} from "../src/database/repositories/projectRepository.js";
import {
  insertAudioFile,
  findById as findFileById,
  setScore as setFileScore,
  setTags as setFileTags,
  type AudioFileUpsertInput,
} from "../src/database/repositories/audioFileRepository.js";
import { setMusicRootOverride, getEffectiveMusicRoot } from "../src/config/musicRoot.js";
import { createServer } from "../src/api/server.js";
import { MacFinderService } from "../src/services/FinderService.js";
import { MacFolderPickerService } from "../src/services/FolderPickerService.js";
import { MacTrashService } from "../src/services/TrashService.js";
import { NodeFileOpsService } from "../src/services/FileOpsService.js";

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

// The DELETE routes go through TrashService -> MacTrashService, which shells out to
// osascript/Finder — mocked at the module level (same pattern as tests/trashService.test.ts)
// so these route tests never depend on a real, interactive Finder session, and so a
// deleted project's folder is left physically in place (only the DB rows are asserted on).
const execFileMock = vi.hoisted(() =>
  vi.fn((_command: string, _args: string[], callback: (error: Error | null) => void) => {
    callback(null);
  })
);
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: (...args: Parameters<typeof actual.execFile>) => {
      // @ts-expect-error -- overload spread is fine for our call shape (command, args, callback)
      return execFileMock(...args);
    },
  };
});

// Wiring FileOpsService/TrashService +
// subtreeRekey.ts's moveProjectSubtree/cloneProjectSubtree into the projects routes.
// Real filesystem IO against real tmp-dir project folders (FileOpsService's containment
// checks resolve via fs.realpathSync, so fake paths like "/Music/..." won't pass them —
// see tests/fileOpsService.test.ts's identical rationale), plus a real in-memory DB.

function rawProject(db: Database.Database, id: string) {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | { id: string; path: string; is_removed: number }
    | undefined;
}

function rawFile(db: Database.Database, id: string) {
  return db.prepare(`SELECT * FROM audio_files WHERE id = ?`).get(id) as
    | { id: string; path: string; is_removed: number; project_id: string | null }
    | undefined;
}

describe("Project copy/move/delete routes", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createServer>;
  let root: string;

  beforeEach(() => {
    execFileMock.mockClear();
    execFileMock.mockImplementation((_cmd, _args, callback) => callback(null));
    db = new Database(":memory:");
    runMigrations(db);
    root = fs.mkdtempSync(path.join(os.tmpdir(), "project-ops-route-test-"));
    setMusicRootOverride(db, root);
    app = createServer(db, makeServerServices(db));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Seeds a project row with a real folder on disk at `${root}/${id}`. */
  function seedProject(overrides: {
    id: string;
    dawType?: "ableton" | "logic";
    score?: number | null;
    tags?: string[];
  }): void {
    const now = new Date().toISOString();
    const projectPath = path.join(root, overrides.id);
    fs.mkdirSync(projectPath, { recursive: true });
    upsertProject(db, {
      id: overrides.id,
      name: path.basename(overrides.id),
      path: projectPath,
      dawType: overrides.dawType,
      hasVideo: false,
      hasImage: false,
      firstSeenAt: now,
      lastSeenAt: now,
      contentModifiedAt: null,
    });
    if (overrides.score !== undefined) setProjectScore(db, overrides.id, overrides.score);
    if (overrides.tags) setProjectTags(db, overrides.id, overrides.tags);
  }

  /** Seeds an audio file row with a real file on disk at `${root}/${id}`. */
  function seedFile(overrides: {
    id: string;
    projectId?: string;
    content?: string;
    score?: number | null;
    tags?: string[];
  }): void {
    const now = new Date().toISOString();
    const filePath = path.join(root, overrides.id);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, overrides.content ?? "bytes");
    const input: AudioFileUpsertInput = {
      id: overrides.id,
      path: filePath,
      relativePath: overrides.id,
      filename: path.basename(overrides.id),
      extension: path.extname(overrides.id),
      size: (overrides.content ?? "bytes").length,
      modifiedAt: now,
      containingFolder: path.dirname(filePath),
      projectId: overrides.projectId,
      firstSeenAt: now,
      lastSeenAt: now,
      isRemoved: false,
    };
    insertAudioFile(db, input);
    if (overrides.score !== undefined) setFileScore(db, overrides.id, overrides.score);
    if (overrides.tags) setFileTags(db, overrides.id, overrides.tags);
  }

  /** Seeds a representative subtree: top-level project "Track A" (with a direct file and
   * status/score/tags), plus a nested sub-project "Track A/Nested Sub" (with its own
   * file), all with real folders/files on disk — used by every "not just a trivial
   * single-row project" test per the task's requirement. */
  function seedSubtree(): void {
    seedProject({ id: "Track A", dawType: "ableton", score: 4, tags: ["favorite"] });
    seedFile({ id: "Track A/kick.wav", projectId: "Track A", score: 5, tags: ["lead"] });
    seedProject({ id: "Track A/Nested Sub", dawType: "logic" });
    seedFile({ id: "Track A/Nested Sub/snare.wav", projectId: "Track A/Nested Sub" });
  }

  describe("POST /:id/copy", () => {
    it("clones the whole subtree (project + nested sub-project + files), leaving the source untouched", async () => {
      seedSubtree();
      const destDir = path.join(root, "Dest");
      fs.mkdirSync(destDir);

      const res = await request(app)
        .post(`/api/projects/${encodeURIComponent("Track A")}/copy`)
        .send({ destDir: destDir });

      expect(res.status).toBe(201);
      expect(res.body.project.id).toBe("Dest/Track A");
      expect(res.body.project.score).toBe(4);
      expect(res.body.project.tags).toEqual(["favorite"]);
      expect(res.body.clonedNestedProjectCount).toBe(1);
      expect(res.body.clonedFileCount).toBe(2);

      // Source subtree completely untouched, on disk and in the DB.
      expect(fs.existsSync(path.join(root, "Track A", "kick.wav"))).toBe(true);
      expect(fs.existsSync(path.join(root, "Track A", "Nested Sub", "snare.wav"))).toBe(true);
      expect(findProjectById(db, "Track A")).toBeDefined();
      expect(findFileById(db, "Track A/kick.wav")).toBeDefined();

      // Clone exists on disk...
      expect(fs.existsSync(path.join(destDir, "Track A", "kick.wav"))).toBe(true);
      expect(fs.existsSync(path.join(destDir, "Track A", "Nested Sub", "snare.wav"))).toBe(true);
      // ...and in the DB, with the nested sub-project and its file rekeyed too, preserving
      // status/score/tags.
      const clonedNested = findProjectById(db, "Dest/Track A/Nested Sub");
      expect(clonedNested).toBeDefined();
      const clonedFile = findFileById(db, "Dest/Track A/kick.wav");
      expect(clonedFile).toBeDefined();
      expect(clonedFile!.score).toBe(5);
      expect(clonedFile!.tags).toEqual(["lead"]);
      expect(clonedFile!.projectId).toBe("Dest/Track A");
      const clonedNestedFile = findFileById(db, "Dest/Track A/Nested Sub/snare.wav");
      expect(clonedNestedFile).toBeDefined();
      expect(clonedNestedFile!.projectId).toBe("Dest/Track A/Nested Sub");
    });

    it("400s when the destination is outside the configured music root, without touching the filesystem", async () => {
      seedProject({ id: "Track A" });
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), "project-ops-route-test-outside-"));

      try {
        const res = await request(app)
          .post(`/api/projects/${encodeURIComponent("Track A")}/copy`)
          .send({ destDir: outside });

        expect(res.status).toBe(400);
        expect(fs.readdirSync(outside)).toEqual([]);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    it("404s for an unknown project id", async () => {
      const res = await request(app)
        .post("/api/projects/does-not-exist/copy")
        .send({ destDir: root });

      expect(res.status).toBe(404);
    });
  });

  describe("POST /:id/move", () => {
    it("physically moves and DB-rekeys the whole subtree, leaving nothing at the old location", async () => {
      seedSubtree();
      const destDir = path.join(root, "Dest");
      fs.mkdirSync(destDir);

      const res = await request(app)
        .post(`/api/projects/${encodeURIComponent("Track A")}/move`)
        .send({ destDir: destDir });

      expect(res.status).toBe(200);
      expect(res.body.project.id).toBe("Dest/Track A");
      expect(res.body.movedNestedProjectCount).toBe(1);
      expect(res.body.movedFileCount).toBe(2);

      // Nothing left at the old location, on disk or in the DB.
      expect(fs.existsSync(path.join(root, "Track A"))).toBe(false);
      expect(findProjectById(db, "Track A")).toBeUndefined();
      expect(findProjectById(db, "Track A/Nested Sub")).toBeUndefined();
      expect(findFileById(db, "Track A/kick.wav")).toBeUndefined();

      // Everything now lives at the new location, on disk and in the DB.
      expect(fs.existsSync(path.join(destDir, "Track A", "kick.wav"))).toBe(true);
      expect(fs.existsSync(path.join(destDir, "Track A", "Nested Sub", "snare.wav"))).toBe(true);
      expect(findProjectById(db, "Dest/Track A")).toBeDefined();
      expect(findProjectById(db, "Dest/Track A/Nested Sub")).toBeDefined();
      const movedFile = findFileById(db, "Dest/Track A/kick.wav");
      expect(movedFile).toBeDefined();
      expect(movedFile!.projectId).toBe("Dest/Track A");
      expect(findFileById(db, "Dest/Track A/Nested Sub/snare.wav")).toBeDefined();
    });

    it("404s for an unknown project id", async () => {
      const res = await request(app)
        .post("/api/projects/does-not-exist/move")
        .send({ destDir: root });

      expect(res.status).toBe(404);
    });

    it("409s on a name collision at the destination, leaving both source and destination untouched", async () => {
      seedProject({ id: "Track A" });
      seedFile({ id: "Track A/kick.wav", projectId: "Track A" });
      const destDir = path.join(root, "Dest");
      const colliding = path.join(destDir, "Track A");
      fs.mkdirSync(colliding, { recursive: true });
      fs.writeFileSync(path.join(colliding, "existing.txt"), "preexisting");

      const res = await request(app)
        .post(`/api/projects/${encodeURIComponent("Track A")}/move`)
        .send({ destDir: destDir });

      expect(res.status).toBe(409);
      expect(fs.existsSync(path.join(root, "Track A", "kick.wav"))).toBe(true);
      expect(fs.readdirSync(colliding)).toEqual(["existing.txt"]);
      expect(findProjectById(db, "Track A")).toBeDefined();
    });

    it("surfaces (does not silently swallow) a DB-rekey failure that happens after the physical move already succeeded", async () => {
      // Forces the exact ordering hazard the route's mitigation targets: the physical
      // move succeeds (the destination directory name doesn't collide on disk), but the
      // subsequent DB rekey fails because another, unrelated project row already
      // occupies the computed new id ("Dest/Track A") as its PRIMARY KEY — a genuine
      // SQLITE_CONSTRAINT failure inside moveProjectSubtree's own transaction.
      seedProject({ id: "Track A" });
      seedFile({ id: "Track A/kick.wav", projectId: "Track A" });
      // Pre-existing row occupying the target id, pointing at a completely different
      // (also real, but unrelated) physical location — deliberately NOT created via
      // seedProject (which would create a real folder at the id's own path, i.e.
      // exactly the move's actual destination, tripping FileOpsService's own
      // fs.existsSync-based NameConflictError before the DB rekey step is ever reached).
      const elsewhere = path.join(root, "Elsewhere");
      fs.mkdirSync(elsewhere, { recursive: true });
      const now = new Date().toISOString();
      upsertProject(db, {
        id: "Dest/Track A",
        name: "Track A",
        path: elsewhere,
        hasVideo: false,
        hasImage: false,
        firstSeenAt: now,
        lastSeenAt: now,
        contentModifiedAt: null,
      });
      const destDir = path.join(root, "Dest");
      fs.mkdirSync(destDir);

      const res = await request(app)
        .post(`/api/projects/${encodeURIComponent("Track A")}/move`)
        .send({ destDir: destDir });

      // Not silently swallowed: a 500 with a message that explicitly names the
      // inconsistency, the project id, and the new physical location.
      expect(res.status).toBe(500);
      expect(res.body.error).toContain("Track A");
      expect(res.body.error).toContain("physically moved");
      expect(res.body.error).toContain("database");

      // The inconsistency is real and discoverable: the folder genuinely moved on disk...
      expect(fs.existsSync(path.join(root, "Track A"))).toBe(false);
      expect(fs.existsSync(path.join(destDir, "Track A", "kick.wav"))).toBe(true);
      // ...but the DB transaction rolled back entirely (moveProjectSubtree wraps its
      // writes in db.transaction, so a mid-transaction throw undoes all of them), so the
      // DB still says the project lives at the OLD location — a real, surfaced mismatch
      // between disk and DB, not a partially-applied one.
      const stillOld = rawProject(db, "Track A");
      expect(stillOld).toBeDefined();
      expect(stillOld!.path).toBe(path.join(root, "Track A"));
    });
  });

  describe("DELETE /:id", () => {
    it("trashes the folder and cascades removal to the whole subtree in the DB (project + nested sub-project + files)", async () => {
      seedSubtree();

      const res = await request(app).delete(`/api/projects/${encodeURIComponent("Track A")}`);

      expect(res.status).toBe(200);
      expect(res.body.removedProjectIds.sort()).toEqual(["Track A", "Track A/Nested Sub"]);
      expect(res.body.removedFileIds.sort()).toEqual(["Track A/Nested Sub/snare.wav", "Track A/kick.wav"]);
      expect(execFileMock).toHaveBeenCalledTimes(1);

      expect(rawProject(db, "Track A")!.is_removed).toBe(1);
      expect(rawProject(db, "Track A/Nested Sub")!.is_removed).toBe(1);
      expect(rawFile(db, "Track A/kick.wav")!.is_removed).toBe(1);
      expect(rawFile(db, "Track A/Nested Sub/snare.wav")!.is_removed).toBe(1);
    });

    it("404s for an unknown project id", async () => {
      const res = await request(app).delete("/api/projects/does-not-exist");

      expect(res.status).toBe(404);
      expect(execFileMock).not.toHaveBeenCalled();
    });
  });

  describe("batch routes", () => {
    it("POST /batch/copy: partial failure — succeeded items are not rolled back when another id fails", async () => {
      seedProject({ id: "Track A" });
      seedFile({ id: "Track A/kick.wav", projectId: "Track A" });
      const destDir = path.join(root, "Dest");
      fs.mkdirSync(destDir);

      const res = await request(app)
        .post("/api/projects/batch/copy")
        .send({ ids: ["Track A", "does-not-exist"], destDir: destDir });

      expect(res.status).toBe(200);
      expect(res.body.succeeded).toEqual(["Track A"]);
      expect(res.body.failed).toEqual([{ id: "does-not-exist", error: "Project not found" }]);
      expect(findProjectById(db, "Dest/Track A")).toBeDefined();
      expect(fs.existsSync(path.join(destDir, "Track A", "kick.wav"))).toBe(true);
      // The original is untouched by a copy.
      expect(findProjectById(db, "Track A")).toBeDefined();
    });

    it("POST /batch/move: partial failure — the succeeded item's move is not rolled back", async () => {
      seedProject({ id: "Track A" });
      seedFile({ id: "Track A/kick.wav", projectId: "Track A" });
      const destDir = path.join(root, "Dest");
      fs.mkdirSync(destDir);

      const res = await request(app)
        .post("/api/projects/batch/move")
        .send({ ids: ["Track A", "does-not-exist"], destDir: destDir });

      expect(res.status).toBe(200);
      expect(res.body.succeeded).toEqual(["Track A"]);
      expect(res.body.failed).toEqual([{ id: "does-not-exist", error: "Project not found" }]);
      expect(findProjectById(db, "Track A")).toBeUndefined();
      expect(findProjectById(db, "Dest/Track A")).toBeDefined();
      expect(fs.existsSync(path.join(root, "Track A"))).toBe(false);
    });

    it("DELETE /batch: partial failure — the succeeded item's cascading removal is not rolled back", async () => {
      seedSubtree();

      const res = await request(app)
        .delete("/api/projects/batch")
        .send({ ids: ["Track A", "does-not-exist"] });

      expect(res.status).toBe(200);
      expect(res.body.succeeded).toEqual(["Track A"]);
      expect(res.body.failed).toEqual([{ id: "does-not-exist", error: "Project not found" }]);
      expect(rawProject(db, "Track A")!.is_removed).toBe(1);
      expect(rawProject(db, "Track A/Nested Sub")!.is_removed).toBe(1);
      expect(rawFile(db, "Track A/kick.wav")!.is_removed).toBe(1);
      expect(rawFile(db, "Track A/Nested Sub/snare.wav")!.is_removed).toBe(1);
    });

    it("400s for batch/copy with a missing destDir", async () => {
      const res = await request(app).post("/api/projects/batch/copy").send({ ids: ["Track A"] });
      expect(res.status).toBe(400);
    });

    it("400s for batch endpoints with a malformed ids body", async () => {
      const res = await request(app).delete("/api/projects/batch").send({ ids: [] });
      expect(res.status).toBe(400);
    });
  });
});
