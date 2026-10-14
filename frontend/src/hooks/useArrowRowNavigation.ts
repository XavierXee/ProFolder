import { useEffect } from "react";

/**
 * Moves the currently-selected row to the previous/next item in `items` on a plain
 * ArrowUp/ArrowDown keypress (no modifier keys), so a detail panel stays navigable with the
 * keyboard without needing to click back out to the table first — the listener is global
 * (`window`, not the table/panel's own DOM node), since the detail panel itself grabs focus
 * (its close button auto-focuses 50ms after opening) and isn't a descendant of the table.
 *
 * Deliberately a no-op whenever:
 * - `active` is false (the caller isn't the currently-visible tab/panel — each table-owning
 *   context calls this unconditionally per the rules of hooks, gating via this flag instead of
 *   a conditional hook call, so only the actually-visible list's listener ever does anything).
 * - focus is in a text input/textarea/contenteditable element, so arrow keys keep their normal
 *   cursor-movement/suggestion-navigation meaning there (e.g. the Notes textarea, the tag
 *   autocomplete input) instead of being hijacked for row navigation.
 * - nothing is currently selected (no detail panel open) — this only moves an existing
 *   selection, it doesn't start one from nothing.
 * - the new index would fall outside `items` (clamped at the first/last row, no wraparound,
 *   no auto-pagination across a page boundary).
 *
 * Also scrolls the newly-selected row into view (`scrollIntoView({ block: "nearest" })`) if it
 * isn't already fully visible within its scrolling ancestor, so arrowing past the bottom/top of
 * the currently-rendered page keeps the detail panel's target on screen. This runs off a plain
 * `selectedId` effect rather than inline in the keydown handler above, since the new row's
 * `aria-selected="true"` only lands in the DOM after React re-renders — not synchronously when
 * `onSelect` is called. It fires for ANY selection change while `active`, not just arrow-key
 * ones (a row click already scrolled it into view by definition, so that's a harmless no-op
 * there), and queries `document` rather than a scoped container ref: exactly one table is ever
 * mounted with a given `active: true` at a time (see the App.tsx/Custom*TabPanel.tsx callers),
 * so at most one `tr[aria-selected="true"]` can ever exist in the document simultaneously.
 */
export function useArrowRowNavigation<T extends { id: string }>({
  active,
  items,
  selectedId,
  onSelect,
}: {
  active: boolean;
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): void {
  useEffect(() => {
    if (!active) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (!selectedId) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      const index = items.findIndex((item) => item.id === selectedId);
      if (index === -1) return;

      const nextIndex = e.key === "ArrowDown" ? index + 1 : index - 1;
      if (nextIndex < 0 || nextIndex >= items.length) return;

      e.preventDefault();
      onSelect(items[nextIndex]!.id);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, items, selectedId, onSelect]);

  useEffect(() => {
    if (!active || !selectedId) return;
    document.querySelector('tr[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, selectedId]);
}
