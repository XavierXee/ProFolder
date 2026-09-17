import { useEffect, useRef, useState } from "react";
import type { Theme } from "../types.js";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "profolder", label: "ProFolder" },
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

  // Token-driven styling (not an isDark ternary): ThemeSelector is brand-new chrome introduced
  // in this theming task, so it renders through the runtime-switchable [data-theme] tokens
  // (frontend/src/index.css) rather than hand-picking hardcoded colors per isDark state — an
  // isDark binary can't distinguish "profolder" from "dark" (both isDark === true), which would
  // make the dropdown render identically under those two themes despite them being visually
  // distinct brand themes.
  // profolder's trigger sits on the still-dark --rt-chrome header background (canvas/surface are
  // light under profolder, but chrome stays Rack Black in all 3 themes), so it needs its own
  // legible-on-black classes rather than the ink/ink-muted tokens (which are dark-on-light text
  // colors under profolder and would be ~invisible against chrome): idle #585858 on #1C1C1A =
  // 2.40:1, hover #1C1C1A on #1C1C1A = 1:1 (literally invisible). text-border reuses the
  // existing #B0B0B0 border token as a legible-on-black text color (7.87:1 on chrome), and
  // hover:text-slate-100 reuses the exact literal the header's own <h1> already uses
  // successfully against this same chrome background.
  const triggerCls =
    value === "profolder"
      ? "border-border text-border hover:text-slate-100 hover:border-border"
      : "border-border text-ink-muted hover:text-ink hover:border-ink-muted";
  const menuCls = "bg-surface border-border";
  const optionHoverCls = "hover:bg-surface-hover";
  const optionCls = "text-ink";
  // --color-accent is warm yellow (#FADF82) under the profolder theme and blue (#2563eb) under
  // light/dark. Checked as a TEXT color against each theme's --color-surface: light
  // (#2563eb on #ffffff, ~5.17:1) clears WCAG 1.4.3's 4.5:1 normal-text AA threshold, but dark
  // (#2563eb on #181b24) only reaches ~3.33:1, which fails it. For the dark case specifically,
  // swap to the lighter text-blue-400 (~6.77:1 against #181b24) — the same lighter-blue
  // mitigation this codebase already uses elsewhere for readable text/accents on the dark
  // theme's surface color (see MultiSelectDropdown.tsx's triggerActiveCls) instead of the raw
  // #2563eb token value. profolder's --color-surface is #E9E9E9 (not the stale #242422 this
  // comment previously referenced), and #FADF82 as TEXT on #E9E9E9 measures ~1.1:1 —
  // catastrophically low regardless of surface being light or dark, so plain text-accent was
  // never usable for profolder here. Fixed by NOT tinting the label text at all for profolder
  // (falls through to plain text-ink, same as an unselected option) and instead indicating
  // selection via a small bg-accent text-accent-ink chip around the checkmark (see
  // checkmarkChipCls below), mirroring how the tab-switcher pairs bg-accent+text-accent-ink
  // rather than ever using text-accent alone for readable text.
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
        className={`flex items-center gap-1 px-2.5 py-1 rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${triggerCls}`}
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
