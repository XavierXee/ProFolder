import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Companion to index.css.tokens.test.ts's readFileSync-based source-string testing pattern, but
// scanning frontend/src/components/*.tsx instead of index.css. The per-component spot-check
// tests (LoadingRows/FileRow/DeleteTabConfirmDialog) only cover ~3-4 of the 25 files this task's
// rounded -> rounded-[var(--rt-radius)] / rounded-lg -> rounded-[var(--rt-radius-lg)] sweep
// touched; a future accidental revert or mis-mapping in any of the other ~21 files would slip
// past every existing test undetected. This single test globs every component file (so it also
// covers any new component added later) and asserts none of them contain a bare `rounded` or
// `rounded-lg` Tailwind class token anywhere in their source.
const componentsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "components");
const componentFiles = readdirSync(componentsDir).filter((f) => f.endsWith(".tsx"));

// `\b` stops at the boundary between "d"/"g" and the surrounding quote/backtick/space, so these
// intentionally do NOT match:
//  - `rounded-full` (legitimate shape primitive, out of scope for this token sweep) - the "-" right
//    after "rounded" fails BARE_ROUNDED's negative lookahead, and "full" != "lg" so BARE_ROUNDED_LG
//    never matches it either.
//  - `rounded-[var(--rt-radius)]` / `rounded-[var(--rt-radius-lg)]` (the already-converted forms) -
//    same negative-lookahead reasoning for BARE_ROUNDED, and the literal substring "rounded-lg"
//    doesn't appear anywhere inside "rounded-[var(--rt-radius-lg)]" (it's "radius-lg", not
//    "rounded-lg"), so BARE_ROUNDED_LG doesn't false-positive on it either.
const BARE_ROUNDED = /\brounded\b(?!-)/;
const BARE_ROUNDED_LG = /\brounded-lg\b/;

describe("frontend/src/components/*.tsx sweep: no bare `rounded`/`rounded-lg` Tailwind class survives anywhere", () => {
  it("scans a non-trivial number of component files (sanity check that the glob itself isn't silently empty)", () => {
    expect(componentFiles.length).toBeGreaterThan(20);
  });

  it("every component file uses the --rt-radius/--rt-radius-lg token classes, never a bare rounded/rounded-lg", () => {
    const violations = componentFiles.filter((file) => {
      const source = readFileSync(path.join(componentsDir, file), "utf8");
      return BARE_ROUNDED.test(source) || BARE_ROUNDED_LG.test(source);
    });

    expect(violations).toEqual([]);
  });
});
