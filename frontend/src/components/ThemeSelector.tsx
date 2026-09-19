import { useEffect, useRef, useState } from "react";
import type { Theme } from "../types.js";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "profolder", label: "Default" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Single-select theme dropdown, mirroring MultiSelectDropdown.tsx's trigger-button + listbox
 * interaction pattern (outside-click-to-close, capture-phase Escape with
 * stopImmediatePropagation so it pre-empts an ancestor overlay's own bubble-phase Escape
 * listener — see that file's doc comment for the mount-order rationale), simplified for a
 * single selected value instead of a Set.
 *
 * Deviation from MultiSelectDropdown: the trigger's accessible name is an explicit
 * aria-label="Theme" rather than being derived from its visible text, since the visible text
 * here is the currently selected option's own label ("ProFolder"/"Light"/"Dark") which could
 * otherwise collide with other accessible names elsewhere in the view. */
export function ThemeSelector({
  value,
  onChange,
}: {
  value: Theme;
  onChange: (theme: Theme) => void;
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
    // Registered on the capture phase so this fires before any ancestor's bubble-phase Escape
    // listener (e.g. a modal that closes itself on Escape) — see MultiSelectDropdown.tsx's
    // identical comment for the full rationale.
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  const triggerCls =
    value === "profolder"
      ? "border-border text-border hover:border-border"
      : "border-border text-ink-muted hover:text-ink hover:border-ink-muted";
  const menuCls = "bg-surface border-border";
  const optionHoverCls = "hover:bg-surface-hover";
  const optionCls = "text-ink";
  const selectedCls = value === "dark" ? "text-blue-400" : value === "profolder" ? "text-ink" : "text-accent";
  const checkmarkChipCls =
    value === "profolder" ? "inline-flex items-center justify-center px-1 rounded-[var(--rt-radius)] bg-accent text-accent-ink" : undefined;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Theme"
        className={`min-w-32 flex items-center justify-center gap-1 pl-6 pr-5 py-1 rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 bg-surface text-ink-muted border-border hover:text-ink hover:bg-surface-hover ${triggerCls}`}
      >
        <span className="whitespace-nowrap">{current.label}</span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Theme"
          className={`absolute right-0 top-full mt-1 z-20 min-w-32 rounded-[var(--rt-radius)] border shadow-2xl py-1 ${menuCls}`}
        >
          {OPTIONS.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex items-center justify-between gap-2 w-full px-3 py-1.5 text-xs font-mono text-left transition-colors ${optionHoverCls} ${
                  isSelected ? selectedCls : optionCls
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <span aria-hidden="true" className={checkmarkChipCls}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
