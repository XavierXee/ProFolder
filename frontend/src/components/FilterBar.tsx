import { useEffect, useState } from "react";
import type { TrackStatus } from "../types.js";
import type { FileFilters } from "../api/client.js";
import {
  ALL_STATUSES,
  STATUS_LABELS,
  STATUS_PILL_DARK,
  STATUS_PILL_LIGHT,
  STATUS_PILL_UNSELECTED_DARK,
  STATUS_PILL_UNSELECTED_LIGHT,
} from "../statusStyles.js";

export const DEFAULT_FILTERS: FileFilters = { page: 1, pageSize: 50 };

type FilterPatch = Omit<FileFilters, "page" | "pageSize">;

const EXPORT_OPTIONS: { label: string; value: boolean | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Has Export", value: true },
  { label: "No Export", value: false },
];

export default function FilterBar({
  filters,
  onChange,
  isDark,
}: {
  filters: FileFilters;
  onChange: (patch: FilterPatch) => void;
  isDark: boolean;
}) {
  const [searchInput, setSearchInput] = useState(filters.search ?? "");

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== (filters.search ?? "")) {
        onChange({ search: searchInput || undefined });
      }
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const bg = isDark ? "bg-[#0d0f14]" : "bg-[#f4f6f9]";
  const borderOuter = isDark ? "border-white/8" : "border-black/8";
  const borderInner = isDark ? "border-white/5" : "border-black/5";
  const inputBg = isDark
    ? "bg-white/5 border-white/10 text-slate-300 placeholder-slate-600"
    : "bg-white border-slate-300 text-slate-800 placeholder-slate-400";
  const labelCls = isDark ? "text-slate-600" : "text-slate-500";
  const clearCls = isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-500 hover:text-slate-800";
  const unselectedStatus = isDark ? STATUS_PILL_UNSELECTED_DARK : STATUS_PILL_UNSELECTED_LIGHT;
  const statusColors = isDark ? STATUS_PILL_DARK : STATUS_PILL_LIGHT;

  const activeFilterCount =
    (filters.status ? 1 : 0) +
    (filters.hasExport !== undefined ? 1 : 0) +
    (filters.search ? 1 : 0) +
    (filters.sortBy ? 1 : 0);

  function clearAll() {
    setSearchInput("");
    onChange({ search: undefined, status: undefined, hasExport: undefined, sortBy: undefined, sortDir: undefined });
  }

  return (
    <div className={`border-b ${borderOuter} ${bg}`}>
      {/* Search + clear */}
      <div className={`flex flex-wrap items-center gap-3 px-6 py-3 border-b ${borderInner}`}>
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search files or paths…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={`w-full border rounded text-sm pl-8 pr-3 py-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:border-blue-500/50 transition-colors ${inputBg}`}
            aria-label="Search by filename or path"
          />
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            className={`text-xs font-mono flex items-center gap-1 transition-colors focus:outline-none focus-visible:underline ${clearCls}`}
            aria-label="Clear all filters"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Status pill row */}
      <div className={`flex flex-wrap items-center gap-2 px-6 py-2.5 border-b ${borderInner}`} role="group" aria-label="Filter by status">
        <span className={`text-xs font-mono uppercase tracking-wider mr-1 ${labelCls}`}>Status</span>
        {[{ label: "All", value: undefined as TrackStatus | undefined }, ...ALL_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s }))].map(
          (opt) => {
            const selected = filters.status === opt.value;
            return (
              <button
                key={opt.label}
                onClick={() => onChange({ status: opt.value })}
                aria-pressed={selected}
                className={`px-2.5 py-0.5 rounded text-xs font-mono font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  selected ? `ring-1 ${opt.value ? statusColors[opt.value] : (isDark ? "border-blue-500/40 text-blue-400 bg-blue-500/10 ring-blue-500/30" : "border-blue-400/60 text-blue-700 bg-blue-50 ring-blue-300")}` : unselectedStatus
                }`}
              >
                {opt.label}
              </button>
            );
          }
        )}
      </div>

      {/* Export pill row + sort */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-2.5" role="group" aria-label="Filter by export likelihood">
        <span className={`text-xs font-mono uppercase tracking-wider mr-1 ${labelCls}`}>Export</span>
        {EXPORT_OPTIONS.map((opt) => {
          const selected = filters.hasExport === opt.value;
          return (
            <button
              key={opt.label}
              onClick={() => onChange({ hasExport: opt.value })}
              aria-pressed={selected}
              className={`px-2.5 py-0.5 rounded text-xs font-mono font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                selected
                  ? isDark
                    ? "ring-1 border-blue-500/40 text-blue-400 bg-blue-500/10 ring-blue-500/30"
                    : "ring-1 border-blue-400/60 text-blue-700 bg-blue-50 ring-blue-300"
                  : unselectedStatus
              }`}
            >
              {opt.label}
            </button>
          );
        })}

        <button
          onClick={() =>
            onChange({
              sortBy: "modifiedAt",
              sortDir: filters.sortBy === "modifiedAt" && filters.sortDir === "asc" ? "desc" : "asc",
            })
          }
          aria-pressed={filters.sortBy === "modifiedAt"}
          className={`ml-2 px-2.5 py-0.5 rounded text-xs font-mono font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            filters.sortBy === "modifiedAt"
              ? isDark
                ? "ring-1 border-blue-500/40 text-blue-400 bg-blue-500/10 ring-blue-500/30"
                : "ring-1 border-blue-400/60 text-blue-700 bg-blue-50 ring-blue-300"
              : unselectedStatus
          }`}
        >
          Sort: Modified{filters.sortBy === "modifiedAt" ? (filters.sortDir === "desc" ? " ↓" : " ↑") : ""}
        </button>
      </div>
    </div>
  );
}
