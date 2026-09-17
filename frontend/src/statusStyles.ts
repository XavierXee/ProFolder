import type { TrackStatus } from "./types.js";

export const ALL_STATUSES: TrackStatus[] = ["unknown", "draft", "needs_mixing", "done", "released"];

export const STATUS_LABELS: Record<TrackStatus, string> = {
  unknown: "Unknown",
  draft: "Draft",
  needs_mixing: "Need Mixing",
  done: "Done",
  released: "Released",
};

/**
 * Badge fill styles (ring + bg + text), used by StatusBadge. Token-driven (see index.css's
 * `--rt-status-{status}-badge-*` custom properties) — same class string renders correctly under
 * every `[data-theme]` value, no isDark/isProFolder branching needed by consumers.
 */
export const STATUS_BADGE: Record<TrackStatus, string> = {
  unknown: "bg-status-unknown-badge-surface text-status-unknown-badge-ink ring-status-unknown-badge-ring",
  draft: "bg-status-draft-badge-surface text-status-draft-badge-ink ring-status-draft-badge-ring",
  needs_mixing: "bg-status-needs_mixing-badge-surface text-status-needs_mixing-badge-ink ring-status-needs_mixing-badge-ring",
  done: "bg-status-done-badge-surface text-status-done-badge-ink ring-status-done-badge-ring",
  released: "bg-status-released-badge-surface text-status-released-badge-ink ring-status-released-badge-ring",
};

/**
 * Outline pill styles (border + bg + text + ring), used by FilterBar and FileDetailPanel's
 * selectable pills, applied when a pill is the selected status. Token-driven, same as STATUS_BADGE.
 */
export const STATUS_PILL: Record<TrackStatus, string> = {
  unknown: "border-status-unknown-pill-border text-status-unknown-pill-ink bg-status-unknown-pill-surface ring-status-unknown-pill-ring",
  draft: "border-status-draft-pill-border text-status-draft-pill-ink bg-status-draft-pill-surface ring-status-draft-pill-ring",
  needs_mixing: "border-status-needs_mixing-pill-border text-status-needs_mixing-pill-ink bg-status-needs_mixing-pill-surface ring-status-needs_mixing-pill-ring",
  done: "border-status-done-pill-border text-status-done-pill-ink bg-status-done-pill-surface ring-status-done-pill-ring",
  released: "border-status-released-pill-border text-status-released-pill-ink bg-status-released-pill-surface ring-status-released-pill-ring",
};

/** Pill styling for an unselected status option — shared across all statuses (not per-status), token-driven. */
export const STATUS_PILL_UNSELECTED =
  "border-status-pill-unselected-border text-status-pill-unselected-ink bg-transparent hover:border-status-pill-unselected-border-hover hover:text-status-pill-unselected-ink-hover";

/**
 * TEMPORARY back-compat aliases, unchanged from the pre-token literal-class maps they replace.
 * Vite/Rollup's ESM import resolution fails the build (not just a tsc type error) on an
 * unresolved named import, so removing these outright breaks `npm run build:frontend` until
 * FileDetailPanel.tsx/ProjectDetailPanel.tsx are migrated to STATUS_PILL/STATUS_PILL_UNSELECTED
 * above — that migration is a later task, not Task 1's (StatusBadge.tsx/ScoreBadge.tsx were the
 * only consumers of STATUS_BADGE_DARK/STATUS_BADGE_LIGHT, and both are migrated as of Task 1, so
 * those two maps have been deleted; STATUS_PILL_DARK/STATUS_PILL_LIGHT/
 * STATUS_PILL_UNSELECTED_DARK/STATUS_PILL_UNSELECTED_LIGHT remain since FileDetailPanel.tsx/
 * ProjectDetailPanel.tsx still import them directly).
 * Delete these once those 2 consumers no longer import them.
 */
export const STATUS_PILL_DARK: Record<TrackStatus, string> = {
  unknown: "border-slate-500/40 text-slate-400 bg-slate-500/10 ring-slate-500/30",
  draft: "border-amber-500/40 text-amber-400 bg-amber-500/10 ring-amber-500/30",
  needs_mixing: "border-orange-500/40 text-orange-400 bg-orange-500/10 ring-orange-500/30",
  done: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 ring-emerald-500/30",
  released: "border-indigo-500/40 text-indigo-400 bg-indigo-500/10 ring-indigo-500/30",
};
export const STATUS_PILL_LIGHT: Record<TrackStatus, string> = {
  unknown: "border-slate-300 text-slate-600 bg-slate-50 ring-slate-300",
  draft: "border-amber-400/60 text-amber-700 bg-amber-50 ring-amber-300",
  needs_mixing: "border-orange-400/60 text-orange-700 bg-orange-50 ring-orange-300",
  done: "border-emerald-400/60 text-emerald-700 bg-emerald-50 ring-emerald-300",
  released: "border-indigo-400/60 text-indigo-700 bg-indigo-50 ring-indigo-300",
};
export const STATUS_PILL_UNSELECTED_DARK =
  "border-white/10 text-slate-500 bg-transparent hover:border-white/20 hover:text-slate-300";
export const STATUS_PILL_UNSELECTED_LIGHT =
  "border-slate-300 text-slate-600 bg-transparent hover:border-slate-400 hover:text-slate-800";
