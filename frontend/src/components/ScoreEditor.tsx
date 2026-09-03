import { SCORE_DOT_COLORS } from "../scoreStyles.js";

export function ScoreEditor({
  score,
  onChange,
  disabled = false,
  isDark = true,
}: {
  score: number | null;
  onChange: (score: number | null) => void;
  disabled?: boolean;
  isDark?: boolean;
}) {
  const empty = isDark ? "bg-slate-700 hover:bg-slate-500" : "bg-slate-300 hover:bg-slate-400";

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
      {score !== null && <span className={`ml-1 text-xs font-mono ${isDark ? "text-slate-500" : "text-slate-500"}`}>{score}/5</span>}
    </div>
  );
}
