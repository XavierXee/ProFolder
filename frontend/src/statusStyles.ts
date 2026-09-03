import type { TrackStatus } from "./types.js";

export const ALL_STATUSES: TrackStatus[] = ["unknown", "draft", "needs_mixing", "done", "released"];

export const STATUS_LABELS: Record<TrackStatus, string> = {
  unknown: "Unknown",
  draft: "Draft",
  needs_mixing: "Need Mixing",
  done: "Done",
  released: "Released",
};

/** Badge fill styles (ring + bg + text), used by StatusBadge. */
export const STATUS_BADGE_DARK: Record<TrackStatus, string> = {
  unknown: "bg-slate-500/15 text-slate-400 ring-slate-500/30",
  draft: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  needs_mixing: "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  done: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  released: "bg-indigo-500/15 text-indigo-400 ring-indigo-500/30",
};
export const STATUS_BADGE_LIGHT: Record<TrackStatus, string> = {
  unknown: "bg-slate-100 text-slate-600 ring-slate-300",
  draft: "bg-amber-100 text-amber-800 ring-amber-300",
  needs_mixing: "bg-orange-100 text-orange-800 ring-orange-300",
  done: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  released: "bg-indigo-100 text-indigo-800 ring-indigo-300",
};

/** Outline pill styles (border + bg + text), used by FilterBar and FileDetailPanel's selectable pills. */
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
