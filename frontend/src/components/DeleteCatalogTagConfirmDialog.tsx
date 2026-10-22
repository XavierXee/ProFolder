import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useConfirmationRequired } from "../hooks/useConfirmationRequired.js";
import { useTypedConfirmation } from "../hooks/useTypedConfirmation.js";
import ConfirmTextInput from "./ConfirmTextInput.js";

type Props = {
  open: boolean;
  tagName: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirms deleting a tag from the global catalog (TagsStatusesPanel) — a destructive action
 * that removes the tag from every file/project that has it. Removing a single tag from one
 * file/project's own tag list (TagEditor.tsx) is a lightweight, easily-reversible edit and has
 * no confirmation dialog of its own.
 */
export default function DeleteCatalogTagConfirmDialog({ open, tagName, onConfirm, onCancel }: Props) {
  const required = useConfirmationRequired("confirmTagDeletion", open);
  const { value, setValue, satisfied, reset } = useTypedConfirmation(tagName, required);

  // This dialog stays mounted for as long as TagsStatusesPanel is open (the panel renders it
  // unconditionally, toggling `open` via `deletingTag`), so the typed-confirmation reset must
  // re-run on every open transition, not just the first mount.
  useEffect(() => {
    if (!open) return;
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // See DeleteStatusConfirmDialog.tsx's identical comment: this dialog is always nested inside
  // TagsStatusesPanel, which owns its own bubble-phase window Escape listener, so this listener
  // must run in the capture phase and call stopImmediatePropagation() to avoid also closing the
  // whole panel (window-level Escape listeners of nested overlays otherwise both fire).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onCancel();
      }
      if (e.key === "Enter") {
        // Suppresses a focused button's own native "Enter activates click" default action —
        // this handler is the single source of truth for what Enter does here, regardless of
        // focus. See DeleteTabConfirmDialog.tsx's identical comment.
        e.preventDefault();
        if (!(required && !satisfied)) onConfirm();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel, onConfirm, required, satisfied]);

  if (!open) return null;

  const panel = "bg-surface border-border text-ink";
  const outlineBtn =
    "px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover";

  // Portaled to document.body: see DeleteStatusConfirmDialog.tsx's identical comment — this
  // dialog is always nested inside TagsStatusesPanel, which lives inside the header
  // (`backdrop-blur-sm`). A `backdrop-filter` on an ancestor creates a new containing block for
  // `position: fixed` descendants, so without the portal this overlay centers within the header's
  // own short box instead of the real viewport, appearing pinned near the top with content cropped.
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-scrim"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete tag confirmation"
          className={`pointer-events-auto w-full max-w-sm rounded-[var(--rt-radius-lg)] border shadow-2xl px-5 py-4 ${panel}`}
        >
          <p className="text-sm">
            Remove the tag &quot;{tagName}&quot;? This cannot be undone.
          </p>
          {required && (
            <div className="mt-3">
              <ConfirmTextInput expectedText={tagName} value={value} onChange={setValue} autoFocus />
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className={outlineBtn}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={required && !satisfied}
              className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-red-600 text-white hover:bg-red-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
