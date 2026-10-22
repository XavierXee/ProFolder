import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// jsdom doesn't load/apply index.css at all in this test harness (no `css: true` in
// vitest.frontend.config.ts, and nothing imports index.css from a test-reachable path), so this
// can only assert the literal source-string values on disk, not a rendered/computed style (jsdom
// doesn't render). This guards the specific regression already
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

// Task 1.5 first moved the profolder canvas from an all-dark scheme to a light Desk Grey/Panel
// scheme, with a NEW --rt-chrome token carrying the Rack Black value forward for
// header/footer/logo-tile contexts specifically. A LATER, separate user decision then moved
// profolder's canvas/surface/chrome again, this time to match the Light theme's own resolved
// values exactly (byte-identical, not just similarly light) — see index.css's profolder block,
// where the Desk Grey/Panel/Rack-Black-chrome values are left in place only as commented-out
// history, not live declarations. dark/light's --rt-chrome is asserted byte-identical to their
// own pre-existing --rt-canvas values (confirmed against the actual current source at the time of
// this task, not assumed) so bg-chrome renders with zero visual change for those two themes.
describe("index.css profolder theme: Task 1.5 light-canvas correction + --rt-chrome token", () => {
  it("profolder: canvas/surface/ink/ink-muted/danger match the corrected light-scheme values", () => {
    const profolder = section('[data-theme="profolder"] {', "/* Geometry tokens");
    expect(profolder).toContain("--rt-canvas: #f4f6f9;"); // matches Light theme's canvas, per later user decision
    expect(profolder).toContain("--rt-surface: #ffffff;"); // matches Light theme's surface
    expect(profolder).toContain("--rt-ink: #1C1C1A;"); // Rack Black
    expect(profolder).toContain("--rt-ink-muted: #585858;"); // darkened from the old #6E6E6E
    expect(profolder).toContain("--rt-danger: #991b1b;"); // darkened from the old #ef4444
  });

  it("--rt-chrome resolves correctly in all 3 theme blocks", () => {
    const dark = section('[data-theme="dark"] {', '[data-theme="light"]');
    expect(dark).toContain("--rt-chrome: #0d0f14;"); // byte-identical to dark's own --rt-canvas

    const light = section('[data-theme="light"] {', '[data-theme="profolder"]');
    expect(light).toContain("--rt-chrome: #f4f6f9;"); // byte-identical to light's own --rt-canvas

    const profolder = section('[data-theme="profolder"] {', "/* Geometry tokens");
    // Live declaration only — the file also has commented-out prior values (#1C1C1A Rack Black,
    // #b0b0b0, #47c5a8) directly above this line from earlier design iterations; matching the
    // exact, uncommented "  --rt-chrome: #f4f6f9;" line (with its leading indent) avoids a false
    // match against those dead lines, which a bare `.toContain("--rt-chrome: #1C1C1A;")` used to
    // do even though that value is no longer live.
    expect(profolder).toContain("\n  --rt-chrome: #f4f6f9;"); // matches Light theme's chrome, per later user decision
  });

  it("wires --rt-chrome through the @theme block so bg-chrome/text-chrome become real Tailwind utilities", () => {
    const themeBlock = section("@theme {", "}");
    expect(themeBlock).toContain("--color-chrome: var(--rt-chrome);");
  });
});

describe("index.css geometry tokens (--rt-radius-lg): dark/light match Tailwind's default `rounded-lg` scale, profolder collapses to square corners", () => {
  it("dark/light share one combined geometry block where --rt-radius-lg resolves to 0.5rem (Tailwind's default rounded-lg)", () => {
    const geometry = section(':root,\n[data-theme="dark"],\n[data-theme="light"] {', '[data-theme="profolder"] {\n  --rt-radius: 0;');
    expect(geometry).toContain("--rt-radius-lg: 0.5rem;");
  });

  it("profolder theme collapses --rt-radius-lg to 0, same as --rt-radius", () => {
    const geometry = section('[data-theme="profolder"] {\n  --rt-radius: 0;', "* {");
    expect(geometry).toContain("--rt-radius-lg: 0;");
  });
});
