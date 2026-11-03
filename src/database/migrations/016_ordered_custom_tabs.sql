-- "Ordered" Audio Files custom tabs: the user numbers the tab's files and reorders them by drag
-- and drop (e.g. an album's track list). Only meaningful for type = 'files'.
ALTER TABLE custom_tabs ADD COLUMN ordered INTEGER NOT NULL DEFAULT 0;

-- Each ordered tab's saved file positions (lowest first). A file in the tab with no row here
-- (it joined the tab after the last reorder) is listed after every positioned file.
-- ON UPDATE CASCADE keeps a position attached to its file when a move/rename re-keys
-- audio_files.id; ON DELETE CASCADE drops it with its tab or file.
CREATE TABLE IF NOT EXISTS custom_tab_file_positions (
  tab_id INTEGER NOT NULL REFERENCES custom_tabs(id) ON DELETE CASCADE,
  audio_file_id TEXT NOT NULL REFERENCES audio_files(id) ON UPDATE CASCADE ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (tab_id, audio_file_id)
);
