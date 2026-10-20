const CHIP_CLASS =
  "px-1.5 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono bg-surface border border-border text-ink-muted";

/** Compact table-cell tag display: only the first tag is shown as a chip, followed by a
 * "+N" chip counting the remaining tags. The hidden tags stay discoverable via the "+N"
 * chip's tooltip and a screen-reader-only list. */
export function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-xs font-mono text-ink-faint">—</span>;
  }

  const [first, ...rest] = tags;
  return (
    <div className="flex gap-1 min-w-0" data-testid="tag-chips">
      <span className={`min-w-0 truncate ${CHIP_CLASS}`}>{first}</span>
      {rest.length > 0 && (
        <span className={`shrink-0 cursor-default ${CHIP_CLASS}`} title={rest.join(", ")} data-testid="tag-chips-more">
          <span aria-hidden="true">+{rest.length}</span>
          <span className="sr-only">{`${rest.length} more: ${rest.join(", ")}`}</span>
        </span>
      )}
    </div>
  );
}
