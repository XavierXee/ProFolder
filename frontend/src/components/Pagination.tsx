export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  isDark,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  isDark: boolean;
  onPageChange: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const btnCls = isDark
    ? "border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20 disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:border-white/10"
    : "border-slate-300 text-slate-600 hover:text-slate-900 hover:border-slate-400 disabled:opacity-30 disabled:hover:text-slate-600 disabled:hover:border-slate-300";

  return (
    <div className={`flex items-center justify-between px-6 py-2.5 border-t text-xs font-mono ${isDark ? "border-white/8 text-slate-500" : "border-black/8 text-slate-500"}`}>
      <span>{total === 0 ? "No files" : `${start}–${end} of ${total}`}</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(1)} className={`px-2 py-1 rounded-[var(--rt-radius)] border transition-colors disabled:cursor-not-allowed ${btnCls}`}>
          «
        </button>
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={`px-2 py-1 rounded-[var(--rt-radius)] border transition-colors disabled:cursor-not-allowed ${btnCls}`}>
          ‹ Prev
        </button>
        <span className={`min-w-28 text-center ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          Page {page} of {totalPages}
        </span>
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className={`px-2 py-1 rounded-[var(--rt-radius)] border transition-colors disabled:cursor-not-allowed ${btnCls}`}>
          Next ›
        </button>
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)} className={`px-2 py-1 rounded-[var(--rt-radius)] border transition-colors disabled:cursor-not-allowed ${btnCls}`}>
          »
        </button>
      </div>
    </div>
  );
}
