import { shell } from "electron";
import path from "node:path";
import { isWithinRoot } from "../config/musicRoot.js";
import { FinderService, PathOutsideRootError } from "./FinderService.js";

/** Reveals a file/folder in the OS file manager via Electron's `shell.showItemInFolder`.
 * Additive, Electron-only file: only ever imported by an Electron entrypoint, never by the
 * plain web server's module graph, so that plain `npm start`/web-mode boot never pulls in
 * the `electron` package. */
export class ElectronFinderService implements FinderService {
  /** Takes a provider function rather than a fixed path, since the configured music root can change at runtime. */
  constructor(private readonly getAllowedRoot: () => string) {}

  async revealInFinder(absolutePath: string): Promise<void> {
    if (!isWithinRoot(absolutePath, this.getAllowedRoot())) {
      throw new PathOutsideRootError("Refusing to reveal a path outside the configured music root");
    }
    const resolved = path.resolve(absolutePath);
    // shell.showItemInFolder is synchronous and void-returning (unlike shell.trashItem),
    // so there is no async error to await/catch here. Unlike MacFinderService, which can
    // reject and surface a 500 for a genuine OS-level failure, a failure here is unobservable
    // by design — an inherent Electron API limitation, not a gap in this implementation.
    shell.showItemInFolder(resolved);
  }
}
