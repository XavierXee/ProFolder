import { useEffect, useRef } from "react";
import type { LibraryStats } from "../api/client.js";
import type { EntityStats } from "../types.js";
import { buildStatusOptions } from "../statusStyles.js";
import { useStatusCatalog } from "../contexts/StatusCatalogContext.js";

type Props = {
  stats: LibraryStats | undefined;
  lastScanChanges: number | null;
  onClose: () => void;
};

const EMPTY_ENTITY_STATS: EntityStats = {
  total: 0,
  byStatus: {},
};

export default function MetricsPanel({ stats, lastScanChanges, onClose }: Props) {
  const { statuses: catalogStatuses } = useStatusCatalog();
  const statusOptions = buildStatusOptions(catalogStatuses);
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

  const projects = stats?.projects ?? EMPTY_ENTITY_STATS;
  const files = stats?.files ?? EMPTY_ENTITY_STATS;

  // Popover-panel token pattern (same bg-surface/border-border/text-ink combination as
  // ThemeSelector.tsx's menuCls and MultiSelectDropdown.tsx's menuCls).
  const panelCls = "bg-surface border-border text-ink";
  const meta = "text-ink-muted";
  const divider = "border-border";

  function EntitySection({ title, entity }: { title: string; entity: EntityStats }) {
    return (
      <div className={`border-b ${divider}`}>
        <div className="px-4 pt-3 pb-1">
          <span className={`text-xs font-mono uppercase tracking-wider ${meta}`}>{title}</span>
        </div>
        <div className="grid grid-cols-2 gap-px p-px">
          <div className="flex flex-col justify-center px-4 py-3">
            <span className={`text-xs font-mono uppercase tracking-wider mb-0.5 ${meta}`}>Total</span>
            <span className="text-xl font-semibold tabular-nums font-mono text-ink">{entity.total}</span>
          </div>
          {statusOptions.map((opt) => (
            <div key={opt.value} className="flex flex-col justify-center px-4 py-3">
              <span className={`text-xs font-mono uppercase tracking-wider mb-0.5 ${meta}`}>{opt.label}</span>
              <span className="text-xl font-semibold tabular-nums font-mono text-ink">{entity.byStatus[opt.value] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Library metrics"
      className={`absolute right-0 top-full mt-2 w-72 rounded-[var(--rt-radius-lg)] border shadow-2xl z-50 ${panelCls}`}
    >
      <div className={`flex items-center justify-between px-4 py-3 border-b ${divider}`}>
        <span className="text-xs font-mono uppercase tracking-wider">Library Metrics</span>
        <button
          onClick={onClose}
          aria-label="Close metrics panel"
          className="p-1 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-ink-muted hover:text-ink hover:bg-surface-hover"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <EntitySection title="Projects" entity={projects} />
      <EntitySection title="Audio Files" entity={files} />

      <div className="px-4 py-3">
        <span className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Last Scan</span>
        <p className="text-sm font-mono mt-1 text-ink">
          {lastScanChanges === null ? "No scans yet" : lastScanChanges === 0 ? "No changes" : `+${lastScanChanges} changed`}
        </p>
      </div>
    </div>
  );
}
