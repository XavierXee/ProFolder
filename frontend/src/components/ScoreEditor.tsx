import { EMPTY_DOT, SCORE_DOT_COLORS } from "../scoreStyles.js";

export function ScoreEditor({
  score,
  onChange,
  disabled = false,
}: {
  score: number | null;
  onChange: (score: number | null) => void;
  disabled?: boolean;
}) {
  // EMPTY_DOT ("bg-ink-faint") is scoreStyles.ts's existing token-driven replacement for this
  // dot's former isDark ? "bg-slate-700" : "bg-slate-300" literal (already used by ScoreBadge.tsx).
  // hover:bg-ink-muted is a byte-faithful match for the former hover state: --rt-ink-muted's
  // dark/light values equal this dot's former hover:bg-slate-500/hover:bg-slate-400 literals.
  const empty = `${EMPTY_DOT} hover:bg-ink-muted`;

  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Set score">
      {Array.from({ length: 5 }, (_, i) => {
        const value = i + 1;
        const filled = score !== null && value <= score;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={score === value}
            aria-label={`${value} of 5`}
            disabled={disabled}
            onClick={() => onChange(score === value ? null : value)}
            className={`w-3.5 h-3.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
              filled ? SCORE_DOT_COLORS[value] : empty
            }`}
          />
        );
      })}
      {/* Both former isDark branches resolved to the identical "text-slate-500" literal — this
          was already theme-invariant, not an actual isDark distinction, so it needs no token. */}
      {score !== null && <span className="ml-1 text-xs font-mono text-slate-500">{score}/5</span>}
    </div>
  );
}
