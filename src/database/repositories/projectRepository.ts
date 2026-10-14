import type Database from "better-sqlite3";
import type { Project } from "../../models/Project.js";
import { UNKNOWN_STATUS_KEY, type EntityStats, type TrackStatus } from "../../models/AudioFile.js";
import type { DawType } from "../../scanner/dawDetector.js";
import type { PagedResult } from "./audioFileRepository.js";
import { findAll as findAllStatuses } from "./statusRepository.js";

export type ProjectFilters = {
  search?: string;
  /** OR'd together (any matching status counts); omit/empty means no status filter. */
  statuses?: TrackStatus[];
  /** OR'd together; `null` in the list means "unscored" (score IS NULL). */
  scores?: (number | null)[];
  /** OR'd together (has any of these tags); omit/empty means no tag filter. */
  tags?: string[];
  sortBy?: "name" | "modifiedAt" | "score" | "status" | "type" | "tags" | "audioFileCount";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

type ProjectRow = {
  id: string;
  name: string;
  path: string;
  marker_path: string | null;
  daw_type: DawType | null;
  detected_via: string | null;
  has_video: number;
  has_image: number;
  status: TrackStatus;
  score: number | null;
  notes: string;
  first_seen_at: string;
  last_seen_at: string;
  is_removed: number;
  content_modified_at: string | null;
};

function rowToProject(row: ProjectRow, tags: string[]): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    markerPath: row.marker_path ?? undefined,
    dawType: row.daw_type ?? undefined,
    detectedVia: row.detected_via ?? undefined,
    hasVideo: row.has_video === 1,
    hasImage: row.has_image === 1,
    status: row.status,
    tags,
    score: row.score,
    notes: row.notes,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    isRemoved: row.is_removed === 1,
    contentModifiedAt: row.content_modified_at,
  };
}

/** Batch-fetches tags for a set of projects in one query, avoiding an N+1 per row. */
function tagsForProjects(db: Database.Database, projectIds: string[]): Map<string, string[]> {
  const tagsById = new Map<string, string[]>();
  if (projectIds.length === 0) return tagsById;

  const placeholders = projectIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT pt.project_id AS projectId, t.name AS name
       FROM project_tags pt
       JOIN tags t ON t.id = pt.tag_id
       WHERE pt.project_id IN (${placeholders})
       ORDER BY t.name`
    )
    .all(...projectIds) as { projectId: string; name: string }[];

  for (const row of rows) {
    const existing = tagsById.get(row.projectId);
    if (existing) existing.push(row.name);
    else tagsById.set(row.projectId, [row.name]);
  }
  return tagsById;
}

export function loadActiveProjectIds(db: Database.Database): Set<string> {
  const rows = db.prepare(`SELECT id FROM projects WHERE is_removed = 0`).all() as {
    id: string;
  }[];
  return new Set(rows.map((r) => r.id));
}

/** Like `loadActiveProjectIds`, but restricted to rows that were actually DAW-classified
 * during a scan (`daw_type IS NOT NULL`). The `projects` table also holds a row for every
 * plain (non-DAW) top-level folder the scanner walked, purely so the UI can list them
 * alongside real projects — the scanner's own file-association logic (`findProjectRoot` in
 * `scanner/projectDetector.ts`) only ever associates files with DAW-classified folders, so
 * any code determining a file's project association (e.g. `findNearestAncestorProjectId` in
 * `audioFileRepository.ts`) must use this, not the unfiltered `loadActiveProjectIds`. */
export function loadActiveDawProjectIds(db: Database.Database): Set<string> {
  const rows = db
    .prepare(`SELECT id FROM projects WHERE is_removed = 0 AND daw_type IS NOT NULL`)
    .all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

export function upsertProject(
  db: Database.Database,
  project: Omit<Project, "status" | "isRemoved" | "tags" | "score" | "notes">
): void {
  db.prepare(
    `INSERT INTO projects (id, name, path, marker_path, daw_type, detected_via, has_video, has_image, status, first_seen_at, last_seen_at, is_removed, content_modified_at)
     VALUES (@id, @name, @path, @markerPath, @dawType, @detectedVia, @hasVideo, @hasImage, 'unknown', @firstSeenAt, @lastSeenAt, 0, @contentModifiedAt)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       path = excluded.path,
       marker_path = excluded.marker_path,
       daw_type = excluded.daw_type,
       detected_via = excluded.detected_via,
       has_video = excluded.has_video,
       has_image = excluded.has_image,
       last_seen_at = excluded.last_seen_at,
       is_removed = 0,
       content_modified_at = excluded.content_modified_at`
  ).run({
    ...project,
    markerPath: project.markerPath ?? null,
    dawType: project.dawType ?? null,
    detectedVia: project.detectedVia ?? null,
    hasVideo: project.hasVideo ? 1 : 0,
    hasImage: project.hasImage ? 1 : 0,
  });
}

export function markRemoved(db: Database.Database, ids: string[], lastSeenAt: string): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE projects SET is_removed = 1, last_seen_at = ? WHERE id IN (${placeholders})`
  ).run(lastSeenAt, ...ids);
}

function buildProjectWhereClause(filters: ProjectFilters): { where: string; params: Record<string, unknown> } {
  const clauses: string[] = ["is_removed = 0"];
  const params: Record<string, unknown> = {};

  if (filters.search) {
    clauses.push("(name LIKE @search OR id LIKE @search)");
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
      `id IN (SELECT pt.project_id FROM project_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.name IN (${names.join(",")}))`
    );
    filters.tags.forEach((t, i) => {
      params[`tag${i}`] = t;
    });
  }

  return { where: clauses.join(" AND "), params };
}

/** "tags"/"audioFileCount" have no directly-sortable column, so both use a correlated subquery
 * (mirroring audioFileRepository.ts's identical "tags" sort): tags sort by each project's
 * alphabetically-first tag (projects with no tags sort via SQL's default NULL ordering), and
 * audioFileCount sorts by a live count of that project's active audio files — recomputed here
 * rather than reusing `countActiveGroupedByProject`'s post-query map, since sorting has to happen
 * in SQL before pagination slices the result set. */
function sortColumnFor(sortBy: ProjectFilters["sortBy"]): string {
  if (sortBy === "modifiedAt") return "content_modified_at";
  if (sortBy === "score") return "score";
  if (sortBy === "status") return "status";
  if (sortBy === "type") return "daw_type";
  if (sortBy === "tags") {
    return `(SELECT MIN(t.name) FROM project_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.project_id = projects.id)`;
  }
  if (sortBy === "audioFileCount") {
    return `(SELECT COUNT(*) FROM audio_files af WHERE af.project_id = projects.id AND af.is_removed = 0)`;
  }
  return "name";
}

/** Paginated, filtered list of active projects, plus the total count matching the filters (ignoring limit/offset). */
export function findAllActivePaged(
  db: Database.Database,
  filters: ProjectFilters = {}
): PagedResult<Project> {
  const { where, params } = buildProjectWhereClause(filters);

  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM projects WHERE ${where}`).get(params) as {
      count: number;
    }
  ).count;

  const limit = filters.limit ?? total;
  const offset = filters.offset ?? 0;
  const sortColumn = sortColumnFor(filters.sortBy);
  const sortDir = filters.sortDir === "desc" ? "DESC" : "ASC";

  const rows = db
    .prepare(`SELECT * FROM projects WHERE ${where} ORDER BY ${sortColumn} ${sortDir} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as ProjectRow[];

  const tagsById = tagsForProjects(db, rows.map((row) => row.id));
  return { items: rows.map((row) => rowToProject(row, tagsById.get(row.id) ?? [])), total };
}

/** Unpaginated convenience wrapper — use sparingly (e.g. small internal lookups), not for the main project list. */
export function findAllActive(db: Database.Database): Project[] {
  return findAllActivePaged(db).items;
}

/** Library-wide aggregate counts (unfiltered, ignores pagination) for the Metrics panel.
 * Deliberately unfiltered by `daw_type` — every active project folder counts, matching what
 * the Projects tab's own list endpoint already shows (see `loadActiveDawProjectIds`'s doc
 * comment for why file-association logic uses a *different*, DAW-only set — that
 * distinction doesn't apply here). Uses a plain parameterized `GROUP BY` (status values are
 * now user-created catalog strings, not a compile-time-constant set, so string-interpolating
 * each status into a column alias would be SQL-injection-shaped) and then zero-fills the
 * result in JS for every currently-known status key ("unknown" plus every row in the
 * `statuses` catalog table), so the returned shape still has an entry for every known status
 * even if its count is 0 — preserving this function's previous zero-fill guarantee despite
 * the underlying query now being a real GROUP BY. */
export function getProjectStats(db: Database.Database): EntityStats {
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM projects WHERE is_removed = 0`)
    .get() as { total: number };

  const rows = db
    .prepare(`SELECT status, COUNT(*) AS count FROM projects WHERE is_removed = 0 GROUP BY status`)
    .all() as { status: TrackStatus; count: number }[];
  const countsByStatus = new Map(rows.map((r) => [r.status, r.count]));

  const byStatus: Record<string, number> = {};
  byStatus[UNKNOWN_STATUS_KEY] = countsByStatus.get(UNKNOWN_STATUS_KEY) ?? 0;
  for (const status of findAllStatuses(db)) {
    byStatus[status.key] = countsByStatus.get(status.key) ?? 0;
  }

  return { total: totalRow.total, byStatus };
}

/** Counts active projects per requested tag name, for the Metrics panel's per-tag breakdown.
 * Same shape/convention as `audioFileRepository.ts`'s `getFileTagCounts`: one parameterized
 * query joining `tags` -> `project_tags` -> `projects` (never string-interpolating a tag name
 * into SQL text), then zero-filled in JS for every requested name so a tag with no matches (or
 * that doesn't exist in the `tags` table at all) still gets an explicit 0. */
export function getProjectTagCounts(db: Database.Database, tagNames: string[]): Record<string, number> {
  if (tagNames.length === 0) return {};

  const placeholders = tagNames.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT t.name AS name, COUNT(DISTINCT pt.project_id) AS count
       FROM tags t
       JOIN project_tags pt ON pt.tag_id = t.id
       JOIN projects p ON p.id = pt.project_id
       WHERE p.is_removed = 0 AND t.name IN (${placeholders})
       GROUP BY t.name`
    )
    .all(...tagNames) as { name: string; count: number }[];
  // `tags.name` is UNIQUE COLLATE NOCASE, so the SQL `IN (...)` match above is case-insensitive
  // and returns rows keyed by the tag's actual stored casing. Key the map by lowercased name so
  // the zero-fill lookup below (which uses the caller's requested casing) matches regardless of
  // casing differences between the request and the stored tag.
  const countsByName = new Map(rows.map((r) => [r.name.toLowerCase(), r.count]));

  const result: Record<string, number> = {};
  for (const name of tagNames) {
    result[name] = countsByName.get(name.toLowerCase()) ?? 0;
  }
  return result;
}

export function findById(db: Database.Database, id: string): Project | undefined {
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | ProjectRow
    | undefined;
  if (!row) return undefined;
  const tagsById = tagsForProjects(db, [row.id]);
  return rowToProject(row, tagsById.get(row.id) ?? []);
}

export function updateStatus(db: Database.Database, id: string, status: TrackStatus): void {
  db.prepare(`UPDATE projects SET status = ? WHERE id = ?`).run(status, id);
}

export function setScore(db: Database.Database, id: string, score: number | null): void {
  db.prepare(`UPDATE projects SET score = ? WHERE id = ?`).run(score, id);
}

export function setNotes(db: Database.Database, id: string, notes: string): void {
  db.prepare(`UPDATE projects SET notes = ? WHERE id = ?`).run(notes, id);
}

/** Batch version of setScore — overwrites the score for every listed project. */
export function setScoreForProjects(db: Database.Database, ids: string[], score: number | null): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`UPDATE projects SET score = ? WHERE id IN (${placeholders})`).run(score, ...ids);
}

/** Filters a list of ids down to only those with an existing, active (not soft-removed)
 * row in `projects`. Used by batch routes to drop unknown/excluded ids before they can
 * trip a foreign-key constraint (e.g. project_tags), inflate an `updated` count, or let
 * a batch edit reach a project the user has already excluded from the library. Also
 * naturally dedupes the input. */
export function filterExistingProjectIds(db: Database.Database, ids: string[]): string[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT id FROM projects WHERE is_removed = 0 AND id IN (${placeholders})`)
    .all(...ids) as {
    id: string;
  }[];
  return rows.map((r) => r.id);
}

export function setTags(db: Database.Database, id: string, tagNames: string[]): void {
  const unique = [...new Set(tagNames.map((t) => t.trim()).filter(Boolean))];
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM project_tags WHERE project_id = ?`).run(id);
    for (const name of unique) {
      db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(name);
      const tagRow = db.prepare(`SELECT id FROM tags WHERE name = ? COLLATE NOCASE`).get(name) as
        | { id: number }
        | undefined;
      if (tagRow) {
        db.prepare(`INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?, ?)`).run(
          id,
          tagRow.id
        );
      }
    }
  });
  tx();
}

/** Adds tags to every listed project, on top of whatever tags each already has
 * (union, not replace) — used by batch-edit. */
export function addTagsToProjects(db: Database.Database, ids: string[], tagNames: string[]): void {
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

    const insert = db.prepare(`INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?, ?)`);
    for (const id of ids) {
      for (const tagRow of tagRows) {
        insert.run(id, tagRow.id);
      }
    }
  });
  tx();
}
