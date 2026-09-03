import { SCORE_DOT_COLORS } from "../scoreStyles.js";

export default function ScoreBadge({ score, isDark = true }: { score: number | null; isDark?: boolean }) {
  const empty = isDark ? "bg-slate-700" : "bg-slate-300";
  const label = score === null ? "Score: not set" : `Score: ${score} of 5`;

  return (
    <span className="inline-flex items-center gap-1" aria-label={label}>
      {Array.from({ length: 5 }, (_, i) => {
        const value = i + 1;
        const filled = score !== null && value <= score;
        return (
          <span
            key={i}
            className={`w-2 h-2 rounded-full ${filled ? SCORE_DOT_COLORS[value] : empty}`}
            aria-hidden="true"
          />
        );
      })}
    </span>
  );
}
