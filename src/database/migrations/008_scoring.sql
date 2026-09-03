-- Replaces the heuristic export-confidence concept with a user-set 1-5 score.
ALTER TABLE audio_files DROP COLUMN is_export_candidate;
ALTER TABLE audio_files DROP COLUMN export_confidence;
ALTER TABLE audio_files ADD COLUMN score INTEGER;

ALTER TABLE projects ADD COLUMN score INTEGER;

ALTER TABLE scan_runs DROP COLUMN likely_exports;
ALTER TABLE scan_runs DROP COLUMN likely_samples;
ALTER TABLE scan_runs DROP COLUMN unknown_confidence;
