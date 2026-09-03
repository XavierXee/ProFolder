-- Generalizes project detection beyond Ableton to cover multiple DAWs.
ALTER TABLE projects RENAME COLUMN ableton_project_file TO marker_path;
ALTER TABLE projects ADD COLUMN daw_type TEXT;
ALTER TABLE projects ADD COLUMN detected_via TEXT;

ALTER TABLE scan_runs RENAME COLUMN ableton_projects_found TO daw_projects_found;
