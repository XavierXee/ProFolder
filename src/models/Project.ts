import type { TrackStatus } from "./AudioFile.js";
import type { DawType } from "../scanner/dawDetector.js";

export type Project = {
  id: string;
  name: string;
  path: string;

  /** Absolute path to whatever marked this folder as a project (a project file or package), if any. */
  markerPath?: string;
  /** Which DAW this folder belongs to, or undefined for a plain (non-project) folder. */
  dawType?: DawType;
  /** Human-readable description of how it was detected, e.g. ".als file", "Ableton Project Info folder". */
  detectedVia?: string;

  /** Whether any video/image file exists anywhere within this folder's subtree (including unlisted subfolders). */
  hasVideo: boolean;
  hasImage: boolean;

  status: TrackStatus;
  tags: string[];
  /** User-set quality/readiness score, 1 (worst) to 5 (best); null if not yet scored. */
  score: number | null;

  firstSeenAt: string;
  lastSeenAt: string;
  isRemoved: boolean;

  /** Max of the project folder's own mtime and its DAW marker file's mtime — the
   * actual "last worked on" signal, as opposed to lastSeenAt (scan bookkeeping).
   * Null only for rows scanned before this field existed, until their next rescan. */
  contentModifiedAt: string | null;
};

export type ProjectWithFiles = Project & {
  audioFileIds: string[];
};
