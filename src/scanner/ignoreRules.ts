export const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".Trash",
  ".Spotlight-V100",
  ".fseventsd",
  ".TemporaryItems",
  "$RECYCLE.BIN",
]);

/** Matched case-insensitively — Ableton auto-generates a "Backup" folder of autosaved
 * project versions inside project folders; none of it is real production content.
 * Toggleable via scan settings (default: excluded). */
export const BACKUP_DIR_NAMES_CASE_INSENSITIVE = new Set(["backup"]);

/** Matched case-insensitively — a project's "Samples" folder is typically imported/library
 * material rather than the user's own production audio. Toggleable via scan settings
 * (default: excluded). */
export const SAMPLES_DIR_NAMES_CASE_INSENSITIVE = new Set(["samples"]);

export type IgnoreDirOptions = {
  excludeBackupFolders?: boolean;
  excludeSamplesFolders?: boolean;
};

export function shouldIgnoreDir(dirName: string, options: IgnoreDirOptions = {}): boolean {
  const { excludeBackupFolders = true, excludeSamplesFolders = true } = options;

  if (dirName.startsWith(".")) return true;
  if (IGNORED_DIR_NAMES.has(dirName)) return true;

  const lowerName = dirName.toLowerCase();
  if (excludeBackupFolders && BACKUP_DIR_NAMES_CASE_INSENSITIVE.has(lowerName)) return true;
  if (excludeSamplesFolders && SAMPLES_DIR_NAMES_CASE_INSENSITIVE.has(lowerName)) return true;

  return false;
}

export function shouldIgnoreFile(filename: string): boolean {
  return filename === ".DS_Store" || filename.startsWith("._");
}
