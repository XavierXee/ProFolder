/**
 * Pure types/constants with no Node dependencies, so the frontend can safely
 * import DAW display labels without pulling in filesystem code (unlike
 * dawDetector.ts, which uses node:path/node:fs and can't be bundled for the browser).
 */
export type DawType =
  | "ableton"
  | "logic"
  | "cubase"
  | "protools"
  | "flstudio"
  | "reason"
  | "studioone"
  | "reaper"
  | "bitwig";

export const DAW_LABELS: Record<DawType, string> = {
  ableton: "Ableton",
  logic: "Logic Pro",
  cubase: "Cubase",
  protools: "Pro Tools",
  flstudio: "FL Studio",
  reason: "Reason",
  studioone: "Studio One",
  reaper: "Reaper",
  bitwig: "Bitwig",
};
