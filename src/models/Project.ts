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

  firstSeenAt: string;
  lastSeenAt: string;
  isRemoved: boolean;
};

export type ProjectWithFiles = Project & {
  audioFileIds: string[];
};
