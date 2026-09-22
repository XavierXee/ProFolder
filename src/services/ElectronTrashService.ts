import { shell } from "electron";
import path from "node:path";
import { isWithinRoot } from "../config/musicRoot.js";
import { PathOutsideRootError, TrashService } from "./TrashService.js";

/**
 * Moves files/folders to the OS trash via Electron's `shell.trashItem`. Additive,
 * Electron-only file: only ever imported by an Electron entrypoint, never by the plain web
 * server's module graph, so that plain `npm start`/web-mode boot never pulls in the
 * `electron` package.
 */
export class ElectronTrashService implements TrashService {
  /** Takes a provider function rather than a fixed path, since the configured music root can change at runtime. */
  constructor(private readonly getAllowedRoot: () => string) {}

  async trash(absolutePaths: string[]): Promise<void> {
    const root = this.getAllowedRoot();
    // All-or-nothing containment pre-check, matching MacTrashService: validate every path is
    // within the allowed root before trashing any of them (do not partially trash some paths
    // and reject others).
    for (const absolutePath of absolutePaths) {
      if (!isWithinRoot(absolutePath, root)) {
        throw new PathOutsideRootError("Refusing to trash a path outside the configured music root");
      }
    }

    // shell.trashItem trashes one item at a time and returns a Promise that rejects on
    // OS-level failure; let that rejection propagate as-is (matching MacTrashService, which
    // also rejects with the underlying error rather than wrapping it).
    for (const absolutePath of absolutePaths) {
      await shell.trashItem(path.resolve(absolutePath));
    }
  }
}
