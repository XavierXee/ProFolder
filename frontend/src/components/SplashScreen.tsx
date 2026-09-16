import { useEffect, useState } from "react";
import Logo from "./Logo.js";

const SPLASH_DURATION_MS = 1000;

/**
 * A brief, full-viewport splash shown once per app refresh. Purely a UI placeholder for a
 * future "scan on startup" feature (per docs/TODO.md item 9) — it doesn't trigger any real scan
 * or block the rest of App's data-fetching, which proceeds normally underneath it in parallel.
 *
 * Uses `bg-canvas`/`text-ink` (Task 1's runtime-switchable tokens) rather than a hardcoded
 * color, so the splash background/text automatically match whichever theme is currently active.
 *
 * "Shown once per app refresh" is satisfied by component-local state alone: App fully remounts
 * on a real page reload, which resets this component's local `visible` state back to true, so
 * no explicit localStorage/sessionStorage tracking is needed.
 */
export default function SplashScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-canvas text-ink">
      <Logo size={112} ariaLabel="ProFolder" />
      <p className="text-sm font-mono">Syncing...</p>
    </div>
  );
}
