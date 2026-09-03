export type ProjectDuplicateMatch = {
  projectId: string;
  projectName: string;
  projectPath: string;
  /** How many sample files matched (by filename + size) against the target project. */
  matchingSampleCount: number;
  /** Total sample file count found under this matched project's Samples folder(s). */
  sampleCount: number;
  /** matchingSampleCount / min(sample counts of the two projects). */
  matchRatio: number;
};
