CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  ableton_project_file TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  is_removed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audio_files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  relative_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  extension TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT,
  modified_at TEXT NOT NULL,
  containing_folder TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'unknown',
  is_export_candidate INTEGER NOT NULL DEFAULT 0,
  export_confidence REAL NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  is_removed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_audio_files_project_id ON audio_files(project_id);
CREATE INDEX IF NOT EXISTS idx_audio_files_status ON audio_files(status);
CREATE INDEX IF NOT EXISTS idx_audio_files_is_removed ON audio_files(is_removed);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS audio_file_tags (
  audio_file_id TEXT NOT NULL REFERENCES audio_files(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (audio_file_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_audio_file_tags_tag_id ON audio_file_tags(tag_id);

CREATE TABLE IF NOT EXISTS scan_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root_path TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  folders_scanned INTEGER DEFAULT 0,
  audio_files_found INTEGER DEFAULT 0,
  ableton_projects_found INTEGER DEFAULT 0,
  likely_exports INTEGER DEFAULT 0,
  likely_samples INTEGER DEFAULT 0,
  unknown_confidence INTEGER DEFAULT 0,
  new_files INTEGER DEFAULT 0,
  modified_files INTEGER DEFAULT 0,
  removed_files INTEGER DEFAULT 0,
  errors TEXT NOT NULL DEFAULT '[]'
);
