-- Adds persisted ordering to custom tabs so the tab bar supports drag-and-drop reordering
-- instead of always rendering in creation (id) order.
ALTER TABLE custom_tabs ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows so sort_order matches today's creation-order rendering exactly —
-- an upgrade must not silently reshuffle a user's existing tab order.
UPDATE custom_tabs SET sort_order = id;
