import fs from "node:fs/promises";
import path from "node:path";
import { shouldIgnoreDir } from "./ignoreRules.js";

export type FolderNode = {
  name: string;
  /** Relative path from the music root — the identifier used for scan exclusions. */
  path: string;
  children: FolderNode[];
};

const MAX_DEPTH = 8;

/**
 * Builds a directory-only tree (no files) under rootPath, for the "choose which
 * subfolders to scan" picker. Skips the same dot-dirs/system dirs the scanner
 * ignores, since those are never meaningful inclusion/exclusion choices.
 */
export async function buildFolderTree(rootPath: string): Promise<FolderNode> {
  const normalizedRoot = path.resolve(rootPath);

  async function walk(absPath: string, relativePath: string, depth: number): Promise<FolderNode[]> {
    if (depth >= MAX_DEPTH) return [];

    let entries;
    try {
      entries = await fs.readdir(absPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const dirs = entries.filter((e) => e.isDirectory() && !shouldIgnoreDir(e.name)).sort((a, b) => a.name.localeCompare(b.name));

    const nodes: FolderNode[] = [];
    for (const dir of dirs) {
      const childAbsPath = path.join(absPath, dir.name);
      const childRelativePath = relativePath ? `${relativePath}/${dir.name}` : dir.name;
      nodes.push({
        name: dir.name,
        path: childRelativePath,
        children: await walk(childAbsPath, childRelativePath, depth + 1),
      });
    }
    return nodes;
  }

  return {
    name: path.basename(normalizedRoot),
    path: "",
    children: await walk(normalizedRoot, "", 0),
  };
}
