import { describe, expect, it } from "vitest";
import { applyCatalogFilterEvent } from "../catalogFilterEvents.js";

describe("applyCatalogFilterEvent", () => {
  describe("statusDeleted", () => {
    it("removes the deleted key from statuses when present, preserving order of the rest", () => {
      const statuses = ["keep", "delete-me", "also-keep"];
      const original = [...statuses];
      const result = applyCatalogFilterEvent(
        { statuses },
        { kind: "statusDeleted", key: "delete-me" }
      );
      expect(result).toEqual({ statuses: ["keep", "also-keep"] });
      // input array must not be mutated in place
      expect(statuses).toEqual(original);
      expect(result?.statuses).not.toBe(statuses);
    });

    it("returns null when the deleted key is not present in statuses", () => {
      const statuses = ["a", "b"];
      const result = applyCatalogFilterEvent(
        { statuses },
        { kind: "statusDeleted", key: "not-there" }
      );
      expect(result).toBeNull();
    });

    it("returns null without throwing when statuses is undefined", () => {
      const result = applyCatalogFilterEvent(
        {},
        { kind: "statusDeleted", key: "anything" }
      );
      expect(result).toBeNull();
    });
  });

  describe("tagDeleted", () => {
    it("removes the deleted name from tags when present, preserving order of the rest", () => {
      const tags = ["keep", "delete-me", "also-keep"];
      const original = [...tags];
      const result = applyCatalogFilterEvent(
        { tags },
        { kind: "tagDeleted", name: "delete-me" }
      );
      expect(result).toEqual({ tags: ["keep", "also-keep"] });
      expect(tags).toEqual(original);
      expect(result?.tags).not.toBe(tags);
    });

    it("returns null when the deleted name is not present in tags", () => {
      const tags = ["a", "b"];
      const result = applyCatalogFilterEvent(
        { tags },
        { kind: "tagDeleted", name: "not-there" }
      );
      expect(result).toBeNull();
    });

    it("returns null without throwing when tags is undefined", () => {
      const result = applyCatalogFilterEvent(
        {},
        { kind: "tagDeleted", name: "anything" }
      );
      expect(result).toBeNull();
    });
  });

  describe("tagRenamed", () => {
    it("replaces oldName with newName when present, preserving order and length", () => {
      const tags = ["keep", "old-name", "also-keep"];
      const original = [...tags];
      const result = applyCatalogFilterEvent(
        { tags },
        { kind: "tagRenamed", oldName: "old-name", newName: "new-name" }
      );
      expect(result).toEqual({ tags: ["keep", "new-name", "also-keep"] });
      expect(result?.tags).toHaveLength(tags.length);
      expect(tags).toEqual(original);
      expect(result?.tags).not.toBe(tags);
    });

    it("dedupes when newName is already present in tags, avoiding a duplicate entry", () => {
      const tags = ["a", "b"];
      const result = applyCatalogFilterEvent(
        { tags },
        { kind: "tagRenamed", oldName: "a", newName: "b" }
      );
      expect(result).toEqual({ tags: ["b"] });
    });

    it("returns null when oldName is not present in tags", () => {
      const tags = ["a", "b"];
      const result = applyCatalogFilterEvent(
        { tags },
        { kind: "tagRenamed", oldName: "not-there", newName: "new-name" }
      );
      expect(result).toBeNull();
    });

    it("returns null without throwing when tags is undefined", () => {
      const result = applyCatalogFilterEvent(
        {},
        { kind: "tagRenamed", oldName: "old-name", newName: "new-name" }
      );
      expect(result).toBeNull();
    });
  });
});
