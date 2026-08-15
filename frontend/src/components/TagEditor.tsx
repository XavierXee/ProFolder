import { useState } from "react";

export function TagEditor({
  tags,
  onChange,
  isDark = true,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  isDark?: boolean;
}) {
  const [input, setInput] = useState("");

  function addTag() {
    const trimmed = input.trim();
    if (!trimmed || tags.includes(trimmed)) {
      setInput("");
      return;
    }
    onChange([...tags, trimmed]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  const chipCls = isDark ? "bg-white/8 text-slate-300" : "bg-slate-100 text-slate-700";
  const removeCls = isDark ? "text-slate-500 hover:text-slate-200" : "text-slate-400 hover:text-slate-700";
  const inputCls = isDark
    ? "bg-white/5 border-white/10 text-slate-300 placeholder-slate-600"
    : "bg-white border-slate-300 text-slate-800 placeholder-slate-400";

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
      <input
        type="text"
        placeholder="Add tag, press Enter…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag();
          }
        }}
        onBlur={addTag}
        className={`w-full border rounded text-sm px-3 py-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 transition-colors ${inputCls}`}
      />
    </div>
  );
}
