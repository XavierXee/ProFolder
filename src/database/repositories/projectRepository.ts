import type Database from "better-sqlite3";
import type { Project } from "../../models/Project.js";
import type { TrackStatus } from "../../models/AudioFile.js";

type ProjectRow = {
  id: string;
  name: string;
  path: string;
  ableton_project_file: string | null;
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
    abletonProjectFile: row.ableton_project_file ?? undefined,
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
    `INSERT INTO projects (id, name, path, ableton_project_file, status, first_seen_at, last_seen_at, is_removed)
     VALUES (@id, @name, @path, @abletonProjectFile, 'unknown', @firstSeenAt, @lastSeenAt, 0)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       path = excluded.path,
       ableton_project_file = excluded.ableton_project_file,
       last_seen_at = excluded.last_seen_at,
       is_removed = 0`
  ).run({
    ...project,
    abletonProjectFile: project.abletonProjectFile ?? null,
  });
}

export function markRemoved(db: Database.Database, ids: string[], lastSeenAt: string): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE projects SET is_removed = 1, last_seen_at = ? WHERE id IN (${placeholders})`
  ).run(lastSeenAt, ...ids);
}

export function findAllActive(db: Database.Database): Project[] {
  const rows = db
    .prepare(`SELECT * FROM projects WHERE is_removed = 0 ORDER BY name`)
    .all() as ProjectRow[];
  return rows.map(rowToProject);
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
