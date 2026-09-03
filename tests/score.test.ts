import { describe, expect, it } from "vitest";
import { isValidScore, parseScoreQueryParam, parseScoreListQueryParam } from "../src/models/Score.js";

describe("isValidScore", () => {
  it("accepts null and integers 1 through 5", () => {
    expect(isValidScore(null)).toBe(true);
    for (let n = 1; n <= 5; n++) expect(isValidScore(n)).toBe(true);
  });

  it("rejects out-of-range or non-integer values", () => {
    expect(isValidScore(0)).toBe(false);
    expect(isValidScore(6)).toBe(false);
    expect(isValidScore(2.5)).toBe(false);
    expect(isValidScore("3")).toBe(false);
    expect(isValidScore(undefined)).toBe(false);
  });
});

describe("parseScoreQueryParam", () => {
  it("parses 'unscored' as null", () => {
    expect(parseScoreQueryParam("unscored")).toBeNull();
  });

  it("parses '1'..'5' as the matching number", () => {
    expect(parseScoreQueryParam("3")).toBe(3);
  });

  it("returns undefined (no filter) for out-of-range, non-numeric, or missing values", () => {
    expect(parseScoreQueryParam("0")).toBeUndefined();
    expect(parseScoreQueryParam("6")).toBeUndefined();
    expect(parseScoreQueryParam("abc")).toBeUndefined();
    expect(parseScoreQueryParam(undefined)).toBeUndefined();
  });
});

describe("parseScoreListQueryParam", () => {
  it("parses a mix of numbers and 'unscored'", () => {
    expect(parseScoreListQueryParam(["3", "unscored", "5"])).toEqual([3, null, 5]);
  });

  it("drops invalid entries but keeps the valid ones", () => {
    expect(parseScoreListQueryParam(["3", "bogus", "99"])).toEqual([3]);
  });

  it("returns undefined when nothing valid was given", () => {
    expect(parseScoreListQueryParam([])).toBeUndefined();
    expect(parseScoreListQueryParam(["bogus"])).toBeUndefined();
  });
});
