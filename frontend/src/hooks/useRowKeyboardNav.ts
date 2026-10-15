import { useEffect } from "react";

function isTextEntry(target: HTMLElement | null): boolean {
  const tag = target?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || !!target?.isContentEditable;
}

/** Whether to defer to a focused button's own native Space/Enter activation instead of firing
 * the row action. Scoped to buttons INSIDE an open `role="dialog"` region (the detail panel, or
 * any other modal-ish panel in the app — Settings, Batch Edit, etc.) rather than any button
 * anywhere: a real keydown event's target is whatever currently has DOM focus, and after ANY
 * ordinary button click elsewhere (switching tabs, opening a picker, clicking a sort header —
 * none of which blur on their own), that button keeps focus indefinitely until something else
 * takes it. Treating every such stray-focused button as "protect its native activation" meant
 * Space silently did nothing for the very first highlighted row after, say, clicking the "Audio
 * Files" tab button to get there — it only started working once the detail panel had been
 * opened and closed at least once, because closing it removes the auto-focused close button
 * from the DOM, which resets focus back to `document.body`. Every detail-panel-dialog's own
 * content (Status pills, Copy/Move/Delete, the close button) only exists in the DOM while that
 * dialog is actually showing a file/project, so "button is inside a role=dialog" already implies
 * that dialog is open — no separate open/closed check needed here. */
function isProtectedButton(target: HTMLElement | null): boolean {
  return target?.tagName === "BUTTON" && !!target.closest('[role="dialog"]');
}

/** The detail panel's own close button (see FileDetailPanel.tsx/ProjectDetailPanel.tsx) is
 * auto-focused 50ms after the panel opens — by the time a user presses Space expecting
 * play/pause, focus has almost always already landed there (50ms is well under human reaction
 * time), so it needs a narrow carve-out from `isProtectedButton` above. Recognized by its
 * existing aria-label rather than new markup; Enter does NOT get this exception (closing the
 * panel on Enter is the expected, unsurprising result of that button already having focus). */
function isDetailPanelCloseButton(target: HTMLElement | null): boolean {
  return target?.tagName === "BUTTON" && target.getAttribute("aria-label") === "Close panel";
}

/**
 * Keyboard-driven row interaction for a Files/Projects table and its detail panel, independent
 * of whether that panel is currently open:
 * - ArrowUp/ArrowDown moves the highlighted row (`onSelect`) — if nothing is highlighted yet,
 *   ArrowDown starts at the first row and ArrowUp at the last, so keyboard-only browsing works
 *   from a completely fresh tab with no prior click. Clamped at the first/last row otherwise (no
 *   wraparound, no auto-pagination across a page boundary), and also scrolls the newly-highlighted
 *   row into view if it isn't already (see the second effect below).
 * - Enter calls `onEnter` (if provided) with the highlighted row's id — callers use this to open
 *   the detail panel without otherwise changing the highlight.
 * - Space calls `onSpace` if provided, else falls back to `onEnter` — Files tabs pass a distinct
 *   `onSpace` that toggles playback instead of opening the panel; Projects tabs omit `onSpace`
 *   entirely (no playback concept), so Space there just opens the panel like Enter does.
 * - Arrow/Enter/Space are all no-ops when `active` is false (the caller isn't the
 *   currently-visible tab/panel — each table-owning context calls this hook unconditionally per
 *   the rules of hooks, gating via this flag instead of a conditional hook call) or while focus
 *   is in a text input/textarea/contenteditable element (e.g. the Notes field, the tag
 *   autocomplete input, search), so typing — including literal spaces and newlines — behaves
 *   normally there. Enter/Space are ADDITIONALLY no-ops while focus is on a button INSIDE an open
 *   dialog (a focused Status pill, Copy/Move/Delete button, etc. keeps its own native Space/Enter
 *   activation instead of being hijacked) — except Space still fires for the detail panel's own
 *   auto-focused close button specifically, see `isDetailPanelCloseButton`. A button OUTSIDE any
 *   dialog (a tab switcher, sort header, filter picker, pagination button — anything merely left
 *   holding stale focus from an earlier click) does NOT exclude Enter/Space, see
 *   `isProtectedButton`'s own doc comment for why that distinction matters. Arrow keys do NOT
 *   exclude buttons at all — unlike Space/Enter, plain ArrowUp/Down has no native
 *   meaning on a `<button>`, so there's nothing to protect there.
 *
 * The listener is global (`window`, not the table/panel's own DOM node), since the detail panel
 * itself grabs focus elsewhere in the DOM tree (not a descendant of the table).
 */
export function useRowKeyboardNav<T extends { id: string }>({
  active,
  items,
  selectedId,
  onSelect,
  onEnter,
  onSpace,
}: {
  active: boolean;
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEnter?: (id: string) => void;
  onSpace?: (id: string) => void;
}): void {
  useEffect(() => {
    if (!active) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        if (isTextEntry(target)) return;
        if (items.length === 0) return;

        if (!selectedId) {
          e.preventDefault();
          onSelect(e.key === "ArrowDown" ? items[0]!.id : items[items.length - 1]!.id);
          return;
        }

        const index = items.findIndex((item) => item.id === selectedId);
        if (index === -1) return;

        const nextIndex = e.key === "ArrowDown" ? index + 1 : index - 1;
        if (nextIndex < 0 || nextIndex >= items.length) return;

        e.preventDefault();
        onSelect(items[nextIndex]!.id);
        return;
      }

      if (e.key === "Enter") {
        if (!selectedId || !onEnter) return;
        if (isTextEntry(target) || isProtectedButton(target)) return;
        e.preventDefault();
        onEnter(selectedId);
        return;
      }

      if (e.key === " ") {
        if (!selectedId) return;
        if (isTextEntry(target)) return;
        if (isProtectedButton(target) && !isDetailPanelCloseButton(target)) return;
        e.preventDefault();
        (onSpace ?? onEnter)?.(selectedId);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, items, selectedId, onSelect, onEnter, onSpace]);

  useEffect(() => {
    if (!active || !selectedId) return;
    document.querySelector('tr[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, selectedId]);
}
