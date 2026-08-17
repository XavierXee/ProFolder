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
 * project versions inside project folders; none of it is real production content. */
export const IGNORED_DIR_NAMES_CASE_INSENSITIVE = new Set(["backup"]);

export function shouldIgnoreDir(dirName: string): boolean {
  if (dirName.startsWith(".")) return true;
  if (IGNORED_DIR_NAMES.has(dirName)) return true;
  return IGNORED_DIR_NAMES_CASE_INSENSITIVE.has(dirName.toLowerCase());
}

export function shouldIgnoreFile(filename: string): boolean {
  return filename === ".DS_Store" || filename.startsWith("._");
}
