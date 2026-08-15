import path from "node:path";
import { describe, it, expect } from "vitest";
import { findProjectRoot, isAbletonProjectFile } from "../src/scanner/projectDetector.js";

describe("isAbletonProjectFile", () => {
  it("recognizes .als files case-insensitively", () => {
    expect(isAbletonProjectFile("Track A.als")).toBe(true);
    expect(isAbletonProjectFile("Track A.ALS")).toBe(true);
    expect(isAbletonProjectFile("Track A.wav")).toBe(false);
  });
});

describe("findProjectRoot", () => {
  const root = path.resolve("/Music");

  it("associates a nested export file with the nearest ancestor .als folder", () => {
    const trackADir = path.join(root, "Ableton Projects", "Track A");
    const alsDirs = new Map([[trackADir, path.join(trackADir, "Track A.als")]]);
    const filePath = path.join(trackADir, "Exports", "Track A - Final.wav");

    const result = findProjectRoot(filePath, root, alsDirs);

    expect(result?.projectPath).toBe(trackADir);
    expect(result?.abletonProjectFile).toBe(path.join(trackADir, "Track A.als"));
  });

  it("returns undefined for files with no ancestor .als directory", () => {
    const alsDirs = new Map<string, string>();
    const filePath = path.join(root, "Sample Library", "Drums", "kick.wav");

    const result = findProjectRoot(filePath, root, alsDirs);

    expect(result).toBeUndefined();
  });

  it("does not associate a file with an .als folder outside its own ancestry", () => {
    const trackADir = path.join(root, "Ableton Projects", "Track A");
    const trackBDir = path.join(root, "Ableton Projects", "Track B");
    const alsDirs = new Map([[trackADir, path.join(trackADir, "Track A.als")]]);
    const filePath = path.join(trackBDir, "Bounce", "Track B - Draft.wav");

    const result = findProjectRoot(filePath, root, alsDirs);

    expect(result).toBeUndefined();
  });
});
