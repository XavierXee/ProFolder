import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// jsdom doesn't load/apply index.css at all in this test harness (no `css: true` in
// vitest.frontend.config.ts, and nothing imports index.css from a test-reachable path), so this
// can only assert the literal source-string values on disk, not a rendered/computed style — see
// the project notes' documented jsdom rendering limitation. This guards the specific regression already
// caught once during this task's review cycle: --rt-ink for the dark theme was accidentally set
// to #f1f5f9 (Tailwind slate-100) instead of the actual pre-existing `body { color: #e2e8f0 }`
// (slate-200) that dark rendered with before this task introduced the token system (confirmed
// via `git show HEAD~1:frontend/src/index.css` at the time of the fix). canvas/border are also
// asserted since those are the only OTHER tokens this task actually wires live (via `body` and
// App.tsx's own header/sectionBorder) — surface/surface-hover/surface-selected/ink-muted/accent/
// accent-ink/danger are dormant groundwork not yet consumed by any rendered element in this
// task, so a wrong value there wouldn't be a live regression the way canvas/ink/border are.
const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.css");
const css = readFileSync(cssPath, "utf8");

function section(startMarker: string, endMarker: string): string {
  const start = css.indexOf(startMarker);
  expect(start, `expected to find ${JSON.stringify(startMarker)} in index.css`).toBeGreaterThan(-1);
  const end = css.indexOf(endMarker, start);
  expect(end, `expected to find ${JSON.stringify(endMarker)} after ${JSON.stringify(startMarker)} in index.css`).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe("index.css theme tokens match their pre-existing, byte-faithful source values", () => {
  it("dark theme: canvas/ink/border match the pre-existing (pre-token-system) body{} and App.tsx sectionBorder values", () => {
    const dark = section('[data-theme="dark"] {', '[data-theme="light"]');
    expect(dark).toContain("--rt-canvas: #0d0f14;"); // pre-existing body{background-color}
    expect(dark).toContain("--rt-ink: #e2e8f0;"); // pre-existing body{color}
    expect(dark).toContain("--rt-border: rgba(255, 255, 255, 0.08);"); // pre-existing App.tsx sectionBorder ("border-white/8")
  });

  it("light theme: canvas/ink/border match the pre-existing (pre-token-system) html.light body{} and App.tsx sectionBorder values", () => {
    const light = section('[data-theme="light"] {', '[data-theme="profolder"]');
    expect(light).toContain("--rt-canvas: #f4f6f9;"); // pre-existing html.light body{background-color}
    expect(light).toContain("--rt-ink: #0f172a;"); // pre-existing html.light body{color}
    expect(light).toContain("--rt-border: rgba(0, 0, 0, 0.08);"); // pre-existing App.tsx sectionBorder ("border-black/8")
  });
});
