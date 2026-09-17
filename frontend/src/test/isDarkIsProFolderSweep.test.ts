import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Final regression test for the whole 8-task theming rework: Tasks 1-7 migrated every component
// off `isDark`/`isProFolder` JS conditionals onto CSS token classes and the `profolder:` variant;
// Task 8 removed the last two live consumers (App.tsx's tab-button styling ternaries) and deleted
// App.tsx's own `const isDark`/`const isProFolder`. This test is the permanent, repo-wide proof
// those names never come back as live code anywhere in frontend/src/components/*.tsx or App.tsx —
// mirroring this file's own roundedClassSweep.test.ts precedent (a single grep-based sweep over
// every file in scope, rather than per-component spot checks that only cover the files a given
// task happened to touch).
//
// Unlike roundedClassSweep.test.ts, this sweep needs real comment-stripping: several files across
// Tasks 1-7 legitimately mention `isDark`/`isProFolder` in `//` and `{/* ... */}` comments,
// documenting what each token class replaced (e.g. AudioPlayerBar.tsx, TagEditor.tsx,
// ThemeSelector.tsx, ScoreEditor.tsx — grep the repo for confirmation). roundedClassSweep.test.ts
// didn't need this because no legitimate comment happened to contain a bare "rounded"/"rounded-lg"
// substring; this migration's own commit history means comments legitimately reference these two
// names, so naive whole-source scanning would false-positive on them. Both block comments
// (`/* ... */`, which also covers JSX `{/* ... */}` — the leftover braces are harmless once the
// `/* ... */` portion is stripped) and line comments (`//...`) are stripped before scanning.
//
// One further, narrower exception: App.tsx's LEGACY_THEME_STORAGE_KEY constant is the literal
// string "musicLibraryManager.isDark" — the legacy localStorage key name from before the
// string-based Theme migration (Task 0), not a reference to the JS `isDark` variable this task
// deleted. It's a fixed, already-reviewed key name (out of this task's and this test's scope to
// rename) rather than a pattern any future file is expected to repeat, so it's stripped out by
// its exact literal text before scanning, rather than via a general string-literal-stripping pass.
const LEGACY_KEY_LITERAL = "musicLibraryManager.isDark";

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments, including JSX `{/* ... */}`
    .replace(/\/\/.*$/gm, ""); // line comments
}

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = path.join(srcDir, "components");
const componentFiles = readdirSync(componentsDir)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => path.join(componentsDir, f));
const appFile = path.join(srcDir, "App.tsx");
const scannedFiles = [...componentFiles, appFile];

const LIVE_IS_DARK = /\bisDark\b/;
const LIVE_IS_PROFOLDER = /\bisProFolder\b/;

function findViolations() {
  return scannedFiles
    .map((file) => {
      const raw = readFileSync(file, "utf8");
      const withoutLegacyKey = raw.split(LEGACY_KEY_LITERAL).join("");
      const code = stripComments(withoutLegacyKey);
      const hits: string[] = [];
      if (LIVE_IS_DARK.test(code)) hits.push("isDark");
      if (LIVE_IS_PROFOLDER.test(code)) hits.push("isProFolder");
      return { file: path.relative(srcDir, file), hits };
    })
    .filter((r) => r.hits.length > 0);
}

describe("frontend/src/components/*.tsx + App.tsx sweep: no live isDark/isProFolder identifier survives anywhere", () => {
  it("scans a non-trivial number of files (sanity check that the glob itself isn't silently empty)", () => {
    expect(scannedFiles.length).toBeGreaterThan(20);
  });

  it("confirms known comment-only mentions of isDark/isProFolder exist in the scanned source (sanity check that the fixture set actually exercises the comment-stripping logic, not just an empty case)", () => {
    const anyRawMention = scannedFiles.some((file) => /isDark|isProFolder/.test(readFileSync(file, "utf8")));
    expect(anyRawMention).toBe(true);
  });

  it("every file is free of live isDark/isProFolder references (comments and the one documented legacy storage-key string literal excluded)", () => {
    expect(findViolations()).toEqual([]);
  });
});
