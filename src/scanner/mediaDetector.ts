import path from "node:path";
import { getExtension } from "./audioDetector.js";
import type { WalkEntry } from "./walk.js";

export const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".m4v",
  ".wmv",
  ".flv",
  ".mpg",
  ".mpeg",
  ".3gp",
]);

export const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
  ".webp",
  ".heic",
  ".heif",
  ".svg",
]);

export type MediaAncestors = {
  hasVideo: Set<string>;
  hasImage: Set<string>;
};

/**
 * For every video/image file found, marks its containing directory AND every ancestor
 * directory up to rootPath as "has video"/"has image". This lets a project folder's row
 * reflect media buried in subfolders that aren't listed as rows of their own (e.g. a
 * plain "Samples" folder nested inside a project) without walking each folder separately.
 */
export function findMediaAncestors(files: WalkEntry[], rootPath: string): MediaAncestors {
  const normalizedRoot = path.resolve(rootPath);
  const hasVideo = new Set<string>();
  const hasImage = new Set<string>();

  function markAncestors(target: Set<string>, startDir: string): void {
    let dir = startDir;
    while (true) {
      if (target.has(dir)) return; // already marked, and so are its ancestors
      target.add(dir);
      if (dir === normalizedRoot) return;
      const parent = path.dirname(dir);
      if (parent === dir) return;
      dir = parent;
    }
  }

  for (const file of files) {
    const ext = getExtension(file.filename);
    if (!VIDEO_EXTENSIONS.has(ext) && !IMAGE_EXTENSIONS.has(ext)) continue;

    const dir = path.dirname(file.absolutePath);
    if (VIDEO_EXTENSIONS.has(ext)) markAncestors(hasVideo, dir);
    if (IMAGE_EXTENSIONS.has(ext)) markAncestors(hasImage, dir);
  }

  return { hasVideo, hasImage };
}
