import type { LibraryStats } from "../api/client.js";

type Props = { stats: LibraryStats | undefined; isDark: boolean };

export default function StatBar({ stats, isDark }: Props) {
  const s = stats ?? { total: 0, likelyExports: 0, needsReview: 0, draftCount: 0, lowConfidenceCount: 0 };

  const tiles = [
    { label: "Total Files", value: s.total, mono: true, highlight: null as string | null },
    { label: "Likely Exports", value: s.likelyExports, mono: false, highlight: null },
    {
      label: "Needs Review",
      value: s.needsReview,
      mono: false,
      highlight: s.needsReview > 0 ? (isDark ? "text-purple-400" : "text-purple-700") : null,
    },
    {
      label: "Low Confidence",
      value: s.lowConfidenceCount,
      mono: false,
      highlight: s.lowConfidenceCount > 0 ? (isDark ? "text-amber-400" : "text-amber-700") : null,
    },
  ];

  return (
    <div className={`flex items-stretch divide-x border-b ${isDark ? "divide-white/8 border-white/8" : "divide-slate-200 border-slate-200"}`}>
      {tiles.map((t) => (
        <div key={t.label} className="flex flex-col justify-center px-6 py-3 flex-1 min-w-0">
          <span className={`text-xs font-mono uppercase tracking-wider mb-0.5 ${isDark ? "text-slate-600" : "text-slate-500"}`}>
            {t.label}
          </span>
          <span
            className={`text-xl font-semibold tabular-nums ${t.highlight ?? (isDark ? "text-slate-200" : "text-slate-800")} ${t.mono ? "font-mono" : ""}`}
          >
            {t.value}
          </span>
        </div>
      ))}
    </div>
  );
}
