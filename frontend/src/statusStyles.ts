import type { TrackStatus } from "./types.js";

export const ALL_STATUSES: TrackStatus[] = ["unknown", "draft", "finished"];

export const STATUS_LABELS: Record<TrackStatus, string> = {
  unknown: "Unknown",
  draft: "Draft",
  finished: "Finished",
};

/** Badge fill styles (ring + bg + text), used by StatusBadge. */
export const STATUS_BADGE_DARK: Record<TrackStatus, string> = {
  unknown: "bg-slate-500/15 text-slate-400 ring-slate-500/30",
  draft: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  finished: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
};
export const STATUS_BADGE_LIGHT: Record<TrackStatus, string> = {
  unknown: "bg-slate-100 text-slate-600 ring-slate-300",
  draft: "bg-amber-100 text-amber-800 ring-amber-300",
  finished: "bg-emerald-100 text-emerald-800 ring-emerald-300",
};

/** Outline pill styles (border + bg + text), used by FilterBar and FileDetailPanel's selectable pills. */
export const STATUS_PILL_DARK: Record<TrackStatus, string> = {
  unknown: "border-slate-500/40 text-slate-400 bg-slate-500/10 ring-slate-500/30",
  draft: "border-amber-500/40 text-amber-400 bg-amber-500/10 ring-amber-500/30",
  finished: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 ring-emerald-500/30",
};
export const STATUS_PILL_LIGHT: Record<TrackStatus, string> = {
  unknown: "border-slate-300 text-slate-600 bg-slate-50 ring-slate-300",
  draft: "border-amber-400/60 text-amber-700 bg-amber-50 ring-amber-300",
  finished: "border-emerald-400/60 text-emerald-700 bg-emerald-50 ring-emerald-300",
};

export const STATUS_PILL_UNSELECTED_DARK =
  "border-white/10 text-slate-500 bg-transparent hover:border-white/20 hover:text-slate-300";
export const STATUS_PILL_UNSELECTED_LIGHT =
  "border-slate-300 text-slate-600 bg-transparent hover:border-slate-400 hover:text-slate-800";
