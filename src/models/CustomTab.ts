import type { TrackStatus } from "./AudioFile.js";

export type CustomTabType = "files" | "projects";

export interface CustomTab {
  id: number;
  name: string;
  type: CustomTabType;
  statuses: TrackStatus[];
  scores: (number | "unscored")[];
  tags: string[];
  createdAt: string;
}
