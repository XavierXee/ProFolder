import path from "node:path";
import { describe, it, expect } from "vitest";
import { findMediaAncestors } from "../src/scanner/mediaDetector.js";
import type { WalkEntry } from "../src/scanner/walk.js";

const root = path.resolve("/Music");
const NOW = new Date();

function file(relativePath: string): WalkEntry {
  const absolutePath = path.join(root, relativePath);
  return {
    absolutePath,
    relativePath,
    filename: path.basename(absolutePath),
    stats: { size: 100, birthtime: NOW, mtime: NOW },
  };
}

describe("findMediaAncestors", () => {
  it("marks a file's containing directory as having video", () => {
    const { hasVideo, hasImage } = findMediaAncestors([file("Track A/clip.mp4")], root);

    expect(hasVideo.has(path.join(root, "Track A"))).toBe(true);
    expect(hasImage.has(path.join(root, "Track A"))).toBe(false);
  });

  it("marks a file's containing directory as having an image", () => {
    const { hasVideo, hasImage } = findMediaAncestors([file("Track A/cover.jpg")], root);

    expect(hasImage.has(path.join(root, "Track A"))).toBe(true);
    expect(hasVideo.has(path.join(root, "Track A"))).toBe(false);
  });

  it("propagates the flag up through every ancestor to the root, not just the immediate parent", () => {
    const { hasVideo } = findMediaAncestors([file("Ableton Projects/Track A/Extras/Media/clip.mov")], root);

    expect(hasVideo.has(path.join(root, "Ableton Projects", "Track A", "Extras", "Media"))).toBe(true);
    expect(hasVideo.has(path.join(root, "Ableton Projects", "Track A", "Extras"))).toBe(true);
    expect(hasVideo.has(path.join(root, "Ableton Projects", "Track A"))).toBe(true);
    expect(hasVideo.has(path.join(root, "Ableton Projects"))).toBe(true);
    expect(hasVideo.has(root)).toBe(true);
  });

  it("does not mark unrelated sibling folders", () => {
    const { hasVideo, hasImage } = findMediaAncestors(
      [file("Track A/clip.mp4")],
      root
    );

    expect(hasVideo.has(path.join(root, "Track B"))).toBe(false);
    expect(hasImage.has(path.join(root, "Track B"))).toBe(false);
  });

  it("ignores non-media files entirely", () => {
    const { hasVideo, hasImage } = findMediaAncestors(
      [file("Track A/song.wav"), file("Track A/notes.txt")],
      root
    );

    expect(hasVideo.size).toBe(0);
    expect(hasImage.size).toBe(0);
  });

  it("marks both hasVideo and hasImage on the same folder when both are present", () => {
    const { hasVideo, hasImage } = findMediaAncestors(
      [file("Track A/clip.mp4"), file("Track A/cover.png")],
      root
    );

    const trackA = path.join(root, "Track A");
    expect(hasVideo.has(trackA)).toBe(true);
    expect(hasImage.has(trackA)).toBe(true);
  });
});
