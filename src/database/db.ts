import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function openDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

/**
 * Tracks which migration files have already run. Early migrations are all
 * `CREATE TABLE IF NOT EXISTS` and safe to re-run, but later ones use
 * `ALTER TABLE ... RENAME/ADD COLUMN`, which fails if re-applied — so every
 * migration is only ever executed once, recorded here.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`
  );

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const appliedRows = db.prepare(`SELECT filename FROM schema_migrations`).all() as {
    filename: string;
  }[];
  const applied = new Set(appliedRows.map((r) => r.filename));
  const markApplied = db.prepare(
    `INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)`
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    db.exec(sql);
    markApplied.run(file, new Date().toISOString());
  }
}
