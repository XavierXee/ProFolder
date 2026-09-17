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
