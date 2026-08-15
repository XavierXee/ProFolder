export type TrackStatus = "unknown" | "draft" | "finished";

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

  isExportCandidate: boolean;
  exportConfidence: number;

  firstSeenAt: string;
  lastSeenAt: string;
  isRemoved: boolean;
};
