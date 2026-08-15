import type Database from "better-sqlite3";

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
