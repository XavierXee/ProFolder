import fs from "node:fs/promises";
import path from "node:path";
import { shouldIgnoreDir, shouldIgnoreFile } from "./ignoreRules.js";
import type { ScanError } from "./types.js";

export type WalkEntry = {
  absolutePath: string;
  relativePath: string;
  filename: string;
  stats: { size: number; birthtime: Date; mtime: Date };
};

export type WalkResult = {
  files: WalkEntry[];
  foldersScanned: number;
  errors: ScanError[];
};

/**
 * Recursively walks rootPath collecting every non-ignored file.
 * One bad directory/file (permission error, broken symlink, race with a
 * deleted file) is recorded in `errors` and skipped — it never aborts the walk.
 */
export async function walkDirectory(rootPath: string): Promise<WalkResult> {
  const files: WalkEntry[] = [];
  const errors: ScanError[] = [];
  let foldersScanned = 0;

  async function walk(dirAbsPath: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dirAbsPath, { withFileTypes: true });
    } catch (err) {
      errors.push({ path: dirAbsPath, message: (err as Error).message });
      return;
    }
    foldersScanned++;

    for (const entry of entries) {
      const absolutePath = path.join(dirAbsPath, entry.name);
      try {
        if (entry.isDirectory()) {
          if (shouldIgnoreDir(entry.name)) continue;
          await walk(absolutePath);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          if (shouldIgnoreFile(entry.name)) continue;
          const stats = await fs.stat(absolutePath);
          if (!stats.isFile()) continue;
          files.push({
            absolutePath,
            relativePath: path.relative(rootPath, absolutePath),
            filename: entry.name,
            stats: { size: stats.size, birthtime: stats.birthtime, mtime: stats.mtime },
          });
        }
      } catch (err) {
        errors.push({ path: absolutePath, message: (err as Error).message });
      }
    }
  }

  await walk(path.resolve(rootPath));
  return { files, foldersScanned, errors };
}
