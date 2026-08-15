import type Database from "better-sqlite3";
import type { AudioFile, TrackStatus } from "../../models/AudioFile.js";

export type AudioFileUpsertInput = Omit<AudioFile, "tags" | "status"> & {
  status?: TrackStatus;
};

type AudioFileRow = {
  id: string;
  path: string;
  relative_path: string;
  filename: string;
  extension: string;
  size: number;
  created_at: string | null;
  modified_at: string;
  containing_folder: string;
  project_id: string | null;
  status: TrackStatus;
  is_export_candidate: number;
  export_confidence: number;
  first_seen_at: string;
  last_seen_at: string;
  is_removed: number;
};

export type AudioFileFilters = {
  search?: string;
  status?: TrackStatus;
  hasExport?: boolean;
  tag?: string;
  projectId?: string;
  sortBy?: "name" | "modifiedAt" | "folder";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type PagedResult<T> = {
  items: T[];
  total: number;
};

function buildWhereClause(filters: AudioFileFilters): { where: string; params: Record<string, unknown> } {
  const clauses: string[] = ["is_removed = 0"];
  const params: Record<string, unknown> = {};

  if (filters.search) {
    clauses.push("(filename LIKE @search OR relative_path LIKE @search)");
    params.search = `%${filters.search}%`;
  }
  if (filters.status) {
    clauses.push("status = @status");
    params.status = filters.status;
  }
  if (filters.hasExport !== undefined) {
    clauses.push("is_export_candidate = @hasExport");
    params.hasExport = filters.hasExport ? 1 : 0;
  }
  if (filters.tag) {
    clauses.push(
      `id IN (SELECT aft.audio_file_id FROM audio_file_tags aft JOIN tags t ON t.id = aft.tag_id WHERE t.name = @tag)`
    );
    params.tag = filters.tag;
  }
  if (filters.projectId) {
    clauses.push("project_id = @projectId");
    params.projectId = filters.projectId;
  }

  return { where: clauses.join(" AND "), params };
}

function rowToAudioFile(row: AudioFileRow, tags: string[]): AudioFile {
  return {
    id: row.id,
    path: row.path,
    relativePath: row.relative_path,
    filename: row.filename,
    extension: row.extension,
    size: row.size,
    createdAt: row.created_at ?? undefined,
    modifiedAt: row.modified_at,
    containingFolder: row.containing_folder,
    projectId: row.project_id ?? undefined,
    status: row.status,
    tags,
    isExportCandidate: row.is_export_candidate === 1,
    exportConfidence: row.export_confidence,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    isRemoved: row.is_removed === 1,
  };
}

/** Existing rows keyed by id, loaded once before a scan for change detection. */
export function loadActiveFingerprints(
  db: Database.Database
): Map<string, { size: number; modifiedAt: string }> {
  const rows = db
    .prepare(`SELECT id, size, modified_at FROM audio_files WHERE is_removed = 0`)
    .all() as { id: string; size: number; modified_at: string }[];
  const map = new Map<string, { size: number; modifiedAt: string }>();
  for (const row of rows) {
    map.set(row.id, { size: row.size, modifiedAt: row.modified_at });
  }
  return map;
}

/** Insert a brand-new audio file row (status defaults to 'unknown', no tags). */
export function insertAudioFile(db: Database.Database, file: AudioFileUpsertInput): void {
  db.prepare(
    `INSERT INTO audio_files (
      id, path, relative_path, filename, extension, size, created_at, modified_at,
      containing_folder, project_id, status, is_export_candidate, export_confidence,
      first_seen_at, last_seen_at, is_removed
    ) VALUES (
      @id, @path, @relativePath, @filename, @extension, @size, @createdAt, @modifiedAt,
      @containingFolder, @projectId, @status, @isExportCandidate, @exportConfidence,
      @firstSeenAt, @lastSeenAt, 0
    )`
  ).run({
    ...file,
    createdAt: file.createdAt ?? null,
    projectId: file.projectId ?? null,
    status: file.status ?? "unknown",
    isExportCandidate: file.isExportCandidate ? 1 : 0,
  });
}

/** Update filesystem-derived fields for a modified file; preserves user-set status/tags. */
export function updateAudioFileMetadata(db: Database.Database, file: AudioFileUpsertInput): void {
  db.prepare(
    `UPDATE audio_files SET
      path = @path, relative_path = @relativePath, filename = @filename, extension = @extension,
      size = @size, created_at = @createdAt, modified_at = @modifiedAt,
      containing_folder = @containingFolder, project_id = @projectId,
      is_export_candidate = @isExportCandidate, export_confidence = @exportConfidence,
      last_seen_at = @lastSeenAt, is_removed = 0
    WHERE id = @id`
  ).run({
    ...file,
    createdAt: file.createdAt ?? null,
    projectId: file.projectId ?? null,
    isExportCandidate: file.isExportCandidate ? 1 : 0,
  });
}

export function touchLastSeen(db: Database.Database, id: string, lastSeenAt: string): void {
  db.prepare(`UPDATE audio_files SET last_seen_at = ?, is_removed = 0 WHERE id = ?`).run(
    lastSeenAt,
    id
  );
}

export function markRemoved(db: Database.Database, ids: string[], lastSeenAt: string): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE audio_files SET is_removed = 1, last_seen_at = ? WHERE id IN (${placeholders})`
  ).run(lastSeenAt, ...ids);
}

/** Batch-fetches tags for a set of files in one query, avoiding an N+1 per row. */
function tagsForFiles(db: Database.Database, audioFileIds: string[]): Map<string, string[]> {
  const tagsById = new Map<string, string[]>();
  if (audioFileIds.length === 0) return tagsById;

  const placeholders = audioFileIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT aft.audio_file_id AS audioFileId, t.name AS name
       FROM audio_file_tags aft
       JOIN tags t ON t.id = aft.tag_id
       WHERE aft.audio_file_id IN (${placeholders})
       ORDER BY t.name`
    )
    .all(...audioFileIds) as { audioFileId: string; name: string }[];

  for (const row of rows) {
    const existing = tagsById.get(row.audioFileId);
    if (existing) existing.push(row.name);
    else tagsById.set(row.audioFileId, [row.name]);
  }
  return tagsById;
}

function sortColumnFor(sortBy: AudioFileFilters["sortBy"]): string {
  if (sortBy === "modifiedAt") return "modified_at";
  if (sortBy === "folder") return "containing_folder";
  return "filename";
}

/** Paginated, filtered, sorted list of active files, plus the total count matching the filters (ignoring limit/offset). */
export function findAllActivePaged(
  db: Database.Database,
  filters: AudioFileFilters = {}
): PagedResult<AudioFile> {
  const { where, params } = buildWhereClause(filters);
  const sortColumn = sortColumnFor(filters.sortBy);
  const sortDir = filters.sortDir === "desc" ? "DESC" : "ASC";

  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM audio_files WHERE ${where}`).get(params) as {
      count: number;
    }
  ).count;

  const limit = filters.limit ?? total;
  const offset = filters.offset ?? 0;

  const rows = db
    .prepare(
      `SELECT * FROM audio_files WHERE ${where} ORDER BY ${sortColumn} ${sortDir} LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset }) as AudioFileRow[];

  const tagsById = tagsForFiles(db, rows.map((row) => row.id));
  const items = rows.map((row) => rowToAudioFile(row, tagsById.get(row.id) ?? []));

  return { items, total };
}

/** Unpaginated convenience wrapper — use sparingly (e.g. small internal lookups), not for the main file list. */
export function findAllActive(db: Database.Database, filters: AudioFileFilters = {}): AudioFile[] {
  return findAllActivePaged(db, filters).items;
}

export type LibraryStats = {
  total: number;
  likelyExports: number;
  needsReview: number;
  draftCount: number;
  lowConfidenceCount: number;
};

export const LOW_CONFIDENCE_THRESHOLD = 0.5;

/** Library-wide aggregate counts (unfiltered, ignores pagination) for the stat bar. */
export function getLibraryStats(db: Database.Database): LibraryStats {
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_export_candidate = 1 THEN 1 ELSE 0 END) AS likelyExports,
        SUM(CASE WHEN status = 'unknown' AND is_export_candidate = 1 THEN 1 ELSE 0 END) AS needsReview,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draftCount,
        SUM(CASE WHEN export_confidence < @lowConfidenceThreshold THEN 1 ELSE 0 END) AS lowConfidenceCount
      FROM audio_files
      WHERE is_removed = 0`
    )
    .get({ lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD }) as {
    total: number;
    likelyExports: number | null;
    needsReview: number | null;
    draftCount: number | null;
    lowConfidenceCount: number | null;
  };

  return {
    total: row.total,
    likelyExports: row.likelyExports ?? 0,
    needsReview: row.needsReview ?? 0,
    draftCount: row.draftCount ?? 0,
    lowConfidenceCount: row.lowConfidenceCount ?? 0,
  };
}

/** Active file counts per project in a single aggregate query, avoiding a full-table load just to count. */
export function countActiveGroupedByProject(db: Database.Database): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT project_id AS projectId, COUNT(*) AS count
       FROM audio_files
       WHERE is_removed = 0 AND project_id IS NOT NULL
       GROUP BY project_id`
    )
    .all() as { projectId: string; count: number }[];
  return new Map(rows.map((r) => [r.projectId, r.count]));
}

export function findById(db: Database.Database, id: string): AudioFile | undefined {
  const row = db.prepare(`SELECT * FROM audio_files WHERE id = ?`).get(id) as
    | AudioFileRow
    | undefined;
  if (!row) return undefined;
  const tagsById = tagsForFiles(db, [row.id]);
  return rowToAudioFile(row, tagsById.get(row.id) ?? []);
}

export function updateStatus(db: Database.Database, id: string, status: TrackStatus): void {
  db.prepare(`UPDATE audio_files SET status = ? WHERE id = ?`).run(status, id);
}

export function setTags(db: Database.Database, id: string, tagNames: string[]): void {
  const unique = [...new Set(tagNames.map((t) => t.trim()).filter(Boolean))];
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM audio_file_tags WHERE audio_file_id = ?`).run(id);
    for (const name of unique) {
      db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(name);
      const tagRow = db.prepare(`SELECT id FROM tags WHERE name = ? COLLATE NOCASE`).get(name) as
        | { id: number }
        | undefined;
      if (tagRow) {
        db.prepare(
          `INSERT OR IGNORE INTO audio_file_tags (audio_file_id, tag_id) VALUES (?, ?)`
        ).run(id, tagRow.id);
      }
    }
  });
  tx();
}
