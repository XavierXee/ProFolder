import type { TrackStatus } from "./AudioFile.js";

export type Project = {
  id: string;
  name: string;
  path: string;

  abletonProjectFile?: string;

  status: TrackStatus;

  firstSeenAt: string;
  lastSeenAt: string;
  isRemoved: boolean;
};

export type ProjectWithFiles = Project & {
  audioFileIds: string[];
};
