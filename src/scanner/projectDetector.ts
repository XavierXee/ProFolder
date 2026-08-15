import path from "node:path";

export function isAbletonProjectFile(filename: string): boolean {
  return filename.toLowerCase().endsWith(".als");
}

export type ProjectAssociation = {
  projectPath: string;
  abletonProjectFile?: string;
};

/**
 * Walks up from an audio file's absolute path to find the nearest ancestor
 * directory that directly contains a .als file (that directory is "the project").
 * Stops at rootPath — files outside any Ableton project folder are unassociated.
 */
export function findProjectRoot(
  audioFileAbsPath: string,
  rootPath: string,
  alsDirs: ReadonlyMap<string, string>
): ProjectAssociation | undefined {
  const normalizedRoot = path.resolve(rootPath);
  let dir = path.dirname(path.resolve(audioFileAbsPath));

  while (true) {
    const alsFile = alsDirs.get(dir);
    if (alsFile) {
      return { projectPath: dir, abletonProjectFile: alsFile };
    }
    if (dir === normalizedRoot) return undefined;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
