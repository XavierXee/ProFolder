import path from "node:path";
import { describe, it, expect } from "vitest";
import { findProjectRoot } from "../src/scanner/projectDetector.js";

describe("findProjectRoot", () => {
  const root = path.resolve("/Music");

  it("associates a nested export file with the nearest ancestor project folder", () => {
    const trackADir = path.join(root, "Ableton Projects", "Track A");
    const projectDirs = new Map([[trackADir, path.join(trackADir, "Track A.als")]]);
    const filePath = path.join(trackADir, "Exports", "Track A - Final.wav");

    const result = findProjectRoot(filePath, root, projectDirs);

    expect(result?.projectPath).toBe(trackADir);
    expect(result?.markerPath).toBe(path.join(trackADir, "Track A.als"));
  });

  it("returns undefined for files with no ancestor project directory", () => {
    const projectDirs = new Map<string, string | null>();
    const filePath = path.join(root, "Sample Library", "Drums", "kick.wav");

    const result = findProjectRoot(filePath, root, projectDirs);

    expect(result).toBeUndefined();
  });

  it("does not associate a file with a project folder outside its own ancestry", () => {
    const trackADir = path.join(root, "Ableton Projects", "Track A");
    const trackBDir = path.join(root, "Ableton Projects", "Track B");
    const projectDirs = new Map([[trackADir, path.join(trackADir, "Track A.als")]]);
    const filePath = path.join(trackBDir, "Bounce", "Track B - Draft.wav");

    const result = findProjectRoot(filePath, root, projectDirs);

    expect(result).toBeUndefined();
  });

  it("recognizes a project directory with no marker file, only a marker subfolder", () => {
    const trackCDir = path.join(root, "Ableton Projects", "Track C");
    const projectDirs = new Map<string, string | null>([[trackCDir, null]]);
    const filePath = path.join(trackCDir, "Exports", "Track C - Bounce.wav");

    const result = findProjectRoot(filePath, root, projectDirs);

    expect(result?.projectPath).toBe(trackCDir);
    expect(result?.markerPath).toBeNull();
  });
});
