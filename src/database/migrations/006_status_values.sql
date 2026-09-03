-- The "finished" status was split into "needs_mixing", "done", and "released";
-- existing rows can't know which one they meant, so they're normalized to "done"
-- (the closest existing equivalent) rather than left as an now-invalid value.
UPDATE projects SET status = 'done' WHERE status = 'finished';
UPDATE audio_files SET status = 'done' WHERE status = 'finished';
