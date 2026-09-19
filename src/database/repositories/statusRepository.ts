import type Database from "better-sqlite3";
import type { StatusDef } from "../../models/Status.js";
import { UNKNOWN_STATUS_KEY } from "../../models/AudioFile.js";

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

type StatusRow = {
  key: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
};

function rowToStatus(row: StatusRow): StatusDef {
  return {
    key: row.key,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function validateColor(color: string): void {
  if (!COLOR_PATTERN.test(color)) {
    throw new Error(`color must be a 6-digit hex value like #a1b2c3 (got "${color}")`);
  }
}

/** lowercase, non-alphanumeric runs collapsed to a single "_", leading/trailing "_" trimmed. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function findAll(db: Database.Database): StatusDef[] {
  const rows = db.prepare(`SELECT * FROM statuses ORDER BY sort_order`).all() as StatusRow[];
  return rows.map(rowToStatus);
}

export function isKnownStatusKey(db: Database.Database, key: string): boolean {
  if (key === UNKNOWN_STATUS_KEY) return true;
  const row = db.prepare(`SELECT 1 FROM statuses WHERE key = ?`).get(key);
  return row !== undefined;
}

export function create(db: Database.Database, name: string, color: string): StatusDef {
  validateColor(color);

  const existingKeys = new Set(
    (db.prepare(`SELECT key FROM statuses`).all() as { key: string }[]).map((r) => r.key)
  );
  existingKeys.add(UNKNOWN_STATUS_KEY);

  const base = slugify(name) || "status";
  let key = base;
  let suffix = 2;
  while (existingKeys.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }

  const maxOrderRow = db
    .prepare(`SELECT MAX(sort_order) AS maxOrder FROM statuses`)
    .get() as { maxOrder: number | null };
  const sortOrder = maxOrderRow.maxOrder === null ? 0 : maxOrderRow.maxOrder + 1;

  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO statuses (key, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(key, name, color, sortOrder, createdAt);

  return { key, name, color, sortOrder, createdAt };
}

export function update(
  db: Database.Database,
  key: string,
  patch: { name?: string; color?: string }
): StatusDef {
  if (key === UNKNOWN_STATUS_KEY) {
    throw new Error(`The "${UNKNOWN_STATUS_KEY}" status is a built-in sentinel and cannot be edited`);
  }
  const existing = db.prepare(`SELECT * FROM statuses WHERE key = ?`).get(key) as
    | StatusRow
    | undefined;
  if (!existing) {
    throw new Error(`No status found with key "${key}"`);
  }
  if (patch.color !== undefined) {
    validateColor(patch.color);
  }

  const name = patch.name ?? existing.name;
  const color = patch.color ?? existing.color;
  db.prepare(`UPDATE statuses SET name = ?, color = ? WHERE key = ?`).run(name, color, key);

  return { key, name, color, sortOrder: existing.sort_order, createdAt: existing.created_at };
}

export function deleteByKey(db: Database.Database, key: string): void {
  if (key === UNKNOWN_STATUS_KEY) {
    throw new Error(`The "${UNKNOWN_STATUS_KEY}" status is a built-in sentinel and cannot be deleted`);
  }
  const existing = db.prepare(`SELECT 1 FROM statuses WHERE key = ?`).get(key);
  if (!existing) {
    throw new Error(`No status found with key "${key}"`);
  }

  const reassignAndDelete = db.transaction((k: string) => {
    db.prepare(`UPDATE audio_files SET status = ? WHERE status = ?`).run(UNKNOWN_STATUS_KEY, k);
    db.prepare(`UPDATE projects SET status = ? WHERE status = ?`).run(UNKNOWN_STATUS_KEY, k);
    db.prepare(`DELETE FROM statuses WHERE key = ?`).run(k);
  });
  reassignAndDelete(key);
}
