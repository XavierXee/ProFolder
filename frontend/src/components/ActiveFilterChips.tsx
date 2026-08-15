import type { FileFilters } from "../api/client.js";
import { STATUS_LABELS } from "../statusStyles.js";

type FilterPatch = Omit<FileFilters, "page" | "pageSize">;
type Chip = { label: string; onRemove: () => void };

export default function ActiveFilterChips({
  filters,
  onChange,
  isDark,
}: {
  filters: FileFilters;
  onChange: (patch: FilterPatch) => void;
  isDark: boolean;
}) {
  const chips: Chip[] = [];

  if (filters.status)
    chips.push({
      label: `Status: ${STATUS_LABELS[filters.status]}`,
      onRemove: () => onChange({ status: undefined }),
    });

  if (filters.hasExport !== undefined)
    chips.push({
      label: filters.hasExport ? "Has Export" : "No Export",
      onRemove: () => onChange({ hasExport: undefined }),
    });

  if (filters.search)
    chips.push({
      label: `Search: "${filters.search}"`,
      onRemove: () => onChange({ search: undefined }),
    });

  if (filters.sortBy)
    chips.push({
      label: `Sort: ${filters.sortBy} ${filters.sortDir ?? "asc"}`,
      onRemove: () => onChange({ sortBy: undefined, sortDir: undefined }),
    });

  if (chips.length === 0) return null;

  const chipCls = isDark
    ? "bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500/20"
    : "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100";
  const clearCls = isDark ? "text-slate-500 hover:text-slate-200" : "text-slate-400 hover:text-slate-700";
  const containerBorder = isDark ? "border-white/5 bg-[#0d0f14]" : "border-black/5 bg-[#f4f6f9]";

  return (
    <div className={`flex flex-wrap items-center gap-2 px-6 py-2 border-b ${containerBorder}`} aria-label="Active filters">
      <span className={`text-xs font-mono mr-1 ${isDark ? "text-slate-600" : "text-slate-400"}`}>Filtered by</span>
      {chips.map((chip) => (
        <span key={chip.label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border transition-colors ${chipCls}`}>
          {chip.label}
          <button
            onClick={chip.onRemove}
            aria-label={`Remove filter: ${chip.label}`}
            className="ml-0.5 opacity-60 hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      <button
        onClick={() => onChange({ search: undefined, status: undefined, hasExport: undefined, sortBy: undefined, sortDir: undefined })}
        className={`ml-auto text-xs font-mono transition-colors focus:outline-none focus-visible:underline ${clearCls}`}
        aria-label="Clear all filters"
      >
        Clear all
      </button>
    </div>
  );
}
