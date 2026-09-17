import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Smoke test for the `@custom-variant profolder` mechanism (index.css) that lets components
 * write `profolder:block` (paired with a plain `hidden` base class) to show/hide an element
 * purely by theme, instead of a JS `isProFolder &&` conditional.
 *
 * jsdom does not implement layout/computed-style, so this
 * cannot assert the actual rendered `display` value differs per theme. That was verified manually
 * for this task via `npm run build:frontend` + inspecting the compiled CSS output, which contains:
 *   [data-theme=profolder] .profolder\:block:where(...){display:block}
 * (see the Task 0 dev report for the full observed rule). This test instead guards the two things
 * jsdom-level testing CAN meaningfully cover: (1) the `@custom-variant` declaration is present,
 * verbatim, in the checked-in index.css source, scoped to `[data-theme="profolder"]`, and (2) a
 * `hidden profolder:block` class pairing round-trips correctly through React's className prop into
 * the rendered DOM (proving there's no JSX/string-escaping issue with the `profolder:` variant's
 * colon syntax). The literal `"hidden profolder:block"` string below also doubles as the source
 * usage Tailwind's build-time class scanner needs to see in order to actually emit that CSS rule —
 * without some real usage somewhere in the scanned source tree, Tailwind emits nothing for an
 * otherwise-unused variant, even though the `@custom-variant` declaration itself is valid.
 */
describe("@custom-variant profolder (index.css)", () => {
  it('index.css declares the profolder custom variant, scoped to [data-theme="profolder"]', () => {
    const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.css");
    const css = readFileSync(cssPath, "utf8");
    expect(css).toContain('@custom-variant profolder ([data-theme="profolder"] &);');
  });

  it("a `hidden profolder:block` className round-trips into the rendered DOM unchanged", () => {
    render(<div data-testid="profolder-only" className="hidden profolder:block" />);
    expect(screen.getByTestId("profolder-only")).toHaveClass("hidden", "profolder:block");
  });
});
