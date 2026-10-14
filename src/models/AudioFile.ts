/** A status is now a free-form catalog key (see `statusRepository`/`statuses` table) rather
 * than a fixed union — any string a user has created (or the hardcoded "unknown" sentinel,
 * which is never a real catalog row) is valid. Validity is checked at the application layer
 * via `statusRepository.isKnownStatusKey`, not by the type system. */
export type TrackStatus = string;

/** Hardcoded sentinel meaning "no status assigned" — always valid, never a real row in the
 * `statuses` catalog table, never editable/deletable. */
export const UNKNOWN_STATUS_KEY = "unknown";

/** Total count plus a full per-status breakdown (every currently-known status key present,
 * zero-filled if no rows match), used for the Metrics panel's file/project stat blocks. */
export type EntityStats = {
  total: number;
  byStatus: Record<string, number>;
};

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
  /** Free-text user notes, editable from the file's detail panel. Empty string, never null. */
  notes: string;

  firstSeenAt: string;
  lastSeenAt: string;
  isRemoved: boolean;
};
