-- Free-text notes for audio files and projects, editable from their detail panels.
-- NOT NULL DEFAULT '' (not a nullable column like e.g. custom_tabs.association) so the
-- frontend textarea can always bind directly to a plain string with no null-handling.
ALTER TABLE audio_files ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN notes TEXT NOT NULL DEFAULT '';
