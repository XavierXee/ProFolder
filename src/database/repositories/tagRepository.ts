import type Database from "better-sqlite3";
import { pruneTagFromAllTabs, renameTagInAllTabs } from "./customTabRepository.js";

/** Thrown when a create/rename would collide with an existing tag name (case-insensitive,
 * matching the `tags.name UNIQUE COLLATE NOCASE` constraint) — the route layer catches this
 * to return 409. */
export class DuplicateTagError extends Error {}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE";
}

export function findOrCreateTag(db: Database.Database, name: string): number {
  db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(name);
  const row = db.prepare(`SELECT id FROM tags WHERE name = ? COLLATE NOCASE`).get(name) as {
    id: number;
  };
  return row.id;
}

export function listAllTagNames(db: Database.Database): string[] {
  const rows = db.prepare(`SELECT name FROM tags ORDER BY name`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

/** Creates a new catalog tag. Throws `DuplicateTagError` if `name` collides (case-insensitive)
 * with an existing tag. */
export function createTag(db: Database.Database, name: string): { id: number; name: string } {
  try {
    const result = db.prepare(`INSERT INTO tags (name) VALUES (?)`).run(name);
    return { id: Number(result.lastInsertRowid), name };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new DuplicateTagError(`A tag named "${name}" already exists`);
    }
    throw err;
  }
}

/** Renames a catalog tag (case-insensitive match on `oldName`). Throws `DuplicateTagError` if
 * `newName` collides with a different existing tag. Relies on the existing `ON DELETE CASCADE`
 * from `audio_file_tags`/`project_tags` for nothing here — a rename is an UPDATE, not a
 * delete/recreate, so file/project associations are preserved automatically. */
export function renameTag(db: Database.Database, oldName: string, newName: string): void {
  const rename = db.transaction((old: string, next: string) => {
    try {
      db.prepare(`UPDATE tags SET name = ? WHERE name = ? COLLATE NOCASE`).run(next, old);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new DuplicateTagError(`A tag named "${next}" already exists`);
      }
      throw err;
    }
    renameTagInAllTabs(db, old, next);
  });
  rename(oldName, newName);
}

export function tagExists(db: Database.Database, name: string): boolean {
  const row = db.prepare(`SELECT 1 FROM tags WHERE name = ? COLLATE NOCASE`).get(name);
  return row !== undefined;
}

/** Deletes a catalog tag by name (case-insensitive). Relies on the existing `ON DELETE CASCADE`
 * from `audio_file_tags`/`project_tags` (see migration 001) to clean up every file/project's
 * reference to it — no manual junction-table cleanup needed. */
export function deleteTagByName(db: Database.Database, name: string): void {
  const deleteAndPrune = db.transaction((n: string) => {
    db.prepare(`DELETE FROM tags WHERE name = ? COLLATE NOCASE`).run(n);
    pruneTagFromAllTabs(db, n);
  });
  deleteAndPrune(name);
}
