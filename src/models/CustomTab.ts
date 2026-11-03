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
  /** Files-type tabs only: the tab's files are numbered and kept in a user-chosen order
   * (drag and drop) instead of being sortable by column. Always false for projects tabs. */
  ordered: boolean;
  /** User-reorderable position in the tab bar, drag-and-drop persisted. `findAll` already
   * returns tabs sorted by this, so consumers generally don't need to read it directly. */
  sortOrder: number;
  createdAt: string;
}
