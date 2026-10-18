import { useEffect } from "react";
import { useConfirmationRequired } from "../hooks/useConfirmationRequired.js";
import { useTypedConfirmation } from "../hooks/useTypedConfirmation.js";
import ConfirmTextInput from "./ConfirmTextInput.js";

type Props = {
  open: boolean;
  tabName: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function DeleteTabConfirmDialog({ open, tabName, onConfirm, onCancel }: Props) {
  const required = useConfirmationRequired("confirmTabDeletion", open);
  const { value, setValue, satisfied, reset } = useTypedConfirmation(tabName, required);

  // This dialog stays mounted across multiple different tab-delete flows (App.tsx renders it
  // unconditionally), so the typed-confirmation reset must re-run on every open transition, not
  // just the first mount.
  useEffect(() => {
    if (!open) return;
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") {
        // Suppresses a focused button's own native "Enter activates click" default action
        // (e.g. this dialog never auto-focuses anything when `required` is false, so
        // whatever had focus before the dialog opened — like the tab bar's own delete "×"
        // button — could otherwise still be the focused element and double-fire alongside
        // this handler) — this handler is the single source of truth for what Enter does
        // here, regardless of focus.
        e.preventDefault();
        if (!(required && !satisfied)) onConfirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm, required, satisfied]);

  if (!open) return null;

  const panel = "bg-surface border-border text-ink";
  const outlineBtn =
    "px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover";

  return (
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
          aria-label="Delete tab confirmation"
          className={`pointer-events-auto w-full max-w-sm rounded-[var(--rt-radius-lg)] border shadow-2xl px-5 py-4 ${panel}`}
        >
          <p className="text-sm">
            Delete the tab &quot;{tabName}&quot;? This cannot be undone.
          </p>
          {required && (
            <div className="mt-3">
              <ConfirmTextInput expectedText={tabName} value={value} onChange={setValue} autoFocus />
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
    </>
  );
}
