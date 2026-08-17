import fs from "node:fs/promises";
import path from "node:path";
import { shouldIgnoreDir, shouldIgnoreFile } from "./ignoreRules.js";

export type FolderNode = {
  name: string;
  /** Relative path from the tree's root — the identifier used for scan exclusions. */
  path: string;
  type: "folder" | "file";
  children: FolderNode[];
};

const MAX_DEPTH = 8;

/**
 * Builds a tree under rootPath, skipping the same dot-dirs/system dirs/junk files
 * the scanner ignores (Backup, node_modules, .DS_Store, etc.) — those are never
 * meaningful choices for the scan-exclusion picker nor useful in a folder browser.
 *
 * Directories only by default (used by the "choose which subfolders to scan"
 * picker, where files aren't relevant); pass `includeFiles: true` to also list
 * files as leaf nodes (used by the read-only folder detail view).
 */
export async function buildFolderTree(
  rootPath: string,
  options: { includeFiles?: boolean } = {}
): Promise<FolderNode> {
  const normalizedRoot = path.resolve(rootPath);
  const includeFiles = options.includeFiles ?? false;

  async function walk(absPath: string, relativePath: string, depth: number): Promise<FolderNode[]> {
    if (depth >= MAX_DEPTH) return [];

    let entries;
    try {
      entries = await fs.readdir(absPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const dirs = entries
      .filter((e) => e.isDirectory() && !shouldIgnoreDir(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    const nodes: FolderNode[] = [];
    for (const dir of dirs) {
      const childAbsPath = path.join(absPath, dir.name);
      const childRelativePath = relativePath ? `${relativePath}/${dir.name}` : dir.name;
      nodes.push({
        name: dir.name,
        path: childRelativePath,
        type: "folder",
        children: await walk(childAbsPath, childRelativePath, depth + 1),
      });
    }

    if (includeFiles) {
      const files = entries
        .filter((e) => (e.isFile() || e.isSymbolicLink()) && !shouldIgnoreFile(e.name))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const file of files) {
        const childRelativePath = relativePath ? `${relativePath}/${file.name}` : file.name;
        nodes.push({
          name: file.name,
          path: childRelativePath,
          type: "file",
          children: [],
        });
      }
    }

    return nodes;
  }

  return {
    name: path.basename(normalizedRoot),
    path: "",
    type: "folder",
    children: await walk(normalizedRoot, "", 0),
  };
}
