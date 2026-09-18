import { useEffect, useRef } from "react";
import StatusBadge from "./StatusBadge.js";
import { ALL_STATUSES } from "../statusStyles.js";

type Props = {
  allTags: string[];
  onClose: () => void;
};

export default function TagsStatusesPanel({ allTags, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Same popover-panel token pattern as MetricsPanel.tsx/ThemeSelector.tsx/MultiSelectDropdown.tsx.
  const panelCls = "bg-surface border-border text-ink";
  const meta = "text-ink-muted";
  const divider = "border-border";
  // Byte-faithful reuse of TagEditor.tsx's read-only chip styling.
  const chipCls = "bg-chip-surface text-ink-secondary";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Statuses and tags"
      className={`absolute right-0 top-full mt-2 w-72 rounded-[var(--rt-radius-lg)] border shadow-2xl z-50 ${panelCls}`}
    >
      <div className={`flex items-center justify-between px-4 py-3 border-b ${divider}`}>
        <span className="text-xs font-mono uppercase tracking-wider">Statuses &amp; Tags</span>
        <button
          onClick={onClose}
          aria-label="Close statuses and tags panel"
          className="p-1 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-ink-muted hover:text-ink hover:bg-surface-hover"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className={`px-4 py-3 border-b ${divider}`}>
        <span className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Statuses</span>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {ALL_STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        <span className={`text-xs font-mono uppercase tracking-wider ${meta}`}>
          Tags {allTags.length > 0 && `(${allTags.length})`}
        </span>
        {allTags.length === 0 ? (
          <p className={`text-sm mt-2 ${meta}`}>No tags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-2 max-h-64 overflow-y-auto">
            {allTags.map((tag) => (
              <span key={tag} className={`inline-flex items-center px-2 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono ${chipCls}`}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
