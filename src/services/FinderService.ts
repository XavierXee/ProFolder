import { execFile } from "node:child_process";
import path from "node:path";

export interface FinderService {
  revealInFinder(absolutePath: string): Promise<void>;
}

/** Reveals a file/folder in Finder via `open -R`. Only works on macOS. */
export class MacFinderService implements FinderService {
  /** Takes a provider function rather than a fixed path, since the configured music root can change at runtime. */
  constructor(private readonly getAllowedRoot: () => string) {}

  async revealInFinder(absolutePath: string): Promise<void> {
    const resolved = path.resolve(absolutePath);
    const normalizedRoot = path.resolve(this.getAllowedRoot());
    if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
      throw new Error("Refusing to reveal a path outside the configured music root");
    }
    await new Promise<void>((resolve, reject) => {
      execFile("open", ["-R", resolved], (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
