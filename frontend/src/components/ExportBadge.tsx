function classify(isExportCandidate: boolean, exportConfidence: number): { label: string; dot: string } {
  if (isExportCandidate && exportConfidence >= 0.75) return { label: "Likely Export", dot: "bg-emerald-500" };
  if (isExportCandidate) return { label: "Maybe Export", dot: "bg-amber-500" };
  if (exportConfidence >= 0.3) return { label: "Unclear", dot: "bg-orange-500" };
  return { label: "Sample-like", dot: "bg-slate-400" };
}

export default function ExportBadge({
  isExportCandidate,
  exportConfidence,
  isDark = true,
}: {
  isExportCandidate: boolean;
  exportConfidence: number;
  isDark?: boolean;
}) {
  const { label, dot } = classify(isExportCandidate, exportConfidence);
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Export likelihood: ${label}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>{label}</span>
    </span>
  );
}
