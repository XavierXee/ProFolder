import { useMemo, useState } from "react";
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
  isDark = true,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  allTags?: string[];
  isDark?: boolean;
}) {
  const [input, setInput] = useState("");

  function addTag(raw: string) {
    const next = computeAddTag(tags, raw);
    if (next !== tags) onChange(next);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  const suggestions = useMemo(() => allTags.filter((t) => !tags.includes(t)), [allTags, tags]);

  const chipCls = isDark ? "bg-white/8 text-slate-300" : "bg-slate-100 text-slate-700";
  const removeCls = isDark ? "text-slate-500 hover:text-slate-200" : "text-slate-400 hover:text-slate-700";

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${chipCls}`}>
              {tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => removeTag(tag)} className={`leading-none transition-colors ${removeCls}`}>
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
        isDark={isDark}
      />
    </div>
  );
}
