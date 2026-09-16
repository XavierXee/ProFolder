import { useEffect, useRef } from "react";
import type { LibraryStats } from "../api/client.js";

type Props = {
  stats: LibraryStats | undefined;
  lastScanChanges: number | null;
  isDark: boolean;
  onClose: () => void;
};

export default function MetricsPanel({ stats, lastScanChanges, isDark, onClose }: Props) {
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

  const s = stats ?? { total: 0, draftCount: 0, unscoredCount: 0 };

  const tiles = [
    { label: "Total Files", value: s.total, highlight: null as string | null },
    { label: "Draft", value: s.draftCount, highlight: null },
    {
      label: "Unscored",
      value: s.unscoredCount,
      highlight: s.unscoredCount > 0 ? (isDark ? "text-purple-400" : "text-purple-700") : null,
    },
  ];

  const panelCls = isDark ? "bg-[#13161e] border-white/10 text-slate-200" : "bg-white border-black/10 text-slate-800";
  const meta = isDark ? "text-slate-600" : "text-slate-500";
  const divider = isDark ? "border-white/8" : "border-slate-200";

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
          className={`p-1 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? "text-slate-500 hover:text-slate-300 hover:bg-white/8" : "text-slate-400 hover:text-slate-700 hover:bg-black/5"}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px p-px">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col justify-center px-4 py-3">
            <span className={`text-xs font-mono uppercase tracking-wider mb-0.5 ${meta}`}>{t.label}</span>
            <span className={`text-xl font-semibold tabular-nums font-mono ${t.highlight ?? (isDark ? "text-slate-200" : "text-slate-800")}`}>
              {t.value}
            </span>
          </div>
        ))}
      </div>

      <div className={`px-4 py-3 border-t ${divider}`}>
        <span className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Last Scan</span>
        <p className={`text-sm font-mono mt-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
          {lastScanChanges === null ? "No scans yet" : lastScanChanges === 0 ? "No changes" : `+${lastScanChanges} changed`}
        </p>
      </div>
    </div>
  );
}
