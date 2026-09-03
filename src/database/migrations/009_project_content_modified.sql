-- The actual "last worked on" signal for a project: the max of the project folder's
-- own mtime and its DAW marker file's mtime (e.g. the .als file, which updates on
-- every save) — distinct from last_seen_at, which is scan bookkeeping, not content.
ALTER TABLE projects ADD COLUMN content_modified_at TEXT;
