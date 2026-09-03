import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  isDark?: boolean;
  disabled?: boolean;
  onBlur?: () => void;
  className?: string;
};

/**
 * Case-insensitive substring match of `value` against `suggestions`, capped
 * at 8 results. Exported for direct unit testing of the matching/cap logic
 * independent of the rendered dropdown.
 */
export function filterSuggestions(value: string, suggestions: string[]): string[] {
  const query = value.trim().toLowerCase();
  return query ? suggestions.filter((t) => t.toLowerCase().includes(query)).slice(0, 8) : [];
}

/**
 * Minimal text input with a filtered, keyboard-navigable suggestion dropdown.
 * Sourced from `suggestions` (already pre-filtered by the caller, e.g. to
 * exclude tags already applied to the current item). Does not own any
 * chip-list or tag-add/remove logic — that stays in the caller, which is
 * notified via `onCommit` for both free-text Enter and suggestion selection.
 */
export function TagAutocompleteInput({
  value,
  onChange,
  onCommit,
  suggestions,
  placeholder = "Add tag, press Enter…",
  isDark = true,
  disabled = false,
  onBlur,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const filtered = filterSuggestions(value, suggestions);

  useEffect(() => {
    setOpen(filtered.length > 0);
    setHighlighted(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit(text: string) {
    setOpen(false);
    setHighlighted(-1);
    onCommit(text);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (open && filtered.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setHighlighted((h) => {
        if (e.key === "ArrowDown") return h + 1 >= filtered.length ? 0 : h + 1;
        return h <= 0 ? filtered.length - 1 : h - 1;
      });
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      setHighlighted(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && highlighted >= 0 && highlighted < filtered.length) {
        commit(filtered[highlighted]);
      } else {
        commit(value);
      }
    }
  }

  const inputCls = isDark
    ? "bg-white/5 border-white/10 text-slate-300 placeholder-slate-600"
    : "bg-white border-slate-300 text-slate-800 placeholder-slate-400";

  return (
    <div className="relative">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => filtered.length > 0 && setOpen(true)}
        onBlur={onBlur}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={`w-full border rounded text-sm px-3 py-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 transition-colors disabled:opacity-50 ${inputCls} ${className}`}
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className={`absolute left-0 right-0 mt-1 z-50 max-h-48 overflow-y-auto rounded border shadow-lg text-sm ${
            isDark ? "bg-[#1a1d27] border-white/10" : "bg-white border-slate-200"
          }`}
        >
          {filtered.map((tag, i) => (
            <li
              key={tag}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => {
                // Prevent the input from blurring so the click registers as a
                // selection instead of triggering the input's own onBlur commit.
                e.preventDefault();
                commit(tag);
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`px-3 py-1.5 cursor-pointer font-mono ${
                i === highlighted
                  ? isDark
                    ? "bg-blue-500/20 text-blue-300"
                    : "bg-blue-50 text-blue-700"
                  : isDark
                    ? "text-slate-300 hover:bg-white/5"
                    : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
