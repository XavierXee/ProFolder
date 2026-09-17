export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  // Established secondary-button token pattern (see ThemeSelector.tsx's non-profolder
  // triggerCls / MultiSelectDropdown.tsx's triggerCls for the same border-border +
  // text-ink-muted/hover:text-ink/hover:border-ink-muted combination).
  const btnCls =
    "border-border text-ink-muted hover:text-ink hover:border-ink-muted disabled:opacity-30 disabled:hover:text-ink-muted disabled:hover:border-border";

  return (
    <div className="flex items-center justify-between px-6 py-2.5 border-t text-xs font-mono border-border text-slate-500">
      <span>{total === 0 ? "No files" : `${start}–${end} of ${total}`}</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(1)} className={`px-2 py-1 rounded-[var(--rt-radius)] border transition-colors disabled:cursor-not-allowed ${btnCls}`}>
          «
        </button>
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={`px-2 py-1 rounded-[var(--rt-radius)] border transition-colors disabled:cursor-not-allowed ${btnCls}`}>
          ‹ Prev
        </button>
        <span className="min-w-28 text-center text-ink-muted">
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
