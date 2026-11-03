-- Playback length of each audio file in seconds, read from the file's headers during a scan.
-- Nullable: NULL means not read yet (rows from before this column existed, filled in by the
-- next scan) or unreadable (a damaged or unsupported file).
ALTER TABLE audio_files ADD COLUMN duration_seconds REAL;
