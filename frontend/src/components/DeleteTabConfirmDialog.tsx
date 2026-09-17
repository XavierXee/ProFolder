import { useEffect } from "react";

type Props = {
  open: boolean;
  tabName: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function DeleteTabConfirmDialog({ open, tabName, onConfirm, onCancel }: Props) {
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
          aria-label="Delete tab confirmation"
          className={`pointer-events-auto w-full max-w-sm rounded-[var(--rt-radius-lg)] border shadow-2xl px-5 py-4 ${panel}`}
        >
          <p className="text-sm">
            Delete the tab &quot;{tabName}&quot;? This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className={outlineBtn}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-red-600 text-white hover:bg-red-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
