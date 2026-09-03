import fs from "node:fs/promises";
import path from "node:path";
import { shouldIgnoreDir, shouldIgnoreFile, type IgnoreDirOptions } from "./ignoreRules.js";
import type { ScanError } from "./types.js";

export type WalkEntry = {
  absolutePath: string;
  relativePath: string;
  filename: string;
  stats: { size: number; birthtime: Date; mtime: Date };
};

/** A visited directory and the names of its immediate subdirectories (used to detect
 * project markers like "Ableton Project Info"). `mtime` is the directory's own
 * filesystem modified time — shallow, only changes when a direct child is
 * added/removed/renamed, not when a nested file's contents change. */
export type WalkDirInfo = {
  absolutePath: string;
  relativePath: string;
  childDirNames: string[];
  mtime: Date;
};

export type WalkResult = {
  files: WalkEntry[];
  directories: WalkDirInfo[];
  foldersScanned: number;
  errors: ScanError[];
};

/**
 * Recursively walks rootPath collecting every non-ignored file.
 * One bad directory/file (permission error, broken symlink, race with a
 * deleted file) is recorded in `errors` and skipped — it never aborts the walk.
 *
 * `excludedRelativePaths` are relative-path-from-root directories the caller wants
 * skipped entirely (user-configured scan exclusions) — not recursing into them also
 * excludes everything beneath, with no extra bookkeeping needed.
 *
 * `ignoreDirOptions` controls the toggleable Backup/Samples folder rules (see ignoreRules.ts).
 */
export async function walkDirectory(
  rootPath: string,
  excludedRelativePaths: ReadonlySet<string> = new Set(),
  ignoreDirOptions: IgnoreDirOptions = {}
): Promise<WalkResult> {
  const files: WalkEntry[] = [];
  const directories: WalkDirInfo[] = [];
  const errors: ScanError[] = [];
  let foldersScanned = 0;
  const normalizedRoot = path.resolve(rootPath);

  async function walk(dirAbsPath: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dirAbsPath, { withFileTypes: true });
    } catch (err) {
      errors.push({ path: dirAbsPath, message: (err as Error).message });
      return;
    }
    foldersScanned++;
    let dirMtime = new Date(0);
    try {
      dirMtime = (await fs.stat(dirAbsPath)).mtime;
    } catch (err) {
      errors.push({ path: dirAbsPath, message: (err as Error).message });
    }
    directories.push({
      absolutePath: dirAbsPath,
      relativePath: path.relative(normalizedRoot, dirAbsPath),
      childDirNames: entries.filter((e) => e.isDirectory()).map((e) => e.name),
      mtime: dirMtime,
    });

    for (const entry of entries) {
      const absolutePath = path.join(dirAbsPath, entry.name);
      try {
        if (entry.isDirectory()) {
          if (shouldIgnoreDir(entry.name, ignoreDirOptions)) continue;
          const relativePath = path.relative(normalizedRoot, absolutePath);
          if (excludedRelativePaths.has(relativePath)) continue;
          await walk(absolutePath);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          if (shouldIgnoreFile(entry.name)) continue;
          const stats = await fs.stat(absolutePath);
          if (!stats.isFile()) continue;
          files.push({
            absolutePath,
            relativePath: path.relative(normalizedRoot, absolutePath),
            filename: entry.name,
            stats: { size: stats.size, birthtime: stats.birthtime, mtime: stats.mtime },
          });
        }
      } catch (err) {
        errors.push({ path: absolutePath, message: (err as Error).message });
      }
    }
  }

  await walk(normalizedRoot);
  return { files, directories, foldersScanned, errors };
}
