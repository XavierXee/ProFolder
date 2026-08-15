import type Database from "better-sqlite3";

/** Relative paths (from the configured music root) that the scanner should not descend into. */
export function getExcludedPaths(db: Database.Database): string[] {
  const rows = db.prepare(`SELECT path FROM scan_exclusions`).all() as { path: string }[];
  return rows.map((r) => r.path);
}

/** Replaces the full set of excluded paths in one transaction. */
export function setExcludedPaths(db: Database.Database, paths: string[]): void {
  const unique = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM scan_exclusions`).run();
    const insert = db.prepare(`INSERT INTO scan_exclusions (path) VALUES (?)`);
    for (const p of unique) insert.run(p);
  });
  tx();
}
