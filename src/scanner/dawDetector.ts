import path from "node:path";
import type { WalkEntry, WalkDirInfo } from "./walk.js";
import { getExtension } from "./audioDetector.js";
import type { DawType } from "./dawTypes.js";

export type { DawType } from "./dawTypes.js";
export { DAW_LABELS } from "./dawTypes.js";

/** Project file extensions, single-file-per-project DAWs. Source: fileinfo.com, archiveteam.org, bitwig.com. */
const EXTENSION_TO_DAW: Record<string, DawType> = {
  ".als": "ableton",
  ".cpr": "cubase",
  ".ptx": "protools",
  ".ptf": "protools",
  ".pts": "protools",
  ".flp": "flstudio",
  ".reason": "reason",
  ".rns": "reason", // legacy Reason project format
  ".song": "studioone",
  ".rpp": "reaper",
  ".bwproject": "bitwig",
};

/** Directory-name suffixes for DAWs whose "project file" is actually a macOS package (a directory). */
const DIR_SUFFIX_TO_DAW: Record<string, DawType> = {
  ".logicx": "logic",
};

/** Exact subfolder names Ableton auto-generates inside a project folder — a fallback marker
 * if the .als itself has been moved/renamed/deleted but the project folder otherwise remains. */
const MARKER_SUBFOLDER_TO_DAW: Record<string, DawType> = {
  "Ableton Project Info": "ableton",
};

export type FolderClassification = {
  dawType: DawType;
  detectedVia: string;
  markerPath: string | null;
};

/**
 * Classifies every visited directory as either a recognized DAW project or a plain folder.
 * Returns only the directories that ARE recognized (plain folders simply have no entry).
 *
 * Detection rules, in priority order (most concrete first):
 * 1. A directory whose name ends in a package-style DAW extension (e.g. "Song.logicx") is
 *    itself the project — the package IS the project unit for these DAWs, not its parent.
 * 2. A directory directly containing a file with a known DAW project extension.
 * 3. A directory directly containing an exact-name marker subfolder (e.g. Ableton Project Info),
 *    used as a fallback when no project file itself was found.
 */
export function classifyFolders(
  files: WalkEntry[],
  directories: WalkDirInfo[]
): Map<string, FolderClassification> {
  const classifications = new Map<string, FolderClassification>();

  for (const dir of directories) {
    for (const childName of dir.childDirNames) {
      const packageExt = Object.keys(DIR_SUFFIX_TO_DAW).find((suffix) =>
        childName.toLowerCase().endsWith(suffix)
      );
      if (packageExt) {
        const packageAbsPath = path.join(dir.absolutePath, childName);
        classifications.set(packageAbsPath, {
          dawType: DIR_SUFFIX_TO_DAW[packageExt]!,
          detectedVia: `${packageExt} package`,
          markerPath: packageAbsPath,
        });
        continue;
      }
      const markerDaw = MARKER_SUBFOLDER_TO_DAW[childName];
      if (markerDaw && !classifications.has(dir.absolutePath)) {
        classifications.set(dir.absolutePath, {
          dawType: markerDaw,
          detectedVia: `${childName} folder`,
          markerPath: null,
        });
      }
    }
  }

  const bestMtimePerDir = new Map<string, Date>();
  for (const file of files) {
    const ext = getExtension(file.filename);
    const dawType = EXTENSION_TO_DAW[ext];
    if (!dawType) continue;

    const dir = path.dirname(file.absolutePath);
    const existingMtime = bestMtimePerDir.get(dir);
    if (!existingMtime || file.stats.mtime > existingMtime) {
      bestMtimePerDir.set(dir, file.stats.mtime);
      classifications.set(dir, {
        dawType,
        detectedVia: `${ext} file`,
        markerPath: file.absolutePath,
      });
    }
  }

  return classifications;
}
