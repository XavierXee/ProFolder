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
  association: string | null;
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
    association: (row.association as "associated" | "unassociated" | null) ?? undefined,
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
  association?: "associated" | "unassociated";
}

export function create(db: Database.Database, input: CreateCustomTabInput): CustomTab {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO custom_tabs (name, type, statuses, scores, tags, association, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.type,
      JSON.stringify(input.statuses),
      JSON.stringify(input.scores),
      JSON.stringify(input.tags),
      input.association ?? null,
      createdAt
    );

  return {
    id: Number(result.lastInsertRowid),
    name: input.name,
    type: input.type,
    statuses: input.statuses,
    scores: input.scores,
    tags: input.tags,
    association: input.association,
    createdAt,
  };
}

/** Hard-deletes a custom tab by id. Returns whether a row was actually deleted. */
export function deleteById(db: Database.Database, id: number): boolean {
  const result = db.prepare(`DELETE FROM custom_tabs WHERE id = ?`).run(id);
  return result.changes > 0;
}

/**
 * Removes `key` from every custom tab's `statuses` array (exact match — status keys
 * are lowercase catalog-generated slugs). Only writes rows whose array actually changed.
 *
 * Does NOT open its own transaction — callers must wrap this in their own
 * `db.transaction()` alongside the underlying status deletion.
 */
export function pruneStatusFromAllTabs(db: Database.Database, key: string): void {
  const rows = db.prepare(`SELECT id, statuses FROM custom_tabs`).all() as {
    id: number;
    statuses: string;
  }[];

  const update = db.prepare(`UPDATE custom_tabs SET statuses = ? WHERE id = ?`);

  for (const row of rows) {
    const statuses = JSON.parse(row.statuses) as string[];
    const filtered = statuses.filter((s) => s !== key);
    if (filtered.length !== statuses.length) {
      update.run(JSON.stringify(filtered), row.id);
    }
  }
}

/**
 * Removes `name` from every custom tab's `tags` array, matching case-insensitively
 * (tags are free-text and not normalized against the catalog at creation time).
 * Only writes rows whose array actually changed.
 *
 * Does NOT open its own transaction — callers must wrap this in their own
 * `db.transaction()` alongside the underlying tag deletion.
 */
export function pruneTagFromAllTabs(db: Database.Database, name: string): void {
  const target = name.toLowerCase();
  const rows = db.prepare(`SELECT id, tags FROM custom_tabs`).all() as {
    id: number;
    tags: string;
  }[];

  const update = db.prepare(`UPDATE custom_tabs SET tags = ? WHERE id = ?`);

  for (const row of rows) {
    const tags = JSON.parse(row.tags) as string[];
    const filtered = tags.filter((t) => t.toLowerCase() !== target);
    if (filtered.length !== tags.length) {
      update.run(JSON.stringify(filtered), row.id);
    }
  }
}

/**
 * Replaces `oldName` with `newName` in every custom tab's `tags` array, matching
 * case-insensitively. Only merges occurrences that collide with the rename target
 * itself (keeping `newName`'s casing for that one surviving entry) so a tab that
 * already independently holds both names doesn't end up with a visible duplicate.
 * Any other, unrelated case-insensitive duplicate already present in the array
 * (nothing to do with this rename) is left completely untouched.
 * Only writes rows whose array actually changed.
 *
 * Does NOT open its own transaction — callers must wrap this in their own
 * `db.transaction()` alongside the underlying tag rename.
 */
export function renameTagInAllTabs(db: Database.Database, oldName: string, newName: string): void {
  const target = oldName.toLowerCase();
  const rows = db.prepare(`SELECT id, tags FROM custom_tabs`).all() as {
    id: number;
    tags: string;
  }[];

  const update = db.prepare(`UPDATE custom_tabs SET tags = ? WHERE id = ?`);

  for (const row of rows) {
    const tags = JSON.parse(row.tags) as string[];
    if (!tags.some((t) => t.toLowerCase() === target)) continue;

    const replaced = tags.map((t) => (t.toLowerCase() === target ? newName : t));

    const newLower = newName.toLowerCase();
    let sawNewName = false;
    const deduped: string[] = [];
    for (const t of replaced) {
      if (t.toLowerCase() === newLower) {
        if (sawNewName) continue; // already emitted the merged rename-target entry
        sawNewName = true;
        deduped.push(newName); // newName's own casing wins for this one merged slot
      } else {
        deduped.push(t); // everything else passes through untouched, no cross-deduping
      }
    }

    update.run(JSON.stringify(deduped), row.id);
  }
}
