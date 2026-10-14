-- Adds an optional "association" baseline filter to custom tabs (Files-type tabs only),
-- parallel to the existing statuses/scores/tags locked-filter columns, so a custom tab can
-- be pinned to only associated, only unassociated, or every audio file. Stored as a plain
-- nullable TEXT ("associated" | "unassociated" | NULL) rather than JSON like
-- statuses/scores/tags, since it's a single value, not a set.
ALTER TABLE custom_tabs ADD COLUMN association TEXT;
