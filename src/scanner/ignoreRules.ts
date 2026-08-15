export const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".Trash",
  ".Spotlight-V100",
  ".fseventsd",
  ".TemporaryItems",
  "$RECYCLE.BIN",
]);

export function shouldIgnoreDir(dirName: string): boolean {
  if (dirName.startsWith(".")) return true;
  return IGNORED_DIR_NAMES.has(dirName);
}

export function shouldIgnoreFile(filename: string): boolean {
  return filename === ".DS_Store" || filename.startsWith("._");
}
