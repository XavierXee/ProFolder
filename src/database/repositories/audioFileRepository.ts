import path from "node:path";
import type Database from "better-sqlite3";
import { ALL_TRACK_STATUSES, type AudioFile, type EntityStats, type TrackStatus } from "../../models/AudioFile.js";
import { loadActiveDawProjectIds } from "./projectRepository.js";
import { syncProjectFromFiles } from "./linkSync.js";

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
  sortBy?: "name" | "modifiedAt" | "folder" | "score";
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
  if (sortBy === "score") return "score";
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

/** Library-wide aggregate counts (unfiltered, ignores pagination) for the Metrics panel.
 * Deliberately a single aggregate query with no GROUP BY, so it always returns exactly one
 * row (even over an empty table) with every status present — a GROUP BY-based approach
 * would silently omit any status with zero matching rows. */
export function getFileStats(db: Database.Database): EntityStats {
  const statusClauses = ALL_TRACK_STATUSES.map(
    (status) => `SUM(CASE WHEN status = '${status}' THEN 1 ELSE 0 END) AS ${status}`
  ).join(",\n        ");

  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        ${statusClauses}
      FROM audio_files
      WHERE is_removed = 0`
    )
    .get() as { total: number } & Record<TrackStatus, number | null>;

  const byStatus = {} as Record<TrackStatus, number>;
  for (const status of ALL_TRACK_STATUSES) {
    byStatus[status] = row[status] ?? 0;
  }

  return { total: row.total, byStatus };
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

/** Filters a list of ids down to only those with an existing row in `audio_files` —
 * existence-only, deliberately NOT filtered by `is_removed` (a soft-removed file
 * still has a row and should still count as "known"). Used by batch routes to drop
 * unknown ids before they can trip a foreign-key constraint (e.g. audio_file_tags) or
 * inflate an `updated` count. Also naturally dedupes the input. */
export function filterExistingFileIds(db: Database.Database, ids: string[]): string[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id FROM audio_files WHERE id IN (${placeholders})`).all(...ids) as {
    id: string;
  }[];
  return rows.map((r) => r.id);
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

/** Derives the same location-based fields the scanner would compute for a file at
 * `absolutePath` (see `id`/`relativePath`/`containingFolder`/`filename`/`extension`
 * derivation in `scanner/scanner.ts`'s per-file loop) — kept in sync with that logic so
 * a moved/cloned row looks exactly like a freshly-scanned row at the same location.
 *
 * Rejects an `absolutePath` that doesn't resolve inside `musicRoot`: without this check,
 * an out-of-root path would silently derive a `..`-prefixed relative id with no error,
 * corrupting the DB with a nonsensical id rather than failing cleanly. */
function deriveLocationFields(musicRoot: string, absolutePath: string) {
  const resolvedRoot = path.resolve(musicRoot);
  const resolvedPath = path.resolve(absolutePath);
  const relativePath = path.relative(resolvedRoot, resolvedPath);
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(
      `deriveLocationFields: "${absolutePath}" resolves outside musicRoot "${musicRoot}"`
    );
  }
  const filename = path.basename(resolvedPath);
  return {
    id: relativePath,
    path: resolvedPath,
    relativePath,
    filename,
    extension: path.extname(filename).toLowerCase(),
    containingFolder: path.dirname(resolvedPath),
  };
}

/** Finds the nearest ancestor project (by id, which is a relative path — see
 * `scanner.ts`'s `id: dir.relativePath`) containing a given relative file path, by
 * walking up its path segments and checking each against the currently-active,
 * DAW-classified `projects` rows. Mirrors the walk-to-root algorithm `findProjectRoot` in
 * `scanner/projectDetector.ts` uses during a scan, but adapted to run off already-
 * persisted project rows instead of a live DAW-marker classification map — move/copy
 * happen outside a scan and have no such live filesystem classification data available.
 *
 * Deliberately restricted to DAW-classified rows (`loadActiveDawProjectIds`, not the
 * unfiltered `loadActiveProjectIds`): the `projects` table also holds a row for every
 * plain (non-DAW) top-level folder the scanner walked (so the UI can list them alongside
 * real projects), but the scanner's real association logic (`findProjectRoot`) never
 * associates files with those plain folders — matching them here would associate a moved/
 * cloned file with a folder a fresh scan would never associate it with. */
function findNearestAncestorProjectId(db: Database.Database, fileRelativePath: string): string | undefined {
  const activeDawProjectIds = loadActiveDawProjectIds(db);
  let dir = path.dirname(fileRelativePath);
  while (true) {
    if (dir === "." || dir === "") return undefined;
    if (activeDawProjectIds.has(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Rekeys a single audio file's row in place to reflect a physical move that has
 * already happened (via `FileOpsService.movePath` in a later, composing task) —
 * this function does NOT touch the filesystem, only the DB. `id` is the current
 * (pre-move) id; `newAbsolutePath` is where the file now physically lives.
 *
 * Preserves status/tags/score/timestamps (same row, just re-keyed). Re-derives the
 * file's project association from its new location and, if it changed, recomputes
 * both the old and new project's aggregate score/tags via `syncProjectFromFiles`.
 *
 * `audio_file_tags` references `audio_files.id` with no `ON UPDATE CASCADE`, so
 * rekeying the parent id would otherwise trip an immediate foreign-key violation the
 * instant the `audio_files` row's id changes (its child tag rows would momentarily
 * reference a vanished id) — `PRAGMA defer_foreign_keys = ON` postpones that check to
 * COMMIT, giving the child-row rekey below a chance to catch up within the same
 * transaction before the check fires.
 */
export function moveFile(
  db: Database.Database,
  id: string,
  newAbsolutePath: string,
  musicRoot: string
): AudioFile {
  const source = findById(db, id);
  if (!source) {
    throw new Error(`moveFile: no audio file found with id "${id}"`);
  }

  const location = deriveLocationFields(musicRoot, newAbsolutePath);
  const newProjectId = findNearestAncestorProjectId(db, location.relativePath);
  const oldProjectId = source.projectId;

  const tx = db.transaction(() => {
    db.pragma("defer_foreign_keys = ON");
    db.prepare(
      `UPDATE audio_files SET
        id = @newId, path = @path, relative_path = @relativePath, filename = @filename,
        extension = @extension, containing_folder = @containingFolder, project_id = @projectId
      WHERE id = @oldId`
    ).run({
      newId: location.id,
      path: location.path,
      relativePath: location.relativePath,
      filename: location.filename,
      extension: location.extension,
      containingFolder: location.containingFolder,
      projectId: newProjectId ?? null,
      oldId: id,
    });
    db.prepare(`UPDATE audio_file_tags SET audio_file_id = ? WHERE audio_file_id = ?`).run(
      location.id,
      id
    );
  });
  tx();

  if (newProjectId !== oldProjectId) {
    if (oldProjectId) syncProjectFromFiles(db, oldProjectId);
    if (newProjectId) syncProjectFromFiles(db, newProjectId);
  }

  return findById(db, location.id)!;
}

/**
 * Creates a new audio file row at `newAbsolutePath` carrying over `status`/`score`/
 * tags (pointing at the SAME `tags` rows, not duplicating them) from the source file
 * `id` — the source row is left completely untouched. Like `moveFile`, this does NOT
 * touch the filesystem; it assumes a physical copy already happened (via a later,
 * composing task using `FileOpsService.copyPath`).
 *
 * Content-derived fields (`size`/`createdAt`/`modifiedAt`) are carried over from the
 * source, since this function has no filesystem access to re-stat the copy; location-
 * derived fields (`filename`/`extension`/`relativePath`/`containingFolder`) are
 * re-derived from `newAbsolutePath`, same as `moveFile`. The clone is a brand-new
 * library entity, so `firstSeenAt`/`lastSeenAt` are set to now, not carried over.
 *
 * Determines the new row's project the same way as `moveFile` (nearest ancestor of
 * the new location). Only recomputes the *new* project's aggregate (via
 * `syncProjectFromFiles`), and only if it differs from the source's project — the
 * source project's aggregate is unaffected, since the source file itself didn't change.
 */
export function cloneFile(
  db: Database.Database,
  id: string,
  newAbsolutePath: string,
  musicRoot: string
): AudioFile {
  const source = findById(db, id);
  if (!source) {
    throw new Error(`cloneFile: no audio file found with id "${id}"`);
  }

  const location = deriveLocationFields(musicRoot, newAbsolutePath);
  const newProjectId = findNearestAncestorProjectId(db, location.relativePath);
  const nowIso = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO audio_files (
        id, path, relative_path, filename, extension, size, created_at, modified_at,
        containing_folder, project_id, status, score,
        first_seen_at, last_seen_at, is_removed
      ) VALUES (
        @id, @path, @relativePath, @filename, @extension, @size, @createdAt, @modifiedAt,
        @containingFolder, @projectId, @status, @score,
        @firstSeenAt, @lastSeenAt, 0
      )`
    ).run({
      id: location.id,
      path: location.path,
      relativePath: location.relativePath,
      filename: location.filename,
      extension: location.extension,
      size: source.size,
      createdAt: source.createdAt ?? null,
      modifiedAt: source.modifiedAt,
      containingFolder: location.containingFolder,
      projectId: newProjectId ?? null,
      status: source.status,
      score: source.score,
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
    });

    if (source.tags.length > 0) {
      const sourceTagRows = db
        .prepare(`SELECT tag_id FROM audio_file_tags WHERE audio_file_id = ?`)
        .all(id) as { tag_id: number }[];
      const insert = db.prepare(`INSERT INTO audio_file_tags (audio_file_id, tag_id) VALUES (?, ?)`);
      for (const tagRow of sourceTagRows) {
        insert.run(location.id, tagRow.tag_id);
      }
    }
  });
  tx();

  if (newProjectId && newProjectId !== source.projectId) {
    syncProjectFromFiles(db, newProjectId);
  }

  return findById(db, location.id)!;
}
