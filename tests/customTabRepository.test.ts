import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  create,
  deleteById,
  findAll,
  type CreateCustomTabInput,
} from "../src/database/repositories/customTabRepository.js";

let db: Database.Database;

function makeInput(overrides: Partial<CreateCustomTabInput> = {}): CreateCustomTabInput {
  return {
    name: "My Tab",
    type: "files",
    statuses: ["draft", "needs_mixing"],
    scores: [3, "unscored"],
    tags: ["kick", "snare"],
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

describe("findAll", () => {
  it("returns an empty array on an empty table", () => {
    expect(findAll(db)).toEqual([]);
  });

  it("returns multiple created tabs in creation (id ASC) order", () => {
    const first = create(db, makeInput({ name: "First" }));
    const second = create(db, makeInput({ name: "Second" }));
    const third = create(db, makeInput({ name: "Third" }));

    const result = findAll(db);

    expect(result.map((t) => t.id)).toEqual([first.id, second.id, third.id]);
    expect(result.map((t) => t.name)).toEqual(["First", "Second", "Third"]);
  });
});

describe("create / findAll round-trip", () => {
  it("round-trips all fields correctly, including multi-element JSON array fields", () => {
    const input = makeInput();

    const created = create(db, input);
    const [found] = findAll(db);

    expect(typeof created.id).toBe("number");
    expect(typeof created.createdAt).toBe("string");
    expect(created).toEqual(found);
    expect(found).toEqual({
      id: created.id,
      name: "My Tab",
      type: "files",
      statuses: ["draft", "needs_mixing"],
      scores: [3, "unscored"],
      tags: ["kick", "snare"],
      createdAt: created.createdAt,
    });
  });

  it("round-trips type: 'files' correctly", () => {
    create(db, makeInput({ type: "files" }));
    expect(findAll(db)[0]!.type).toBe("files");
  });

  it("round-trips type: 'projects' correctly", () => {
    create(db, makeInput({ type: "projects" }));
    expect(findAll(db)[0]!.type).toBe("projects");
  });

  it("round-trips explicitly empty array fields as [], not undefined/null", () => {
    create(db, makeInput({ statuses: [], scores: [], tags: [] }));
    const found = findAll(db)[0]!;

    expect(found.statuses).toEqual([]);
    expect(found.scores).toEqual([]);
    expect(found.tags).toEqual([]);
  });
});

describe("deleteById", () => {
  it("returns true and removes the tab when the id exists", () => {
    const created = create(db, makeInput());

    const result = deleteById(db, created.id);

    expect(result).toBe(true);
    expect(findAll(db)).toEqual([]);
  });

  it("returns false and is a no-op when the id does not exist", () => {
    const created = create(db, makeInput({ name: "Survivor" }));

    const result = deleteById(db, created.id + 999);

    expect(result).toBe(false);
    expect(findAll(db)).toHaveLength(1);
    expect(findAll(db)[0]!.name).toBe("Survivor");
  });
});
