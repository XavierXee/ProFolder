/**
 * Shared logic for keeping a filter-owning component's active filters in sync
 * with the global Statuses & Tags catalog.
 *
 * Every filter-owning component (App.tsx's default Files/Projects tabs, and
 * later CustomFilesTabPanel.tsx/CustomProjectsTabPanel.tsx) should call
 * `applyCatalogFilterEvent` whenever the global catalog changes (a status is
 * deleted, or a tag is deleted/renamed), so that a status or tag which is
 * currently an active filter doesn't get silently orphaned once it no longer
 * exists (or has a different name) in the catalog.
*/

export type CatalogFilterEvent =
  | { kind: "statusDeleted"; key: string }
  | { kind: "tagDeleted"; name: string }
  | { kind: "tagRenamed"; oldName: string; newName: string };

/**
 * Given a filter-owning component's current filter state and a catalog
 * change event, returns the updated partial filter state to merge in, or
 * `null` if the event doesn't affect the current filter state (in which case
 * the caller should skip updating filters entirely).
 */
export function applyCatalogFilterEvent(
  current: { statuses?: string[]; tags?: string[] },
  event: CatalogFilterEvent
): { statuses?: string[]; tags?: string[] } | null {
  switch (event.kind) {
    case "statusDeleted": {
      if (!current.statuses || !current.statuses.includes(event.key)) {
        return null;
      }
      return { statuses: current.statuses.filter((s) => s !== event.key) };
    }
    case "tagDeleted": {
      if (!current.tags || !current.tags.includes(event.name)) {
        return null;
      }
      return { tags: current.tags.filter((t) => t !== event.name) };
    }
    case "tagRenamed": {
      if (!current.tags || !current.tags.includes(event.oldName)) {
        return null;
      }
      return {
        tags: [...new Set(current.tags.map((t) => (t === event.oldName ? event.newName : t)))],
      };
    }
  }
}
