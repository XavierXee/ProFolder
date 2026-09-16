import { useEffect, useRef, useState } from "react";

type ThemeValue = "profolder" | "light" | "dark";

const OPTIONS: { value: ThemeValue; label: string }[] = [
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
  value: ThemeValue;
  onChange: (theme: ThemeValue) => void;
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
  const triggerCls = "border-border text-ink-muted hover:text-ink hover:border-ink-muted";
  const menuCls = "bg-surface border-border";
  const optionHoverCls = "hover:bg-surface-hover";
  const optionCls = "text-ink";
  // --color-accent is warm yellow (#FADF82) under the profolder theme and blue (#2563eb) under
  // light/dark. Checked as a TEXT color against each theme's --color-surface: profolder
  // (#FADF82 on #242422, ~11.8:1) and light (#2563eb on #ffffff, ~5.17:1) both clear WCAG
  // 1.4.3's 4.5:1 normal-text AA threshold, but dark (#2563eb on #181b24) only reaches ~3.33:1,
  // which fails it. For the dark case specifically, swap to the lighter text-blue-400 (~6.77:1
  // against #181b24) — the same lighter-blue mitigation this codebase already uses elsewhere
  // for readable text/accents on the dark theme's surface color (see MultiSelectDropdown.tsx's
  // triggerActiveCls) instead of the raw #2563eb token value. profolder/light keep text-accent
  // unchanged since both already clear AA on their own.
  const selectedCls = value === "dark" ? "text-blue-400" : "text-accent";

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
                {isSelected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
