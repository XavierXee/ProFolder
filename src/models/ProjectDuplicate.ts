/** Why a candidate was flagged as a potential duplicate of the target project. */
export type MatchReason = "sameName" | "sampleOverlap";

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
  /**
   * Which criteria qualified this pair as a match. Never empty. One of:
   * - `["sameName"]`: matched only via the name-gated relaxed sample-overlap threshold
   *   (same normalized project name, but didn't clear the stricter global thresholds).
   * - `["sampleOverlap"]`: matched purely on sample overlap, clearing the stricter
   *   global thresholds regardless of project name.
   * - `["sameName", "sampleOverlap"]`: same normalized project name AND cleared the
   *   stricter global sample-overlap thresholds on its own.
   */
  matchReasons: MatchReason[];
};
