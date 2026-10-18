import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useConfirmationRequired } from "../hooks/useConfirmationRequired.js";
import { useTypedConfirmation } from "../hooks/useTypedConfirmation.js";
import ConfirmTextInput from "./ConfirmTextInput.js";

type Props = {
  open: boolean;
  statusName: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function DeleteStatusConfirmDialog({ open, statusName, onConfirm, onCancel }: Props) {
  const required = useConfirmationRequired("confirmStatusDeletion", open);
  const { value, setValue, satisfied, reset } = useTypedConfirmation(statusName, required);

  // This dialog stays mounted for as long as TagsStatusesPanel is open (the panel renders it
  // unconditionally, toggling `open` via `deletingStatus`), so the typed-confirmation reset
  // must re-run on every open transition, not just the first mount.
  useEffect(() => {
    if (!open) return;
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Unlike DeleteTabConfirmDialog (rendered where no ancestor also owns a window-level Escape
  // listener), this dialog is always nested inside
  // TagsStatusesPanel, which registers its own bubble-phase Escape listener to close the whole
  // popover. Per the project notes' documented nested-Escape hazard, a plain bubble-phase listener here
  // would fire alongside the panel's, closing the entire panel on top of cancelling this dialog.
  // Registering in the capture phase + stopImmediatePropagation() ensures this listener always
  // runs first and fully suppresses the panel's own bubble-phase listener, regardless of effect
  // mount order.
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

  // Portaled to document.body: this dialog is always rendered nested inside TagsStatusesPanel,
  // which lives inside the header (`backdrop-blur-sm`). A `backdrop-filter` on an ancestor creates
  // a new containing block for `position: fixed` descendants (same rule as `filter`/`transform`),
  // so without the portal this overlay centers within the header's own short box instead of the
  // real viewport — appearing pinned near the top of the screen with its lower content cropped.
  // Escaping to document.body sidesteps this regardless of where the dialog is logically rendered.
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
          aria-label="Delete status confirmation"
          className={`pointer-events-auto w-full max-w-sm rounded-[var(--rt-radius-lg)] border shadow-2xl px-5 py-4 ${panel}`}
        >
          <p className="text-sm">
            Remove the status &quot;{statusName}&quot;? This cannot be undone.
          </p>
          {required && (
            <div className="mt-3">
              <ConfirmTextInput expectedText={statusName} value={value} onChange={setValue} autoFocus />
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
