import type Database from "better-sqlite3";
import type { ScanStats } from "../../scanner/types.js";

type ScanRunRow = {
  id: number;
  root_path: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  folders_scanned: number;
  audio_files_found: number;
  daw_projects_found: number;
  new_files: number;
  modified_files: number;
  removed_files: number;
  errors: string;
};

function rowToScanStats(row: ScanRunRow): ScanStats {
  return {
    rootPath: row.root_path,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? "",
    durationMs: row.duration_ms ?? 0,
    foldersScanned: row.folders_scanned,
    audioFilesFound: row.audio_files_found,
    dawProjectsFound: row.daw_projects_found,
    newFiles: row.new_files,
    modifiedFiles: row.modified_files,
    removedFiles: row.removed_files,
    errors: JSON.parse(row.errors),
  };
}

export function insertScanRun(db: Database.Database, stats: ScanStats): number {
  const result = db
    .prepare(
      `INSERT INTO scan_runs (
        root_path, started_at, finished_at, duration_ms, folders_scanned, audio_files_found,
        daw_projects_found,
        new_files, modified_files, removed_files, errors
      ) VALUES (
        @rootPath, @startedAt, @finishedAt, @durationMs, @foldersScanned, @audioFilesFound,
        @dawProjectsFound,
        @newFiles, @modifiedFiles, @removedFiles, @errors
      )`
    )
    .run({ ...stats, errors: JSON.stringify(stats.errors) });
  return Number(result.lastInsertRowid);
}

export function getLastScanRun(db: Database.Database): ScanStats | undefined {
  const row = db
    .prepare(`SELECT * FROM scan_runs ORDER BY id DESC LIMIT 1`)
    .get() as ScanRunRow | undefined;
  return row ? rowToScanStats(row) : undefined;
}
