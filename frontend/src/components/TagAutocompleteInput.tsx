import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
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

  // Token-driven: reuses FilterToolbar.tsx's established "recessed field on a surface" input
  // role (bg-canvas border-border text-ink placeholder-ink-muted) — same rationale as that
  // component's own doc comment (no pre-existing isDark/isProFolder branch covered this exact
  // combination, but this is the same "text input rendered inside a panel" role).
  const inputCls = "bg-canvas border-border text-ink placeholder-ink-muted";

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
        className={`w-full border rounded-[var(--rt-radius)] text-sm px-3 py-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 transition-colors disabled:opacity-50 ${inputCls} ${className}`}
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 mt-1 z-50 max-h-48 overflow-y-auto rounded-[var(--rt-radius)] border shadow-lg text-sm bg-surface border-border"
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
              // Highlighted: reuses MultiSelectDropdown.tsx/DestinationFolderPicker.tsx's
              // established "selected row" pair (bg-surface-selected text-ink). Not highlighted:
              // text-ink-secondary is a byte-faithful match for this option row's original
              // isDark ? "text-slate-300" : "text-slate-700" (see index.css's --rt-ink-secondary
              // doc comment), paired with the general row-hover token.
              className={`px-3 py-1.5 cursor-pointer font-mono ${
                i === highlighted ? "bg-surface-selected text-ink" : "text-ink-secondary hover:bg-surface-hover"
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
