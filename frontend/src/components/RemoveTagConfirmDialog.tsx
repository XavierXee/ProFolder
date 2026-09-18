import { useEffect } from "react";
import { useConfirmationRequired } from "../hooks/useConfirmationRequired.js";
import { useTypedConfirmation } from "../hooks/useTypedConfirmation.js";
import ConfirmTextInput from "./ConfirmTextInput.js";

type Props = {
  open: boolean;
  tagName: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function RemoveTagConfirmDialog({ open, tagName, onConfirm, onCancel }: Props) {
  const required = useConfirmationRequired("confirmTagRemoval", open);
  const { value, setValue, satisfied, reset } = useTypedConfirmation(tagName, required);

  // This dialog stays mounted for as long as its owning TagEditor is mounted (TagEditor renders
  // it unconditionally, toggling `open` via `pendingRemoval`), so the typed-confirmation reset
  // must re-run on every open transition, not just the first mount.
  useEffect(() => {
    if (!open) return;
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

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
          aria-label="Remove tag confirmation"
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
              Remove
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
