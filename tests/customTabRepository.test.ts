import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  create,
  deleteById,
  findAll,
  pruneStatusFromAllTabs,
  pruneTagFromAllTabs,
  renameTagInAllTabs,
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

describe("pruneStatusFromAllTabs", () => {
  it("removes the status from a tab that references it, leaving other fields untouched", () => {
    const tab = create(db, makeInput({ statuses: ["draft", "needs_mixing"] }));

    pruneStatusFromAllTabs(db, "draft");

    const [found] = findAll(db);
    expect(found!.statuses).toEqual(["needs_mixing"]);
  });

  it("leaves a sibling tab that does not reference the status completely unchanged", () => {
    const referencing = create(db, makeInput({ name: "Referencing", statuses: ["draft"] }));
    const sibling = create(db, makeInput({ name: "Sibling", statuses: ["needs_mixing"] }));

    pruneStatusFromAllTabs(db, "draft");

    const found = findAll(db);
    const foundReferencing = found.find((t) => t.id === referencing.id)!;
    const foundSibling = found.find((t) => t.id === sibling.id)!;

    expect(foundReferencing.statuses).toEqual([]);
    expect(foundSibling).toEqual(sibling);
  });

  it("round-trips a pruned-to-empty statuses array as [], not undefined/null", () => {
    create(db, makeInput({ statuses: ["draft"] }));

    pruneStatusFromAllTabs(db, "draft");

    const found = findAll(db)[0]!;
    expect(found.statuses).toEqual([]);
  });

  it("completes without error when no tabs exist", () => {
    expect(() => pruneStatusFromAllTabs(db, "draft")).not.toThrow();
  });

  it("completes without error when no tab references the status", () => {
    create(db, makeInput({ statuses: ["needs_mixing"] }));
    expect(() => pruneStatusFromAllTabs(db, "draft")).not.toThrow();
    expect(findAll(db)[0]!.statuses).toEqual(["needs_mixing"]);
  });
});

describe("pruneTagFromAllTabs", () => {
  it("removes the tag from a tab that references it, leaving other fields untouched", () => {
    const tab = create(db, makeInput({ tags: ["kick", "snare"] }));

    pruneTagFromAllTabs(db, "kick");

    const [found] = findAll(db);
    expect(found!.tags).toEqual(["snare"]);
  });

  it("leaves a sibling tab that does not reference the tag completely unchanged", () => {
    const referencing = create(db, makeInput({ name: "Referencing", tags: ["kick"] }));
    const sibling = create(db, makeInput({ name: "Sibling", tags: ["snare"] }));

    pruneTagFromAllTabs(db, "kick");

    const found = findAll(db);
    const foundReferencing = found.find((t) => t.id === referencing.id)!;
    const foundSibling = found.find((t) => t.id === sibling.id)!;

    expect(foundReferencing.tags).toEqual([]);
    expect(foundSibling).toEqual(sibling);
  });

  it("matches case-insensitively (tab stores 'Jazz', prune called with 'jazz')", () => {
    create(db, makeInput({ tags: ["Jazz", "Rock"] }));

    pruneTagFromAllTabs(db, "jazz");

    const found = findAll(db)[0]!;
    expect(found.tags).toEqual(["Rock"]);
  });

  it("round-trips a pruned-to-empty tags array as [], not undefined/null", () => {
    create(db, makeInput({ tags: ["kick"] }));

    pruneTagFromAllTabs(db, "kick");

    const found = findAll(db)[0]!;
    expect(found.tags).toEqual([]);
  });

  it("completes without error when no tabs exist", () => {
    expect(() => pruneTagFromAllTabs(db, "kick")).not.toThrow();
  });

  it("completes without error when no tab references the tag", () => {
    create(db, makeInput({ tags: ["snare"] }));
    expect(() => pruneTagFromAllTabs(db, "kick")).not.toThrow();
    expect(findAll(db)[0]!.tags).toEqual(["snare"]);
  });
});

describe("renameTagInAllTabs", () => {
  it("replaces the tag in a tab that references it, leaving other fields untouched", () => {
    const tab = create(db, makeInput({ tags: ["kick", "snare"] }));

    renameTagInAllTabs(db, "kick", "bass drum");

    const [found] = findAll(db);
    expect(found!.tags).toEqual(["bass drum", "snare"]);
  });

  it("leaves a sibling tab that does not reference the tag completely unchanged", () => {
    const referencing = create(db, makeInput({ name: "Referencing", tags: ["kick"] }));
    const sibling = create(db, makeInput({ name: "Sibling", tags: ["snare"] }));

    renameTagInAllTabs(db, "kick", "bass drum");

    const found = findAll(db);
    const foundReferencing = found.find((t) => t.id === referencing.id)!;
    const foundSibling = found.find((t) => t.id === sibling.id)!;

    expect(foundReferencing.tags).toEqual(["bass drum"]);
    expect(foundSibling).toEqual(sibling);
  });

  it("matches case-insensitively (tab stores 'Metal', rename called with 'metal')", () => {
    create(db, makeInput({ tags: ["Metal", "Rock"] }));

    renameTagInAllTabs(db, "metal", "heavy metal");

    const found = findAll(db)[0]!;
    expect(found.tags).toEqual(["heavy metal", "Rock"]);
  });

  it("dedupes case-insensitively when the tab already holds both old and new names, keeping newName's casing", () => {
    create(db, makeInput({ tags: ["rock", "Metal"] }));

    renameTagInAllTabs(db, "Metal", "rock");

    const found = findAll(db)[0]!;
    expect(found.tags).toEqual(["rock"]);
    expect(found.tags).toHaveLength(1);
  });

  it("keeps newName's casing even when the pre-existing duplicate comes first in array order", () => {
    create(db, makeInput({ tags: ["ROCK", "Metal"] }));

    renameTagInAllTabs(db, "Metal", "rock");

    const found = findAll(db)[0]!;
    expect(found.tags).toEqual(["rock"]);
    expect(found.tags).toHaveLength(1);
  });

  it("keeps newName's casing even when the pre-existing duplicate comes after the renamed entry in array order", () => {
    create(db, makeInput({ tags: ["Metal", "ROCK"] }));

    renameTagInAllTabs(db, "Metal", "rock");

    const found = findAll(db)[0]!;
    expect(found.tags).toEqual(["rock"]);
    expect(found.tags).toHaveLength(1);
  });

  it("leaves an unrelated case-insensitive duplicate pair completely untouched when renaming a different tag", () => {
    create(db, makeInput({ tags: ["Jazz", "JAZZ", "Metal"] }));

    renameTagInAllTabs(db, "Metal", "Rock");

    const found = findAll(db)[0]!;
    expect(found.tags).toEqual(["Jazz", "JAZZ", "Rock"]);
    expect(found.tags).toHaveLength(3);
  });

  it("round-trips a rename that leaves the array non-empty via findAll, and is a no-op shape-wise for absent tags", () => {
    create(db, makeInput({ tags: ["snare"] }));

    renameTagInAllTabs(db, "kick", "bass drum");

    const found = findAll(db)[0]!;
    expect(found.tags).toEqual(["snare"]);
  });

  it("completes without error when no tabs exist", () => {
    expect(() => renameTagInAllTabs(db, "kick", "bass drum")).not.toThrow();
  });

  it("completes without error when no tab references the old tag name", () => {
    create(db, makeInput({ tags: ["snare"] }));
    expect(() => renameTagInAllTabs(db, "kick", "bass drum")).not.toThrow();
    expect(findAll(db)[0]!.tags).toEqual(["snare"]);
  });
});
