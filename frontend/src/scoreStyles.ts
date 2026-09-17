/** Fixed color per score value, forming a red (worst) → green (best) gradient. */
export const SCORE_DOT_COLORS: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-yellow-500",
  4: "bg-lime-500",
  5: "bg-green-500",
};

/** Empty (unscored) dot color, token-driven — replaces ScoreBadge.tsx/ScoreEditor.tsx's local
 *  `isDark ? "bg-slate-700" : "bg-slate-300"` ternary (see index.css's `--rt-ink-faint`). */
export const EMPTY_DOT = "bg-ink-faint";
