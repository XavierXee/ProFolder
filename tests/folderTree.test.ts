import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildFolderTree } from "../src/scanner/folderTree.js";

let tmpRoot: string;

async function writeFile(relPath: string, content = ""): Promise<void> {
  const absPath = path.join(tmpRoot, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content);
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "folder-tree-test-"));
  await writeFile("Track A/Track A.als", "als");
  await writeFile("Track A/Exports/Final.wav", "audio");
  await writeFile("Track A/.DS_Store", "junk");
  await writeFile("Backup/should-not-appear.txt", "old");
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("buildFolderTree", () => {
  it("omits files by default", async () => {
    const tree = await buildFolderTree(tmpRoot);

    const trackA = tree.children.find((c) => c.name === "Track A")!;
    expect(trackA.type).toBe("folder");
    expect(trackA.children.every((c) => c.type === "folder")).toBe(true);
    expect(trackA.children.find((c) => c.name === "Track A.als")).toBeUndefined();
  });

  it("includes files as leaf nodes when includeFiles is set", async () => {
    const tree = await buildFolderTree(tmpRoot, { includeFiles: true });

    const trackA = tree.children.find((c) => c.name === "Track A")!;
    const alsFile = trackA.children.find((c) => c.name === "Track A.als");
    expect(alsFile?.type).toBe("file");
    expect(alsFile?.children).toEqual([]);

    const exportsFolder = trackA.children.find((c) => c.name === "Exports")!;
    expect(exportsFolder.type).toBe("folder");
    const wavFile = exportsFolder.children.find((c) => c.name === "Final.wav");
    expect(wavFile?.type).toBe("file");
  });

  it("still skips junk files like .DS_Store even with includeFiles set", async () => {
    const tree = await buildFolderTree(tmpRoot, { includeFiles: true });

    const trackA = tree.children.find((c) => c.name === "Track A")!;
    expect(trackA.children.find((c) => c.name === ".DS_Store")).toBeUndefined();
  });

  it("still excludes Backup folders and their files entirely", async () => {
    const tree = await buildFolderTree(tmpRoot, { includeFiles: true });

    expect(tree.children.find((c) => c.name === "Backup")).toBeUndefined();
  });
});
