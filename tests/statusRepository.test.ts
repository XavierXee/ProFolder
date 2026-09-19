import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  findAll,
  create,
  update,
  deleteByKey,
  isKnownStatusKey,
} from "../src/database/repositories/statusRepository.js";
import { insertAudioFile, type AudioFileUpsertInput } from "../src/database/repositories/audioFileRepository.js";
import { upsertProject } from "../src/database/repositories/projectRepository.js";
import type { Project } from "../src/models/Project.js";

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
});

afterEach(() => {
  db.close();
});

describe("statusRepository.findAll", () => {
  it("returns the 4 seeded defaults, ordered by sort_order, after migration", () => {
    const statuses = findAll(db);
    expect(statuses.map((s) => s.key)).toEqual(["draft", "needs_mixing", "done", "released"]);
    for (const status of statuses) {
      expect(typeof status.name).toBe("string");
      expect(status.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(typeof status.createdAt).toBe("string");
    }
  });
});

describe("statusRepository.isKnownStatusKey", () => {
  it("returns true for the hardcoded 'unknown' sentinel even though it's never a real row", () => {
    expect(isKnownStatusKey(db, "unknown")).toBe(true);
  });

  it("returns true for a real seeded status key", () => {
    expect(isKnownStatusKey(db, "draft")).toBe(true);
  });

  it("returns false for a key that doesn't exist", () => {
    expect(isKnownStatusKey(db, "not_a_real_status")).toBe(false);
  });
});

describe("statusRepository.create", () => {
  it("slugifies the name into a lowercase, underscore-separated key", () => {
    const status = create(db, "Ready For Review!", "#123456");
    expect(status.key).toBe("ready_for_review");
    expect(status.name).toBe("Ready For Review!");
    expect(status.color).toBe("#123456");
  });

  it("assigns sort_order as current max + 1", () => {
    const status = create(db, "New Status", "#123456");
    expect(status.sortOrder).toBe(3 + 1); // 4 seeded rows have sort_order 0-3
  });

  it("disambiguates a slug collision with an existing status key by appending _2", () => {
    const status = create(db, "Draft", "#123456"); // slugifies to "draft", already taken
    expect(status.key).toBe("draft_2");
  });

  it("disambiguates repeated collisions by incrementing the suffix", () => {
    create(db, "Draft", "#111111"); // -> draft_2
    const third = create(db, "Draft", "#222222"); // -> draft_3
    expect(third.key).toBe("draft_3");
  });

  it("disambiguates a slug collision with the reserved 'unknown' sentinel", () => {
    const status = create(db, "Unknown", "#123456");
    expect(status.key).toBe("unknown_2");
  });

  it("slugifies unicode/punctuation-only names into a safe fallback key instead of an empty string", () => {
    // "é" and "!" both fall outside [a-z0-9] and get collapsed to "_", which is then
    // trimmed away entirely, so a name that slugifies to nothing must fall back to "status"
    // rather than producing an empty-string primary key.
    const status = create(db, "é!!!", "#123456");
    expect(status.key).toBe("status");
    expect(status.name).toBe("é!!!");
  });

  it("slugifies a unicode name with some ASCII letters by stripping the non-ASCII part", () => {
    const status = create(db, "Café Vibes", "#123456");
    expect(status.key).toBe("caf_vibes");
  });

  it("rejects a malformed hex color", () => {
    expect(() => create(db, "Bad Color", "red")).toThrow();
    expect(() => create(db, "Bad Color", "#12345")).toThrow(); // too short
    expect(() => create(db, "Bad Color", "123456")).toThrow(); // missing #
  });

  it("persists the created row so a later findAll includes it", () => {
    create(db, "New Status", "#123456");
    expect(findAll(db).map((s) => s.key)).toContain("new_status");
  });
});

describe("statusRepository.update", () => {
  it("updates name and color without changing the key", () => {
    const updated = update(db, "draft", { name: "Rough Draft", color: "#abcdef" });
    expect(updated.key).toBe("draft");
    expect(updated.name).toBe("Rough Draft");
    expect(updated.color).toBe("#abcdef");
  });

  it("never regenerates the key even when the new name would slugify differently", () => {
    const updated = update(db, "draft", { name: "Something Totally Different" });
    expect(updated.key).toBe("draft");
  });

  it("allows a partial update (name only, or color only)", () => {
    const nameOnly = update(db, "draft", { name: "Renamed Draft" });
    expect(nameOnly.color).toBe("#ffb900");

    const colorOnly = update(db, "draft", { color: "#000000" });
    expect(colorOnly.name).toBe("Renamed Draft");
    expect(colorOnly.color).toBe("#000000");
  });

  it("rejects updating the 'unknown' sentinel", () => {
    expect(() => update(db, "unknown", { name: "Not Allowed" })).toThrow();
  });

  it("rejects a key that doesn't exist", () => {
    expect(() => update(db, "not_a_real_status", { name: "Whatever" })).toThrow();
  });

  it("rejects a malformed hex color on update", () => {
    expect(() => update(db, "draft", { color: "not-a-color" })).toThrow();
  });
});

describe("statusRepository.deleteByKey", () => {
  it("reassigns dependent audio_files rows to 'unknown' before deleting the status", () => {
    insertAudioFile(db, makeFile({ id: "file-a.wav", status: "draft" }));
    insertAudioFile(db, makeFile({ id: "file-b.wav", status: "draft" }));

    deleteByKey(db, "draft");

    const rows = db.prepare(`SELECT status FROM audio_files`).all() as { status: string }[];
    expect(rows.every((r) => r.status === "unknown")).toBe(true);
  });

  it("reassigns dependent projects rows to 'unknown' before deleting the status", () => {
    upsertProject(db, makeProject({ id: "Project A" }));
    db.prepare(`UPDATE projects SET status = 'draft' WHERE id = ?`).run("Project A");

    deleteByKey(db, "draft");

    const row = db.prepare(`SELECT status FROM projects WHERE id = ?`).get("Project A") as {
      status: string;
    };
    expect(row.status).toBe("unknown");
  });

  it("removes the status row itself", () => {
    deleteByKey(db, "draft");
    expect(findAll(db).map((s) => s.key)).not.toContain("draft");
  });

  it("does both the reassignment and the row deletion together (one transaction)", () => {
    insertAudioFile(db, makeFile({ id: "file-a.wav", status: "done" }));
    upsertProject(db, makeProject({ id: "Project A" }));
    db.prepare(`UPDATE projects SET status = 'done' WHERE id = ?`).run("Project A");

    deleteByKey(db, "done");

    const fileRow = db.prepare(`SELECT status FROM audio_files WHERE id = ?`).get("file-a.wav") as {
      status: string;
    };
    const projectRow = db.prepare(`SELECT status FROM projects WHERE id = ?`).get("Project A") as {
      status: string;
    };
    expect(fileRow.status).toBe("unknown");
    expect(projectRow.status).toBe("unknown");
    expect(findAll(db).map((s) => s.key)).not.toContain("done");
  });

  it("rejects deleting the 'unknown' sentinel", () => {
    expect(() => deleteByKey(db, "unknown")).toThrow();
  });

  it("rejects a key that doesn't exist", () => {
    expect(() => deleteByKey(db, "not_a_real_status")).toThrow();
  });
});
