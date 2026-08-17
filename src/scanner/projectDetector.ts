import path from "node:path";

export type ProjectAssociation = {
  projectPath: string;
  markerPath: string | null;
};

/**
 * Walks up from an audio file's absolute path to find the nearest ancestor directory
 * recognized as a DAW project (see `projectDirs`) — that directory is "the project".
 * Stops at rootPath — files outside any recognized project folder are unassociated.
 *
 * `projectDirs` maps a project directory's absolute path to the absolute path of the
 * file/package that marked it as a project, or `null` if it was recognized via a
 * marker subfolder instead (e.g. Ableton Project Info, with no project file present).
 */
export function findProjectRoot(
  audioFileAbsPath: string,
  rootPath: string,
  projectDirs: ReadonlyMap<string, string | null>
): ProjectAssociation | undefined {
  const normalizedRoot = path.resolve(rootPath);
  let dir = path.dirname(path.resolve(audioFileAbsPath));

  while (true) {
    if (projectDirs.has(dir)) {
      return { projectPath: dir, markerPath: projectDirs.get(dir) ?? null };
    }
    if (dir === normalizedRoot) return undefined;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
