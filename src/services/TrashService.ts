import { execFile } from "node:child_process";
import path from "node:path";
import { isWithinRoot } from "../config/musicRoot.js";

export interface TrashService {
  trash(absolutePaths: string[]): Promise<void>;
}

/** Thrown when any requested path resolves outside the configured music root. */
export class PathOutsideRootError extends Error {}

/** Escapes a path for embedding inside an AppleScript double-quoted string literal. */
function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Moves files/folders to the macOS Trash via Finder's `delete` command, trashing every
 * path in a single `osascript` invocation using AppleScript's list form. Only works on macOS. */
export class MacTrashService implements TrashService {
  /** Takes a provider function rather than a fixed path, since the configured music root can change at runtime. */
  constructor(private readonly getAllowedRoot: () => string) {}

  async trash(absolutePaths: string[]): Promise<void> {
    const root = this.getAllowedRoot();
    // All-or-nothing containment pre-check: if any path fails, reject the whole call
    // without shelling out at all (do not partially trash some paths and reject others).
    for (const absolutePath of absolutePaths) {
      if (!isWithinRoot(absolutePath, root)) {
        throw new PathOutsideRootError("Refusing to trash a path outside the configured music root");
      }
    }
    if (absolutePaths.length === 0) return;

    const posixFileList = absolutePaths
      .map((absolutePath) => `POSIX file "${escapeForAppleScript(path.resolve(absolutePath))}"`)
      .join(", ");
    const script = `tell application "Finder" to delete {${posixFileList}}`;

    await new Promise<void>((resolve, reject) => {
      execFile("osascript", ["-e", script], (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
