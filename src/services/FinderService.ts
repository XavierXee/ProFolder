import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface FinderService {
  revealInFinder(absolutePath: string): Promise<void>;
}

/** True if `absolutePath` resolves to somewhere inside (or exactly at) `root`. Shared
 * root-containment check used anywhere a filesystem path stored in/derived from the DB
 * needs to be defended against ever pointing outside the configured music root.
 *
 * Uses `fs.realpathSync` (not `path.resolve`) so that a symlink living inside `root` but
 * pointing at a target outside it is correctly rejected — `path.resolve` only normalizes
 * `.`/`..` lexically and never dereferences symlinks, which would let a symlinked file
 * (e.g. one the scanner walked and recorded by its own in-root path) stream/reveal
 * arbitrary content from outside the configured root. Fails closed: if `realpathSync`
 * throws (path doesn't exist, permission denied, etc.) the path is treated as NOT
 * contained rather than propagating the error. */
export function isWithinRoot(absolutePath: string, root: string): boolean {
  let resolved: string;
  let normalizedRoot: string;
  try {
    resolved = fs.realpathSync(absolutePath);
    normalizedRoot = fs.realpathSync(root);
  } catch {
    return false;
  }
  return resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep);
}

/** Reveals a file/folder in Finder via `open -R`. Only works on macOS. */
export class MacFinderService implements FinderService {
  /** Takes a provider function rather than a fixed path, since the configured music root can change at runtime. */
  constructor(private readonly getAllowedRoot: () => string) {}

  async revealInFinder(absolutePath: string): Promise<void> {
    if (!isWithinRoot(absolutePath, this.getAllowedRoot())) {
      throw new Error("Refusing to reveal a path outside the configured music root");
    }
    const resolved = path.resolve(absolutePath);
    await new Promise<void>((resolve, reject) => {
      execFile("open", ["-R", resolved], (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
