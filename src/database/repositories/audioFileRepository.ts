import type Database from "better-sqlite3";
import type { AudioFile, TrackStatus } from "../../models/AudioFile.js";

export type AudioFileUpsertInput = Omit<AudioFile, "tags" | "status" | "score"> & {
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
  score: number | null;
  first_seen_at: string;
  last_seen_at: string;
  is_removed: number;
};

export type AudioFileFilters = {
  search?: string;
  /** OR'd together (any matching status counts); omit/empty means no status filter. */
  statuses?: TrackStatus[];
  /** OR'd together; `null` in the list means "unscored" (score IS NULL). */
  scores?: (number | null)[];
  /** OR'd together (has any of these tags); omit/empty means no tag filter. */
  tags?: string[];
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
  if (filters.statuses && filters.statuses.length > 0) {
    const names = filters.statuses.map((_, i) => `@status${i}`);
    clauses.push(`status IN (${names.join(",")})`);
    filters.statuses.forEach((s, i) => {
      params[`status${i}`] = s;
    });
  }
  if (filters.scores && filters.scores.length > 0) {
    const numericScores = filters.scores.filter((s): s is number => s !== null);
    const includeUnscored = filters.scores.includes(null);
    const scoreParts: string[] = [];
    if (numericScores.length > 0) {
      const names = numericScores.map((_, i) => `@score${i}`);
      scoreParts.push(`score IN (${names.join(",")})`);
      numericScores.forEach((n, i) => {
        params[`score${i}`] = n;
      });
    }
    if (includeUnscored) scoreParts.push("score IS NULL");
    if (scoreParts.length > 0) clauses.push(`(${scoreParts.join(" OR ")})`);
  }
  if (filters.tags && filters.tags.length > 0) {
    const names = filters.tags.map((_, i) => `@tag${i}`);
    clauses.push(
      `id IN (SELECT aft.audio_file_id FROM audio_file_tags aft JOIN tags t ON t.id = aft.tag_id WHERE t.name IN (${names.join(",")}))`
    );
    filters.tags.forEach((t, i) => {
      params[`tag${i}`] = t;
    });
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
    score: row.score,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    isRemoved: row.is_removed === 1,
  };
}

/** Existing rows keyed by id, loaded once before a scan for change detection. Includes
 * soft-removed rows (with `isRemoved: true`) so a reappearing file's id/path is
 * recognized as already occupying a row — routing it to a reactivation/update path
 * instead of a plain INSERT, which would otherwise hit `UNIQUE constraint failed`. */
export function loadFingerprints(
  db: Database.Database
): Map<string, { size: number; modifiedAt: string; isRemoved: boolean }> {
  const rows = db
    .prepare(`SELECT id, size, modified_at, is_removed FROM audio_files`)
    .all() as { id: string; size: number; modified_at: string; is_removed: number }[];
  const map = new Map<string, { size: number; modifiedAt: string; isRemoved: boolean }>();
  for (const row of rows) {
    map.set(row.id, { size: row.size, modifiedAt: row.modified_at, isRemoved: row.is_removed === 1 });
  }
  return map;
}

/** Insert a brand-new audio file row (status defaults to 'unknown', no tags). */
export function insertAudioFile(db: Database.Database, file: AudioFileUpsertInput): void {
  db.prepare(
    `INSERT INTO audio_files (
      id, path, relative_path, filename, extension, size, created_at, modified_at,
      containing_folder, project_id, status,
      first_seen_at, last_seen_at, is_removed
    ) VALUES (
      @id, @path, @relativePath, @filename, @extension, @size, @createdAt, @modifiedAt,
      @containingFolder, @projectId, @status,
      @firstSeenAt, @lastSeenAt, 0
    )`
  ).run({
    ...file,
    createdAt: file.createdAt ?? null,
    projectId: file.projectId ?? null,
    status: file.status ?? "unknown",
  });
}

/** Update filesystem-derived fields for a modified (or reactivated, soft-removed → reappeared)
 * file; preserves user-set status/tags/score and clears is_removed. */
export function updateAudioFileMetadata(db: Database.Database, file: AudioFileUpsertInput): void {
  db.prepare(
    `UPDATE audio_files SET
      path = @path, relative_path = @relativePath, filename = @filename, extension = @extension,
      size = @size, created_at = @createdAt, modified_at = @modifiedAt,
      containing_folder = @containingFolder, project_id = @projectId,
      last_seen_at = @lastSeenAt, is_removed = 0
    WHERE id = @id`
  ).run({
    ...file,
    createdAt: file.createdAt ?? null,
    projectId: file.projectId ?? null,
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
  draftCount: number;
  unscoredCount: number;
};

/** Library-wide aggregate counts (unfiltered, ignores pagination) for the stat bar. */
export function getLibraryStats(db: Database.Database): LibraryStats {
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draftCount,
        SUM(CASE WHEN score IS NULL THEN 1 ELSE 0 END) AS unscoredCount
      FROM audio_files
      WHERE is_removed = 0`
    )
    .get() as {
    total: number;
    draftCount: number | null;
    unscoredCount: number | null;
  };

  return {
    total: row.total,
    draftCount: row.draftCount ?? 0,
    unscoredCount: row.unscoredCount ?? 0,
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

export function setScore(db: Database.Database, id: string, score: number | null): void {
  db.prepare(`UPDATE audio_files SET score = ? WHERE id = ?`).run(score, id);
}

/** Batch version of setScore — overwrites the score for every listed file (used by
 * batch-edit and by a project cascading its own score onto all its files). */
export function setScoreForFiles(db: Database.Database, ids: string[], score: number | null): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`UPDATE audio_files SET score = ? WHERE id IN (${placeholders})`).run(score, ...ids);
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

/** Adds tags to every listed file, on top of whatever tags each already has (union,
 * not replace) — used by batch-edit and by a project cascading its own tags onto
 * all its files. */
export function addTagsToFiles(db: Database.Database, ids: string[], tagNames: string[]): void {
  const unique = [...new Set(tagNames.map((t) => t.trim()).filter(Boolean))];
  if (ids.length === 0 || unique.length === 0) return;

  const tx = db.transaction(() => {
    for (const name of unique) {
      db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(name);
    }
    const placeholders = unique.map(() => "?").join(",");
    const tagRows = db
      .prepare(`SELECT id FROM tags WHERE name IN (${placeholders}) COLLATE NOCASE`)
      .all(...unique) as { id: number }[];

    const insert = db.prepare(`INSERT OR IGNORE INTO audio_file_tags (audio_file_id, tag_id) VALUES (?, ?)`);
    for (const id of ids) {
      for (const tagRow of tagRows) {
        insert.run(id, tagRow.id);
      }
    }
  });
  tx();
}
