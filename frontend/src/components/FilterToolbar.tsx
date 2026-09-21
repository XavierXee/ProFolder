import { useEffect, useState } from "react";
import type { TrackStatus } from "../types.js";
import { buildStatusOptions } from "../statusStyles.js";
import { useStatusCatalog } from "../contexts/StatusCatalogContext.js";
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

/** Patch shape emitted by the toolbar. This component never sets a `sortBy` value itself
 * (column-header sorting on the tables is the only way to set one) — it only ever clears
 * one via `clearAll()`, emitting `sortBy: undefined`. */
export type FilterToolbarPatch = {
  search?: string;
  statuses?: TrackStatus[];
  scores?: ScoreOption[];
  tags?: string[];
  sortBy?: "modifiedAt";
  sortDir?: "asc" | "desc";
};

/** Exported for reuse by CreateCustomTabModal, which needs the same Score options
 * (five-dot rendering included) for its own Score filter picker. */
export const SCORE_OPTIONS: { value: ScoreOption; label: React.ReactNode }[] = [
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
export const SCORE_RESERVE_LABEL = `Score (${SCORE_OPTIONS.length})`;
/** Tag counts are unbounded (any number of distinct tags could exist/be selected); a
 * pragmatic 2-digit reservation covers the realistic case without over-reserving space.
 * Exported for reuse by CreateCustomTabModal's own Tags filter picker. */
export const TAGS_RESERVE_LABEL = "Tags (99)";
/** Batch Edit selection is capped by the fixed page size (PAGE_SIZE rows/page, no
 * page-size selector exists), so `(${PAGE_SIZE})` is the true realistic maximum, not a guess. */
const BATCH_EDIT_RESERVE_LABEL = `Batch Edit (${PAGE_SIZE})`;
/** Result-count label reserve. This component is shared by all 4 filter bars (default/custom
 * Files and Projects tabs), whose `resultLabel` prop always ends in either "files" or "projects"
 * (the only two nouns ever used app-wide, see `${count} of ${total} files/projects`). The
 * reserve must be a single fixed width across every tab, not derived per-render from whichever
 * noun happens to be current, otherwise the box visibly resizes when navigating between a Files
 * tab and a Projects tab. "projects" is the longer of the two nouns, so it's used unconditionally
 * as the universal reserve, even though this over-reserves slightly on Files tabs. */
const RESULT_COUNT_RESERVE_LABEL = "999 of 999 projects";

export default function FilterToolbar({
  filters,
  onChange,
  allTags,
  resultLabel,
  searchPlaceholder,
  searchAriaLabel,
  selectedCount,
  onOpenBatchPanel,
  locked = false,
}: {
  filters: FilterToolbarFilters;
  onChange: (patch: FilterToolbarPatch) => void;
  allTags: string[];
  resultLabel: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  /** Mono/uppercase eyebrow label (e.g. "PROJECT FOLDERS") shown before the search input.
   * Rendered unconditionally when provided; its visibility is theme-gated purely via CSS (the
   * `hidden profolder:inline` variant pair below) — Light/Dark hide it, matching Section 07's
   * mockup being ProFolder-specific, with no JS theme conditional involved. */
  sectionLabel?: string;
  /** Number of currently-selected rows; drives the Batch Edit button's label and disabled state. */
  selectedCount: number;
  onOpenBatchPanel: () => void;
  /** When true, hides the Status/Score/Tags pickers (a locked custom tab's baseline filter is
   * fixed) while keeping search and sort live. Defaults to false so existing callers (the
   * default Files/Projects tabs, via `FilterBar`/`ProjectsFilterBar`) are unaffected. */
  locked?: boolean;
}) {
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const { statuses: catalogStatuses } = useStatusCatalog();
  const statusOptions = buildStatusOptions(catalogStatuses);
  /** Widest realistic "Status" trigger label: every status (including "Unknown") selected at once. */
  const statusReserveLabel = `Status (${statusOptions.length})`;

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== (filters.search ?? "")) {
        onChange({ search: searchInput || undefined });
      }
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const bg = "bg-surface";
  const borderOuter = "border-border";
  // No pre-existing isProFolder branch covered this input's colors (a gap flagged for Reviewer
  // sign-off, same as Task 2's chip-pattern flag): bg-canvas is consistently the "recessed field
  // on a surface" tone across all 3 themes (darker than bg-surface in dark/light/profolder alike).
  const inputBg = "bg-canvas border-border text-ink placeholder-ink-muted";
  const clearCls =
    "border bg-surface border-border text-ink-muted hover:text-ink hover:bg-surface-hover px-2.5 py-1 rounded-[var(--rt-radius)]";
  const batchEditCls = "bg-accent text-accent-ink border-accent profolder:border-border";

  const statuses = filters.statuses ?? [];
  const scores = filters.scores ?? [];
  const tags = filters.tags ?? [];

  const activeFilterCount = locked
    ? (filters.search ? 1 : 0) + (filters.sortBy ? 1 : 0)
    : statuses.length + scores.length + tags.length + (filters.search ? 1 : 0) + (filters.sortBy ? 1 : 0);

  function clearAll() {
    setSearchInput("");
    if (locked) {
      onChange({ search: undefined, sortBy: undefined, sortDir: undefined });
    } else {
      onChange({ search: undefined, statuses: undefined, scores: undefined, tags: undefined, sortBy: undefined, sortDir: undefined });
    }
  }

  const tagOptions = allTags.map((t) => ({ value: t, label: t }));

  return (
    <div role="toolbar" aria-label="Filters" className={`border-b ${borderOuter} ${bg}`}>
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
            className={`w-full border rounded-[var(--rt-radius)] text-sm pl-8 pr-2.5 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:border-blue-500/50 transition-colors ${inputBg}`}
            aria-label={searchAriaLabel}
          />
        </div>

        {!locked && (
          <>
            <MultiSelectDropdown
              label="Status"
              options={statusOptions}
              selected={statuses}
              onChange={(next) => onChange({ statuses: next })}
              reserveLabel={statusReserveLabel}
            />
            <MultiSelectDropdown
              label="Score"
              options={SCORE_OPTIONS}
              selected={scores}
              onChange={(next) => onChange({ scores: next })}
              reserveLabel={SCORE_RESERVE_LABEL}
            />
            <MultiSelectDropdown
              label="Tags"
              options={tagOptions}
              selected={tags}
              onChange={(next) => onChange({ tags: next })}
              reserveLabel={TAGS_RESERVE_LABEL}
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="inline-grid text-xs font-mono whitespace-nowrap text-ink-muted">
            {/* Reserve a single fixed width (RESULT_COUNT_RESERVE_LABEL) across every filter bar,
             * regardless of which noun ("files"/"projects") or digit counts the current
             * resultLabel has, so the box never resizes when navigating between tabs. */}
            <span className="invisible whitespace-nowrap [grid-area:1/1]" aria-hidden="true">
              {RESULT_COUNT_RESERVE_LABEL}
            </span>
            <span className="whitespace-nowrap [grid-area:1/1]">{resultLabel}</span>
          </span>

          <button
            onClick={onOpenBatchPanel}
            disabled={selectedCount < 2}
            className={`px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30 disabled:cursor-not-allowed ${batchEditCls}`}
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
