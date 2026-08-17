import type Database from "better-sqlite3";
import type { Project } from "../../models/Project.js";
import type { TrackStatus } from "../../models/AudioFile.js";
import type { DawType } from "../../scanner/dawDetector.js";
import type { PagedResult } from "./audioFileRepository.js";

export type ProjectFilters = {
  search?: string;
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
  first_seen_at: string;
  last_seen_at: string;
  is_removed: number;
};

function rowToProject(row: ProjectRow): Project {
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
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    isRemoved: row.is_removed === 1,
  };
}

export function loadActiveProjectIds(db: Database.Database): Set<string> {
  const rows = db.prepare(`SELECT id FROM projects WHERE is_removed = 0`).all() as {
    id: string;
  }[];
  return new Set(rows.map((r) => r.id));
}

export function upsertProject(
  db: Database.Database,
  project: Omit<Project, "status" | "isRemoved">
): void {
  db.prepare(
    `INSERT INTO projects (id, name, path, marker_path, daw_type, detected_via, has_video, has_image, status, first_seen_at, last_seen_at, is_removed)
     VALUES (@id, @name, @path, @markerPath, @dawType, @detectedVia, @hasVideo, @hasImage, 'unknown', @firstSeenAt, @lastSeenAt, 0)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       path = excluded.path,
       marker_path = excluded.marker_path,
       daw_type = excluded.daw_type,
       detected_via = excluded.detected_via,
       has_video = excluded.has_video,
       has_image = excluded.has_image,
       last_seen_at = excluded.last_seen_at,
       is_removed = 0`
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

  return { where: clauses.join(" AND "), params };
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

  const rows = db
    .prepare(`SELECT * FROM projects WHERE ${where} ORDER BY name LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as ProjectRow[];

  return { items: rows.map(rowToProject), total };
}

/** Unpaginated convenience wrapper — use sparingly (e.g. small internal lookups), not for the main project list. */
export function findAllActive(db: Database.Database): Project[] {
  return findAllActivePaged(db).items;
}

export function findById(db: Database.Database, id: string): Project | undefined {
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | ProjectRow
    | undefined;
  return row ? rowToProject(row) : undefined;
}

export function updateStatus(db: Database.Database, id: string, status: TrackStatus): void {
  db.prepare(`UPDATE projects SET status = ? WHERE id = ?`).run(status, id);
}
