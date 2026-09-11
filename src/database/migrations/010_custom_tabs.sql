-- Custom tabs: user-named, locked-filter views over Files or Projects.
-- statuses/scores/tags are JSON-serialized arrays (matching the shapes FileFilters/
-- ProjectFilters already use on the frontend: TrackStatus[], (number | "unscored")[],
-- string[]) — a deliberate first JSON-TEXT-column precedent in this schema, since a
-- saved filter set is frozen query criteria, not a real many-to-many relationship
-- like tags/project_tags. Hard-delete only: a deleted tab has nothing worth
-- preserving, unlike Projects/AudioFiles which preserve status/tags/score across
-- re-scans.
CREATE TABLE IF NOT EXISTS custom_tabs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('files', 'projects')),
  statuses TEXT NOT NULL DEFAULT '[]',
  scores TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
