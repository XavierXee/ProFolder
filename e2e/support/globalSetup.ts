import fs from "node:fs";
import path from "node:path";
import { getScratchDir, getSentinelPath } from "./testEnv.js";

/**
 * Runs once before the whole e2e suite starts (see `globalSetup` in playwright.config.ts).
 *
 * Three responsibilities, all needed so scenarios can rely on a populated, deterministic DB
 * from their very first step rather than each scenario having to trigger (and wait out) its
 * own scan:
 *
 *   1. Stamp deterministic, widely-spaced mtimes on any "Projects E2E Sort *" fixture folders
 *      (added by a later task, for a "sort by Modified" scenario) before the scan runs, so
 *      their `mtime`-derived "modified" data is captured deterministically and isn't left to
 *      whatever timestamps `fs.cpSync` happened to produce when `testEnv.ts` copied the fixture
 *      tree into the scratch dir.
 *   2. POST directly to the API (not through the Vite dev-server proxy) to trigger a scan of
 *      the scratch music root, so every scenario in the suite starts with a populated DB.
 *   3. Write a small sentinel file into the scratch dir recording this run's `E2E_RUN_ID`. Every
 *      worker process computes its own `getScratchDir()`, and under a correct run every worker
 *      resolves the exact same directory this process just populated — but if that ever silently
 *      stops being true (e.g. `E2E_RUN_ID` wasn't actually shared with a worker), that worker
 *      would resolve a DIFFERENT, sentinel-less directory. `Before("@scan-lock")` in
 *      scanLockHooks.ts checks for this file before trusting the scan-lock mutex, so that failure
 *      mode throws a clear, named error instead of silently running with a no-op lock — see
 *      `getSentinelPath()`'s doc comment in `testEnv.ts`.
 *
 * This module is loaded by the `playwright test` process — the same process that evaluated
 * `playwright.config.ts` and therefore already called `getScratchDir()` once — so the call
 * below reuses that same in-memory-cached scratch dir rather than computing (or copying) a
 * second one. See the memoization comment on `getScratchDir()` in `testEnv.ts`.
 */
export default async function globalSetup(): Promise<void> {
  const scratchDir = getScratchDir();

  stampSortFixtureTimestamps(scratchDir);
  stampFileSortFixtureTimestamps(scratchDir);
  writeScratchDirSentinel();
  await triggerScan();
}

function writeScratchDirSentinel(): void {
  const sentinel = {
    runId: process.env.E2E_RUN_ID ?? null,
    scratchDir: getScratchDir(),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(getSentinelPath(), JSON.stringify(sentinel, null, 2), "utf-8");
}

// Any folder directly under `music-root` whose name starts with this prefix gets a fixed,
// deterministic mtime stamped on it before the scan runs, for a "sort by Modified" scenario.
const SORT_FIXTURE_PREFIX = "Projects E2E Sort";

// Fixed, arbitrary reference date. Deliberately not "now" (or anything relative to it) so the
// stamped mtimes — and therefore sort order — never depend on when the suite happens to run.
const SORT_FIXTURE_BASE_DATE = new Date("2020-01-01T00:00:00Z");
const SORT_FIXTURE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Date offset (in years past `SORT_FIXTURE_BASE_DATE`) for each fixture, keyed by the suffix
// after `SORT_FIXTURE_PREFIX` (e.g. "Projects E2E Sort Oldest" -> "Oldest"). Deliberately parsed
// from the folder's name rather than assigned by array index after an alphabetical `.sort()`:
// alphabetically, "Middle" < "Newest" < "Oldest" (M < N < O), so an index-based assignment would
// give "Middle" the earliest date and "Oldest" the latest — the opposite of what the names imply.
// Keying by parsed suffix instead guarantees the stamped date always matches the folder's name.
const SORT_FIXTURE_OFFSET_BY_SUFFIX: Record<string, number> = {
  Oldest: 0,
  Middle: 1,
  Newest: 2,
};

function stampSortFixtureTimestamps(scratchDir: string): void {
  const musicRoot = path.join(scratchDir, "music-root");

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(musicRoot, { withFileTypes: true });
  } catch {
    console.log("[e2e] globalSetup: music-root not found, skipping sort-fixture mtime stamping");
    return;
  }

  const sortFixtureFolders = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(SORT_FIXTURE_PREFIX))
    .map((entry) => entry.name)
    .sort();

  let stampedCount = 0;
  for (const folderName of sortFixtureFolders) {
    const suffix = folderName.slice(SORT_FIXTURE_PREFIX.length).trim();
    const offset = SORT_FIXTURE_OFFSET_BY_SUFFIX[suffix];
    if (offset === undefined) {
      console.log(
        `[e2e] globalSetup: skipping "${folderName}" — suffix "${suffix}" has no entry in SORT_FIXTURE_OFFSET_BY_SUFFIX`
      );
      continue;
    }

    const stampDate = new Date(SORT_FIXTURE_BASE_DATE.getTime() + offset * SORT_FIXTURE_YEAR_MS);
    const folderPath = path.join(musicRoot, folderName);

    // Stamp every file inside the folder too, not just the folder itself. The scanner derives
    // a project's persisted `contentModifiedAt` as max(markerFile.mtime, dir.mtime) (see
    // scanner.ts), and `testEnv.ts` copies the fixture tree with `fs.cpSync` (no
    // `preserveTimestamps`), which gives every copied file a fresh "now" mtime — far later than
    // any stamped date here. Left unstamped, that "now" marker-file mtime would always win the
    // max() and the folder-level stamp below would be a no-op for sort order.
    for (const fileEntry of fs.readdirSync(folderPath, { withFileTypes: true })) {
      if (!fileEntry.isFile()) continue;
      fs.utimesSync(path.join(folderPath, fileEntry.name), stampDate, stampDate);
    }

    fs.utimesSync(folderPath, stampDate, stampDate);
    stampedCount++;
  }

  console.log(
    `[e2e] globalSetup: found ${sortFixtureFolders.length} "${SORT_FIXTURE_PREFIX}*" fixture folder(s), stamped ${stampedCount} (folders + contained files) with deterministic mtimes`
  );
}

// Any file directly under `music-root` (not inside a subfolder — deliberately distinct from the
// `Projects E2E Sort *` FOLDER-matching logic above) whose name starts with this prefix gets a
// fixed, deterministic mtime stamped on it before the scan runs, for the Files-tab "sort by
// Modified" scenario. Reuses `SORT_FIXTURE_BASE_DATE`/`SORT_FIXTURE_YEAR_MS`/
// `SORT_FIXTURE_OFFSET_BY_SUFFIX` above — those are already keyed by a generic Oldest/Middle/
// Newest suffix, not specific to the Projects-tab prefix, so there's no need to duplicate them.
const FILE_SORT_FIXTURE_PREFIX = "Files E2E Sort";

function stampFileSortFixtureTimestamps(scratchDir: string): void {
  const musicRoot = path.join(scratchDir, "music-root");

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(musicRoot, { withFileTypes: true });
  } catch {
    console.log("[e2e] globalSetup: music-root not found, skipping file-sort-fixture mtime stamping");
    return;
  }

  // Only loose top-level files (`isFile()`), never directories — these fixtures live directly
  // under music-root, unlike the `Projects E2E Sort *` folders handled above.
  const sortFixtureFiles = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(FILE_SORT_FIXTURE_PREFIX))
    .map((entry) => entry.name)
    .sort();

  let stampedCount = 0;
  for (const fileName of sortFixtureFiles) {
    const suffix = fileName.slice(FILE_SORT_FIXTURE_PREFIX.length, -path.extname(fileName).length).trim();
    const offset = SORT_FIXTURE_OFFSET_BY_SUFFIX[suffix];
    if (offset === undefined) {
      console.log(
        `[e2e] globalSetup: skipping "${fileName}" — suffix "${suffix}" has no entry in SORT_FIXTURE_OFFSET_BY_SUFFIX`
      );
      continue;
    }

    const stampDate = new Date(SORT_FIXTURE_BASE_DATE.getTime() + offset * SORT_FIXTURE_YEAR_MS);
    fs.utimesSync(path.join(musicRoot, fileName), stampDate, stampDate);
    stampedCount++;
  }

  console.log(
    `[e2e] globalSetup: found ${sortFixtureFiles.length} "${FILE_SORT_FIXTURE_PREFIX}*" fixture file(s), stamped ${stampedCount} with deterministic mtimes`
  );
}

// Deliberately the API's own port, never the Vite dev-server port/proxy (5173) — Playwright's
// `webServer.url` readiness probe only confirms Vite itself is up, not that the API process
// (started alongside it by `concurrently` under `npm run dev`) has finished binding its port.
// Hitting the API directly, with retries below, absorbs that startup-order gap.
const API_PORT = 5175;
const SCAN_URL = `http://localhost:${API_PORT}/api/scan`;
const SCAN_RETRY_ATTEMPTS = 10;
const SCAN_RETRY_DELAY_MS = 500;

async function triggerScan(): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= SCAN_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(SCAN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`Scan request failed with status ${response.status}: ${await response.text()}`);
      }

      const stats = await response.json();
      console.log(`[e2e] globalSetup: seed scan complete on attempt ${attempt} — ${JSON.stringify(stats)}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < SCAN_RETRY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, SCAN_RETRY_DELAY_MS));
      }
    }
  }

  throw new Error(
    `[e2e] globalSetup: seed scan against ${SCAN_URL} failed after ${SCAN_RETRY_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
