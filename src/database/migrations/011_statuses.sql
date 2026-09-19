-- Editable status catalog: lets users rename/recolor/add/delete statuses instead of the
-- previously hardcoded TrackStatus union. Deliberately has NO foreign key from
-- audio_files.status/projects.status/custom_tabs to this table: "unknown" must remain a
-- valid value in those columns while never being a real row here (it's a hardcoded
-- sentinel, never editable/deletable) — an FK would make writing "unknown" a constraint
-- violation. Validity of a status key is enforced in application code instead
-- (see statusRepository.isKnownStatusKey).
--
-- Seed colors are a best-effort hex approximation of the previous hardcoded
-- --rt-status-{key}-badge-ink oklch values from the dark theme in index.css, so the
-- initial catalog looks close to the prior fixed palette rather than arbitrary.
CREATE TABLE IF NOT EXISTS statuses (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO statuses (key, name, color, sort_order, created_at) VALUES
  ('draft', 'Draft', '#ffb900', 0, '2026-01-01T00:00:00.000Z'),
  ('needs_mixing', 'Need Mixing', '#ff8904', 1, '2026-01-01T00:00:00.000Z'),
  ('done', 'Done', '#00d492', 2, '2026-01-01T00:00:00.000Z'),
  ('released', 'Released', '#7c86ff', 3, '2026-01-01T00:00:00.000Z');
