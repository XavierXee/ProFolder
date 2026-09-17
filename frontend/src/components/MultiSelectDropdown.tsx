import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export function MultiSelectDropdown<T extends string | number>({
  label,
  options,
  selected,
  onChange,
  reserveLabel,
}: {
  label: string;
  options: { value: T; label: ReactNode }[];
  selected: T[];
  onChange: (values: T[]) => void;
  /** Widest realistic rendering of this control's label (e.g. "Status (5)"). Rendered
   * invisibly to reserve the trigger button's width so selecting/deselecting options
   * never resizes it. Falls back to `label` (no count) if omitted. */
  reserveLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    // Registered on the capture phase so this fires before any ancestor's bubble-phase
    // Escape listener (e.g. a modal that closes itself on Escape) — otherwise, since both
    // listeners live on `window`, stopPropagation()/stopImmediatePropagation() would only
    // reliably pre-empt the ancestor's listener if this one happened to run first, which
    // depends on unpredictable effect-mount ordering.
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function toggle(value: T) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const triggerCls = "bg-surface text-ink-muted border-border hover:text-ink hover:bg-surface-hover";
  const triggerActiveCls = "bg-surface-selected border-ink text-ink";
  const menuCls = "bg-surface border-border";

  /** Per-option-row classes: each row renders as a bordered chip (Section 07's tag-filter-row
   * spec), with a distinct selected ("active chip") treatment. */
  function optionRowCls(isSelected: boolean) {
    return isSelected
      ? "border border-ink bg-surface-selected text-ink"
      : "border border-border bg-surface text-ink hover:bg-surface-hover";
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-1 px-2.5 py-1 rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          selected.length > 0 ? triggerActiveCls : triggerCls
        }`}
      >
        <span className="inline-grid">
          <span className="invisible whitespace-nowrap [grid-area:1/1]" aria-hidden="true">
            {reserveLabel ?? label}
          </span>
          <span className="whitespace-nowrap [grid-area:1/1]">
            {label}
            {selected.length > 0 ? ` (${selected.length})` : ""}
          </span>
        </span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={`Filter by ${label.toLowerCase()}`}
          className={`absolute left-0 top-full mt-1 z-20 min-w-40 max-h-72 overflow-y-auto rounded-[var(--rt-radius)] border shadow-2xl py-1 ${menuCls}`}
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs font-mono text-ink-muted">No options</p>
          ) : (
            options.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <label
                  key={String(opt.value)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-mono cursor-pointer transition-colors ${optionRowCls(isSelected)}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(opt.value)}
                    className="w-3.5 h-3.5 rounded-[var(--rt-radius)] cursor-pointer accent-blue-500 flex-shrink-0"
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
