export type TrackStatus = "unknown" | "draft" | "needs_mixing" | "done" | "released";

export const ALL_TRACK_STATUSES: TrackStatus[] = ["unknown", "draft", "needs_mixing", "done", "released"];

export type AudioFile = {
  id: string;
  path: string;
  relativePath: string;
  filename: string;
  extension: string;

  size: number;
  createdAt?: string;
  modifiedAt: string;

  containingFolder: string;
  projectId?: string;

  status: TrackStatus;
  tags: string[];

  /** User-set quality/readiness score, 1 (worst) to 5 (best); null if not yet scored. */
  score: number | null;

  firstSeenAt: string;
  lastSeenAt: string;
  isRemoved: boolean;
};
