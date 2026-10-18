import { useEffect, useRef } from "react";

export type TabListItem = { id: string | number; label: string };

type Props = {
  open: boolean;
  tabs: TabListItem[];
  activeTabId: string | number;
  onSelect: (id: string | number) => void;
  onClose: () => void;
};

/** Lists every tab currently in the tab bar (default + custom, in the same order they render
 * there) for the "burger" button next to it — a way to jump straight to a tab that's scrolled
 * out of view rather than scrolling the bar to find it. */
export default function TabListPanel({ open, tabs, activeTabId, onSelect, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => closeRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleSelect(id: string | number) {
    onSelect(id);
    onClose();
  }

  const panel = "bg-surface border-border text-ink";
  const meta = "text-slate-500";
  const divider = "border-border";

  return (
    <>
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"} bg-scrim`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="All tabs"
        // Stays mounted (CSS-slid off-screen) while "closed" so its slide transition can animate
        // — without `inert`, its controls were still real, keyboard-reachable "ghost" Tab stops
        // despite being invisible and unclickable. See FileDetailPanel.tsx's identical comment.
        inert={open ? undefined : ""}
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col transition-transform duration-250 ease-out ${panel} ${open ? "translate-x-0 shadow-2xl" : "translate-x-full"}`}
      >
        <div className={`flex items-start justify-between gap-4 px-6 py-5 pt-[18px] pb-[14px]  border-b ${divider}`}>
          <div className="min-w-0">
            <h2 className="text-base font-mono font-medium text-blue-400">All Tabs</h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="mt-0.5 p-1.5 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 text-ink-muted hover:text-ink hover:bg-surface-hover"
            aria-label="Close panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                onClick={() => handleSelect(tab.id)}
                aria-current={active}
                // Distinguishes this from the tab bar's OWN same-labeled button, visually
                // identical but a real separate element — this panel, like every other one in
                // this app, stays mounted off-screen while "closed" rather than unmounting (see
                // the `inert` comment above), so without this they'd be two real DOM buttons
                // with an identical plain accessible name ("Audio Files"), which jsdom's
                // accessibility-tree computation (unlike a real browser honoring `inert`) can't
                // tell apart — any `getByRole("button", { name: ... })` query for a tab's own
                // bar button would ambiguously match this one too.
                aria-label={`Go to tab ${tab.label}`}
                className={`w-full text-left px-3 py-2 rounded-[var(--rt-radius)] text-sm font-mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-hover"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
