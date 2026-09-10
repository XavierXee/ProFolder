import { execFile } from "node:child_process";
import path from "node:path";
import { isWithinRoot } from "../config/musicRoot.js";

export interface FinderService {
  revealInFinder(absolutePath: string): Promise<void>;
}

/** Thrown when the requested path resolves outside the configured music root. */
export class PathOutsideRootError extends Error {}

/** Reveals a file/folder in Finder via `open -R`. Only works on macOS. */
export class MacFinderService implements FinderService {
  /** Takes a provider function rather than a fixed path, since the configured music root can change at runtime. */
  constructor(private readonly getAllowedRoot: () => string) {}

  async revealInFinder(absolutePath: string): Promise<void> {
    if (!isWithinRoot(absolutePath, this.getAllowedRoot())) {
      throw new PathOutsideRootError("Refusing to reveal a path outside the configured music root");
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
