import { useEffect, useState } from "react";
import type { TrackStatus } from "../types.js";
import { ALL_STATUSES, STATUS_LABELS } from "../statusStyles.js";
import { SCORE_DOT_COLORS } from "../scoreStyles.js";
import { MultiSelectDropdown } from "./MultiSelectDropdown.js";
import { PAGE_SIZE } from "../constants.js";

type ScoreOption = number | "unscored";

/** Shared shape read by the toolbar. Both `FileFilters` and `ProjectFilters` are
 * structurally compatible with this (their `sortBy` unions are narrower than `string`). */
export type FilterToolbarFilters = {
  search?: string;
  statuses?: TrackStatus[];
  scores?: ScoreOption[];
  tags?: string[];
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

/** Patch shape emitted by the toolbar. The only `sortBy` value this component ever sets
 * is "modifiedAt", which both `FileFilters` and `ProjectFilters` accept, so callers'
 * narrower `onChange` handlers remain assignable here. */
export type FilterToolbarPatch = {
  search?: string;
  statuses?: TrackStatus[];
  scores?: ScoreOption[];
  tags?: string[];
  sortBy?: "modifiedAt";
  sortDir?: "asc" | "desc";
};

const STATUS_OPTIONS = ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));
/** Widest realistic "Status" trigger label: every status selected at once. */
const STATUS_RESERVE_LABEL = `Status (${ALL_STATUSES.length})`;

const SCORE_OPTIONS: { value: ScoreOption; label: React.ReactNode }[] = [
  ...[1, 2, 3, 4, 5].map((n) => ({
    value: n as ScoreOption,
    label: (
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${SCORE_DOT_COLORS[n]}`} aria-hidden="true" />
        {n}
      </span>
    ),
  })),
  { value: "unscored", label: "Unscored" },
];
/** Widest realistic "Score" trigger label: every score bucket (1-5 + Unscored) selected. */
const SCORE_RESERVE_LABEL = `Score (${SCORE_OPTIONS.length})`;
/** Tag counts are unbounded (any number of distinct tags could exist/be selected); a
 * pragmatic 2-digit reservation covers the realistic case without over-reserving space. */
const TAGS_RESERVE_LABEL = "Tags (99)";
/** Batch Edit selection is capped by the fixed page size (PAGE_SIZE rows/page, no
 * page-size selector exists), so `(${PAGE_SIZE})` is the true realistic maximum, not a guess. */
const BATCH_EDIT_RESERVE_LABEL = `Batch Edit (${PAGE_SIZE})`;

export default function FilterToolbar({
  filters,
  onChange,
  allTags,
  isDark,
  resultLabel,
  searchPlaceholder,
  searchAriaLabel,
  selectedCount,
  onOpenBatchPanel,
}: {
  filters: FilterToolbarFilters;
  onChange: (patch: FilterToolbarPatch) => void;
  allTags: string[];
  isDark: boolean;
  resultLabel: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  /** Number of currently-selected rows; drives the Batch Edit button's label and disabled state. */
  selectedCount: number;
  onOpenBatchPanel: () => void;
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
  const inputBg = isDark
    ? "bg-white/5 border-white/10 text-slate-300 placeholder-slate-600"
    : "bg-white border-slate-300 text-slate-800 placeholder-slate-400";
  const clearCls = isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-500 hover:text-slate-800";
  const sortUnselected = isDark
    ? "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
    : "border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-800";
  const batchEditCls = isDark
    ? "border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20"
    : "border-black/10 text-slate-600 hover:text-slate-900 hover:border-black/20";

  const statuses = filters.statuses ?? [];
  const scores = filters.scores ?? [];
  const tags = filters.tags ?? [];

  const activeFilterCount = statuses.length + scores.length + tags.length + (filters.search ? 1 : 0) + (filters.sortBy ? 1 : 0);

  function clearAll() {
    setSearchInput("");
    onChange({ search: undefined, statuses: undefined, scores: undefined, tags: undefined, sortBy: undefined, sortDir: undefined });
  }

  const tagOptions = allTags.map((t) => ({ value: t, label: t }));

  return (
    <div className={`border-b ${borderOuter} ${bg}`}>
      <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 px-6 py-2.5">
        <div className="relative flex-1 min-w-40">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={`w-full border rounded text-sm pl-8 pr-2.5 py-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:border-blue-500/50 transition-colors ${inputBg}`}
            aria-label={searchAriaLabel}
          />
        </div>

        <MultiSelectDropdown
          label="Status"
          options={STATUS_OPTIONS}
          selected={statuses}
          onChange={(next) => onChange({ statuses: next })}
          isDark={isDark}
          reserveLabel={STATUS_RESERVE_LABEL}
        />
        <MultiSelectDropdown
          label="Score"
          options={SCORE_OPTIONS}
          selected={scores}
          onChange={(next) => onChange({ scores: next })}
          isDark={isDark}
          reserveLabel={SCORE_RESERVE_LABEL}
        />
        <MultiSelectDropdown
          label="Tags"
          options={tagOptions}
          selected={tags}
          onChange={(next) => onChange({ tags: next })}
          isDark={isDark}
          reserveLabel={TAGS_RESERVE_LABEL}
        />

        <button
          onClick={() =>
            onChange({
              sortBy: "modifiedAt",
              sortDir: filters.sortBy === "modifiedAt" && filters.sortDir === "asc" ? "desc" : "asc",
            })
          }
          aria-pressed={filters.sortBy === "modifiedAt"}
          className={`px-2.5 py-1 rounded text-xs font-mono font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            filters.sortBy === "modifiedAt"
              ? isDark
                ? "border-blue-500/40 text-blue-400 bg-blue-500/10 ring-1 ring-blue-500/30"
                : "border-blue-400/60 text-blue-700 bg-blue-50 ring-1 ring-blue-300"
              : sortUnselected
          }`}
        >
          <span className="whitespace-nowrap">
            Sort: Modified{" "}
            <span className={filters.sortBy === "modifiedAt" ? "opacity-100" : "opacity-0"} aria-hidden="true">
              {filters.sortDir === "desc" ? "↓" : "↑"}
            </span>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className={`text-xs font-mono whitespace-nowrap ${isDark ? "text-slate-600" : "text-slate-400"}`}>{resultLabel}</span>

          <button
            onClick={onOpenBatchPanel}
            disabled={selectedCount < 2}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30 disabled:cursor-not-allowed ${batchEditCls}`}
          >
            <span className="inline-grid">
              <span className="invisible whitespace-nowrap [grid-area:1/1]" aria-hidden="true">
                {BATCH_EDIT_RESERVE_LABEL}
              </span>
              <span className="whitespace-nowrap [grid-area:1/1]">
                Batch Edit{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </span>
            </span>
          </button>

          <button
            onClick={clearAll}
            disabled={activeFilterCount === 0}
            className={`text-xs font-mono flex items-center gap-1 transition-colors focus:outline-none focus-visible:underline disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none ${clearCls}`}
            aria-label="Clear all filters"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
