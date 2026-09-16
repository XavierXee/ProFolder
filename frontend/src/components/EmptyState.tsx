type Props = { onClear: () => void };

export default function EmptyState({ onClear }: Props) {
  return (
    <tr>
      <td colSpan={8}>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
          <p className="text-sm text-slate-400 mb-1">No audio files match your filters</p>
          <p className="text-xs text-slate-600 mb-4">Try adjusting your search or filter criteria</p>
          <button
            onClick={onClear}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-400/50 px-3 py-1.5 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Clear all filters
          </button>
        </div>
      </td>
    </tr>
  );
}
