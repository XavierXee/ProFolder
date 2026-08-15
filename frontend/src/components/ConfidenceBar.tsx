export default function ConfidenceBar({ value, isDark = true }: { value: number; isDark?: boolean }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2" aria-label={`Export confidence: ${pct}%`}>
      <div className={`flex-1 h-1 rounded-full overflow-hidden ${isDark ? "bg-white/8" : "bg-black/10"}`}>
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono w-8 text-right ${isDark ? "text-slate-400" : "text-slate-600"}`}>{pct}%</span>
    </div>
  );
}
