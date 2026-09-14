import type Database from "better-sqlite3";
import type { Project } from "../../models/Project.js";
import type { TrackStatus } from "../../models/AudioFile.js";
import type { DawType } from "../../scanner/dawDetector.js";
import type { PagedResult } from "./audioFileRepository.js";

export type ProjectFilters = {
  search?: string;
  /** OR'd together (any matching status counts); omit/empty means no status filter. */
  statuses?: TrackStatus[];
  /** OR'd together; `null` in the list means "unscored" (score IS NULL). */
  scores?: (number | null)[];
  /** OR'd together (has any of these tags); omit/empty means no tag filter. */
  tags?: string[];
  sortBy?: "name" | "modifiedAt" | "score";
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
  project: Omit<Project, "status" | "isRemoved" | "tags" | "score">
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

function sortColumnFor(sortBy: ProjectFilters["sortBy"]): string {
  if (sortBy === "modifiedAt") return "content_modified_at";
  if (sortBy === "score") return "score";
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

/** Batch version of setScore — overwrites the score for every listed project. */
export function setScoreForProjects(db: Database.Database, ids: string[], score: number | null): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`UPDATE projects SET score = ? WHERE id IN (${placeholders})`).run(score, ...ids);
}

/** Filters a list of ids down to only those with an existing row in `projects` —
 * existence-only, deliberately NOT filtered by `is_removed` (a soft-removed project
 * still has a row and should still count as "known"). Used by batch routes to drop
 * unknown ids before they can trip a foreign-key constraint (e.g. project_tags) or
 * inflate an `updated` count. Also naturally dedupes the input. */
export function filterExistingProjectIds(db: Database.Database, ids: string[]): string[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id FROM projects WHERE id IN (${placeholders})`).all(...ids) as {
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
