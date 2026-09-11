import type Database from "better-sqlite3";
import type { CustomTab, CustomTabType } from "../../models/CustomTab.js";
import type { TrackStatus } from "../../models/AudioFile.js";

type CustomTabRow = {
  id: number;
  name: string;
  type: CustomTabType;
  statuses: string;
  scores: string;
  tags: string;
  created_at: string;
};

function rowToCustomTab(row: CustomTabRow): CustomTab {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    statuses: JSON.parse(row.statuses),
    scores: JSON.parse(row.scores),
    tags: JSON.parse(row.tags),
    createdAt: row.created_at,
  };
}

/** Returns all custom tabs in creation order (no reordering support). */
export function findAll(db: Database.Database): CustomTab[] {
  const rows = db.prepare(`SELECT * FROM custom_tabs ORDER BY id ASC`).all() as CustomTabRow[];
  return rows.map(rowToCustomTab);
}

export interface CreateCustomTabInput {
  name: string;
  type: CustomTabType;
  statuses: TrackStatus[];
  scores: (number | "unscored")[];
  tags: string[];
}

export function create(db: Database.Database, input: CreateCustomTabInput): CustomTab {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO custom_tabs (name, type, statuses, scores, tags, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.type,
      JSON.stringify(input.statuses),
      JSON.stringify(input.scores),
      JSON.stringify(input.tags),
      createdAt
    );

  return {
    id: Number(result.lastInsertRowid),
    name: input.name,
    type: input.type,
    statuses: input.statuses,
    scores: input.scores,
    tags: input.tags,
    createdAt,
  };
}

/** Hard-deletes a custom tab by id. Returns whether a row was actually deleted. */
export function deleteById(db: Database.Database, id: number): boolean {
  const result = db.prepare(`DELETE FROM custom_tabs WHERE id = ?`).run(id);
  return result.changes > 0;
}
