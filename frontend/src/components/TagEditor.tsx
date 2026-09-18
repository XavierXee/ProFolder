import { useMemo, useState } from "react";
import RemoveTagConfirmDialog from "./RemoveTagConfirmDialog.js";
import { TagAutocompleteInput } from "./TagAutocompleteInput.js";

/**
 * Pure add-tag logic: trims whitespace, rejects empty/whitespace-only input,
 * and rejects duplicates (returning `tags` unchanged in both reject cases).
 * Exported for direct unit testing independent of the `input` state reset.
 */
export function computeAddTag(tags: string[], raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed || tags.includes(trimmed)) return tags;
  return [...tags, trimmed];
}

export function TagEditor({
  tags,
  onChange,
  allTags = [],
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  allTags?: string[];
}) {
  const [input, setInput] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);

  function addTag(raw: string) {
    const next = computeAddTag(tags, raw);
    if (next !== tags) onChange(next);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  const suggestions = useMemo(() => allTags.filter((t) => !tags.includes(t)), [allTags, tags]);

  // bg-chip-surface is a byte-faithful match: --rt-chip-surface's dark/light values are exact
  // transcriptions of this chip's own former isDark ? "bg-white/8" : "bg-slate-100" literal
  // (see index.css's doc comment on that token, which specifically flagged this component as
  // its future drop-in). text-ink-secondary is likewise byte-faithful for the former
  // isDark ? "text-slate-300" : "text-slate-700" text color.
  const chipCls = "bg-chip-surface text-ink-secondary";
  // Reuses the established close/remove-button pattern (text-ink-muted hover:text-ink) used
  // throughout the codebase's already-migrated panels/dialogs (e.g. FileDetailPanel.tsx,
  // BatchEditPanel.tsx, CreateCustomTabModal.tsx) — the base color is a byte-faithful match
  // (--rt-ink-muted's dark/light values equal this chip's former text-slate-500/text-slate-400),
  // the hover color follows the established consolidation (dark hover matches byte-exactly;
  // light hover shifts one step darker in the higher-contrast direction, per index.css's
  // documented discipline for these small consolidations).
  const removeCls = "text-ink-muted hover:text-ink";

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono ${chipCls}`}>
              {tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => setPendingRemoval(tag)} className={`leading-none transition-colors ${removeCls}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <TagAutocompleteInput
        value={input}
        onChange={setInput}
        onCommit={addTag}
        onBlur={() => addTag(input)}
        suggestions={suggestions}
        placeholder="Add tag, press Enter…"
      />
      <RemoveTagConfirmDialog
        open={pendingRemoval !== null}
        tagName={pendingRemoval ?? ""}
        onConfirm={() => {
          if (pendingRemoval) removeTag(pendingRemoval);
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
