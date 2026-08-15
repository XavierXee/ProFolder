import { execFile } from "node:child_process";
import path from "node:path";

export interface FinderService {
  revealInFinder(absolutePath: string): Promise<void>;
}

/** Reveals a file/folder in Finder via `open -R`. Only works on macOS. */
export class MacFinderService implements FinderService {
  constructor(private readonly allowedRoot: string) {}

  async revealInFinder(absolutePath: string): Promise<void> {
    const resolved = path.resolve(absolutePath);
    const normalizedRoot = path.resolve(this.allowedRoot);
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
