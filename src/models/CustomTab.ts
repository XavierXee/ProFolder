import type { TrackStatus } from "./AudioFile.js";

export type CustomTabType = "files" | "projects";

export interface CustomTab {
  id: number;
  name: string;
  type: CustomTabType;
  statuses: TrackStatus[];
  scores: (number | "unscored")[];
  tags: string[];
  /** Files-type tabs only (projects have no association concept); omitted/undefined means no filter. */
  association?: "associated" | "unassociated";
  /** User-reorderable position in the tab bar, drag-and-drop persisted. `findAll` already
   * returns tabs sorted by this, so consumers generally don't need to read it directly. */
  sortOrder: number;
  createdAt: string;
}
