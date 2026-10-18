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
  sort_order: number;
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
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

/** Returns all custom tabs ordered by their persisted `sort_order` (user-reorderable via the
 * tab bar's drag-and-drop, see `reorder` below) — `id ASC` only breaks ties between tabs that
 * happen to share a `sort_order` (shouldn't normally occur, but keeps results deterministic). */
export function findAll(db: Database.Database): CustomTab[] {
  const rows = db.prepare(`SELECT * FROM custom_tabs ORDER BY sort_order ASC, id ASC`).all() as CustomTabRow[];
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
  const maxOrderRow = db.prepare(`SELECT MAX(sort_order) AS maxOrder FROM custom_tabs`).get() as {
    maxOrder: number | null;
  };
  const sortOrder = maxOrderRow.maxOrder === null ? 0 : maxOrderRow.maxOrder + 1;
  const result = db
    .prepare(
      `INSERT INTO custom_tabs (name, type, statuses, scores, tags, association, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.type,
      JSON.stringify(input.statuses),
      JSON.stringify(input.scores),
      JSON.stringify(input.tags),
      input.association ?? null,
      sortOrder,
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
    sortOrder,
    createdAt,
  };
}

/** Hard-deletes a custom tab by id. Returns whether a row was actually deleted. */
export function deleteById(db: Database.Database, id: number): boolean {
  const result = db.prepare(`DELETE FROM custom_tabs WHERE id = ?`).run(id);
  return result.changes > 0;
}

/**
 * Persists a reordering for the given ids (their position in `orderedIds` becomes their new
 * `sort_order`), for the tab bar's drag-and-drop reordering. Deliberately lenient rather than
 * requiring `orderedIds` to exactly match every existing tab: an id that no longer exists is
 * silently skipped (nothing to reorder — it was deleted out from under this request), and any
 * existing tab not mentioned in `orderedIds` at all just keeps its current `sort_order`
 * untouched rather than being treated as an error or dropped from the table. The tab bar always
 * sends every tab it currently knows about, so this only matters when that picture is briefly
 * stale relative to the database — e.g. a tab created or deleted concurrently in another window.
 * A strict exact-match requirement would otherwise make a reorder silently fail to save in that
 * situation instead of just applying what it safely can.
 */
export function reorder(db: Database.Database, orderedIds: number[]): CustomTab[] {
  const existingIds = new Set(
    (db.prepare(`SELECT id FROM custom_tabs`).all() as { id: number }[]).map((row) => row.id)
  );

  const update = db.prepare(`UPDATE custom_tabs SET sort_order = ? WHERE id = ?`);
  const applyAll = db.transaction((ids: number[]) => {
    ids.forEach((id, index) => {
      if (existingIds.has(id)) update.run(index, id);
    });
  });
  applyAll(orderedIds);

  return findAll(db);
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
