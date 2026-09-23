import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { insertAudioFile, setScore as setFileScore, setTags as setFileTags, type AudioFileUpsertInput } from "../src/database/repositories/audioFileRepository.js";
import { upsertProject, setTags as setProjectTags, setScore as setProjectScore } from "../src/database/repositories/projectRepository.js";
import type { Project } from "../src/models/Project.js";
import { createServer } from "../src/api/server.js";
import { MacFinderService } from "../src/services/FinderService.js";
import { MacFolderPickerService } from "../src/services/FolderPickerService.js";
import { MacTrashService } from "../src/services/TrashService.js";
import { NodeFileOpsService } from "../src/services/FileOpsService.js";
import { getEffectiveMusicRoot } from "../src/config/musicRoot.js";
import { parsePositiveInt, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../src/api/pagination.js";

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

// Covers the HTTP-layer pagination glue in src/api/routes/files.ts and
// src/api/routes/projects.ts (query-param parsing, offset math, totalPages
// calculation, clamping) — the underlying repository pagination
// (findAllActivePaged) already has its own coverage in
// tests/audioFileRepository.test.ts and tests/projectRepository.test.ts.

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

function seedFiles(db: Database.Database, count: number): void {
  for (let i = 0; i < count; i++) {
    const id = `file-${String(i).padStart(3, "0")}.wav`;
    insertAudioFile(db, makeFile({ id, filename: id }));
  }
}

function seedProjects(db: Database.Database, count: number): void {
  for (let i = 0; i < count; i++) {
    const id = `Project ${String(i).padStart(3, "0")}`;
    upsertProject(db, makeProject({ id, name: id }));
  }
}

describe("parsePositiveInt", () => {
  it("falls back to the default for undefined, empty, non-numeric, zero, and negative input", () => {
    expect(parsePositiveInt(undefined, 7)).toBe(7);
    expect(parsePositiveInt("", 7)).toBe(7);
    expect(parsePositiveInt("abc", 7)).toBe(7);
    expect(parsePositiveInt("0", 7)).toBe(7);
    expect(parsePositiveInt("-3", 7)).toBe(7);
  });

  // Number.parseInt truncates rather than rejecting a fractional string, so "1.9"
  // parses to 1 (a valid positive integer) and is NOT treated as invalid input —
  // it does not fall back to the default. Documented here since it's easy to
  // assume (incorrectly) that a non-integer string falls back like "abc" does.
  it("truncates a fractional string to its integer part rather than falling back", () => {
    expect(parsePositiveInt("1.9", 7)).toBe(1);
  });

  it("parses a valid positive integer string", () => {
    expect(parsePositiveInt("7", 1)).toBe(7);
  });

  it("clamps a value above max down to max", () => {
    expect(parsePositiveInt("9999", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)).toBe(MAX_PAGE_SIZE);
  });
});

describe("pagination HTTP route layer", () => {
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

  describe.each([
    {
      label: "files",
      routePath: "/api/files",
      itemsField: "files" as const,
      seed: seedFiles,
      idOf: (item: { id: string }) => item.id,
      setTags: (db: Database.Database, id: string, tags: string[]) => setFileTags(db, id, tags),
      idAt: (i: number) => `file-${String(i).padStart(3, "0")}.wav`,
    },
    {
      label: "projects",
      routePath: "/api/projects",
      itemsField: "projects" as const,
      seed: seedProjects,
      idOf: (item: { id: string }) => item.id,
      setTags: (db: Database.Database, id: string, tags: string[]) => setProjectTags(db, id, tags),
      idAt: (i: number) => `Project ${String(i).padStart(3, "0")}`,
    },
  ])("$routePath", ({ routePath, itemsField, seed, idOf, setTags, idAt }) => {
    it("returns page 2 with the same sort order as page 1, and pages 1-3 are pairwise disjoint", async () => {
      seed(db, 25);

      const [res1, res2, res3] = await Promise.all([
        request(app).get(routePath).query({ page: 1, pageSize: 10 }),
        request(app).get(routePath).query({ page: 2, pageSize: 10 }),
        request(app).get(routePath).query({ page: 3, pageSize: 10 }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res3.status).toBe(200);

      const page1Items = res1.body[itemsField];
      const page2Items = res2.body[itemsField];
      const page3Items = res3.body[itemsField];

      expect(page1Items).toHaveLength(10);
      expect(page2Items).toHaveLength(10);
      expect(page3Items).toHaveLength(5);

      // Page 2 should be rows 11-20 (0-indexed 10-19) in the same ascending
      // sort order as page 1 continues in.
      expect(page2Items.map(idOf)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(idAt));

      const allIds = [...page1Items, ...page2Items, ...page3Items].map(idOf);
      expect(new Set(allIds).size).toBe(25);
    });

    it("computes totalPages as total=100/pageSize=50 -> 2 (not off-by-one)", async () => {
      seed(db, 100);

      const res = await request(app).get(routePath).query({ page: 1, pageSize: 50 });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(100);
      expect(res.body.totalPages).toBe(2);
    });

    it("computes totalPages as total=101/pageSize=50 -> 3", async () => {
      seed(db, 101);

      const res = await request(app).get(routePath).query({ page: 1, pageSize: 50 });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(101);
      expect(res.body.totalPages).toBe(3);
    });

    // Pin this explicitly: with total=0, totalPages must be 1, never 0 — the
    // Math.max(1, ...) clamp in the route. The frontend's page-clamp effect
    // (untested at the frontend layer, by design, since it assumes this
    // invariant) relies on totalPages never being 0; if it were, that effect
    // would set page to 0 and issue an invalid (page=0) request.
    it("returns totalPages: 1 (never 0) when there are no matching rows at all", async () => {
      // No seeding — the table is empty.
      const res = await request(app).get(routePath).query({ page: 1, pageSize: 50 });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.totalPages).toBe(1);
    });

    it("returns 200 with an empty items array (but an honest total) for a page beyond the last page", async () => {
      seed(db, 25);

      const res = await request(app).get(routePath).query({ page: 5, pageSize: 10 });

      expect(res.status).toBe(200);
      expect(res.body[itemsField]).toEqual([]);
      expect(res.body.total).toBe(25);
    });

    it("computes totalPages from the filtered total, not the global total", async () => {
      seed(db, 20);
      const taggedIds = [0, 1, 2, 3, 4, 5, 6].map(idAt);
      for (const id of taggedIds) setTags(db, id, ["keep"]);

      const res = await request(app).get(routePath).query({ page: 1, pageSize: 5, tag: "keep" });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(7);
      expect(res.body.totalPages).toBe(2); // ceil(7 / 5), not ceil(20 / 5)
    });

    it("echoes back the coerced page/pageSize (post parsePositiveInt fallback), not the raw query value", async () => {
      seed(db, 5);

      const res = await request(app).get(routePath).query({ page: "abc", pageSize: "not-a-number" });

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(DEFAULT_PAGE_SIZE);
    });
  });

  it("/api/files: sortBy=score&sortDir=desc round-trips through query-param parsing to the repository call", async () => {
    seedFiles(db, 3);
    setFileScore(db, "file-000.wav", 1);
    setFileScore(db, "file-001.wav", 5);
    setFileScore(db, "file-002.wav", 3);

    const res = await request(app)
      .get("/api/files")
      .query({ sortBy: "score", sortDir: "desc" });

    expect(res.status).toBe(200);
    expect(res.body.files.map((f: { id: string }) => f.id)).toEqual([
      "file-001.wav",
      "file-002.wav",
      "file-000.wav",
    ]);
  });

  it("/api/projects: sortBy=score&sortDir=desc round-trips through query-param parsing to the repository call", async () => {
    seedProjects(db, 3);
    setProjectScore(db, "Project 000", 1);
    setProjectScore(db, "Project 001", 5);
    setProjectScore(db, "Project 002", 3);

    const res = await request(app)
      .get("/api/projects")
      .query({ sortBy: "score", sortDir: "desc" });

    expect(res.status).toBe(200);
    expect(res.body.projects.map((p: { id: string }) => p.id)).toEqual([
      "Project 001",
      "Project 002",
      "Project 000",
    ]);
  });
});
