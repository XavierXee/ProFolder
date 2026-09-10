import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Isolated scratch directory for the e2e run: a fresh copy of the fixture music root plus
 * a throwaway SQLite database, so the suite never touches the real `data/library.db` or a
 * developer's real `MUSIC_ROOT`.
 *
 * A single `npm run test:e2e` invocation loads `playwright.config.ts` (and therefore calls
 * `getScratchDir()`) from more than one independent Node process — the `bddgen` CLI and
 * Playwright's own config-loading process — which do NOT share in-memory state (`globalTeardown`
 * runs in-process inside the `playwright test` runner, so it *does* share memory with that one,
 * but not with `bddgen`'s separate process). So the resolved path is persisted to a marker file
 * under the OS temp dir: the first caller (in either process) creates the scratch dir and writes
 * the marker, the other caller reads the marker and reuses the same directory.
 *
 * That marker file is named after `E2E_RUN_ID` — a random ID generated once per `npm run
 * test:e2e`/`test:e2e:headed` invocation (see package.json) and exported to every process
 * spawned within that one invocation. This is what makes reuse safe: a marker written by run A
 * can only ever be found by a process that also has run A's `E2E_RUN_ID`, which no later,
 * separate invocation (run B, with its own fresh random ID) will ever have — even if run A
 * crashed mid-suite (e.g. Ctrl+C, CI kill) and left its marker + scratch dir behind. Every
 * invocation is therefore guaranteed a fresh scratch dir + DB, never a leftover/possibly-
 * corrupted one from a previous run, regardless of how that previous run ended.
 *
 * (If `E2E_RUN_ID` isn't set, this falls back to the current process's PID. That fallback is a
 * correctness HAZARD, not just a degraded-but-safe mode: `scanLock.ts` derives its cross-process
 * scan-configuration mutex's lock-file path from this same scratch dir, and every Playwright
 * worker is a separate OS process with its own pid. If workers ever actually hit this fallback —
 * i.e. `E2E_RUN_ID` wasn't propagated to them — each one computes a DIFFERENT pid-keyed marker,
 * finds none, and creates its own separate scratch dir (and therefore its own separate lock file).
 * The mutex then degenerates into N independent no-op locks with zero real cross-process
 * contention protection — silently: no error, no warning, tests can still pass, and any
 * concurrency bug the mutex exists to prevent can corrupt test data with no indication anything
 * was wrong. `playwright.config.ts` now auto-generates a shared `E2E_RUN_ID` (if one isn't already
 * set by the npm scripts) at config-load time, before any worker forks, specifically so every
 * worker inherits the same value and this fallback is never actually exercised in practice — see
 * the comment there. This fallback remains only as defense for a hypothetical caller that imports
 * `getScratchDir()` completely outside the `playwright.config.ts`-driven flow.)
 */

const MARKER_PREFIX = "musicfoldercron-e2e-scratch-dir.";

// Deliberately NOT resolved into a module-top-level constant. `playwright.config.ts` sets
// `process.env.E2E_RUN_ID` (if unset) in its own module body, AFTER its `import { getScratchDir }
// from "./testEnv.js"` line — and ES module imports are fully evaluated before the importing
// module's own top-level statements run. A top-level `const RUN_ID = process.env.E2E_RUN_ID ?? ...`
// here would therefore capture the PRE-assignment value (i.e. always fall through to the pid
// fallback) in the very process meant to set it, defeating that fix. Computing this lazily, only
// when `getMarkerPath()` is actually called (which every caller does after that assignment has
// run — see `getScratchDir()` below, called only after playwright.config.ts's own top-level body
// completes), reads `process.env.E2E_RUN_ID` at the correct time in every process. Reproduced
// empirically: with this eager, would silently make the main config/globalSetup process use a
// PID-keyed marker while every worker (whose own module top-level runs AFTER inheriting the
// already-set env var) used the E2E_RUN_ID-keyed marker — the exact mismatch this fix exists to
// prevent, just relocated one level deeper.
function getMarkerPath(): string {
  const runId = process.env.E2E_RUN_ID ?? String(process.pid);
  return path.join(os.tmpdir(), `${MARKER_PREFIX}${runId}.txt`);
}

// Any *other* invocation's marker file older than this is assumed abandoned (its process
// crashed before `globalTeardown` could run) rather than a genuinely concurrent `test:e2e` run,
// and gets swept up as OS-temp hygiene — see `sweepAbandonedLeftovers()`. This is generous
// relative to how long an e2e run actually takes. Note this age check is only ever used for
// hygiene, never for the reuse decision above (that's keyed on `RUN_ID` alone), so guessing
// wrong here can only leave a stale dir around a little longer — it can never cause a false
// reuse of another run's directory.
const ABANDONED_MARKER_MAX_AGE_MS = 2 * 60 * 60 * 1000;

let scratchDir: string | undefined;

export function getScratchDir(): string {
  if (scratchDir) return scratchDir;

  const marked = readMarker();
  if (marked && fs.existsSync(marked)) {
    scratchDir = marked;
    return scratchDir;
  }

  sweepAbandonedLeftovers();

  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "musicfoldercron-e2e-"));
  fs.cpSync(
    path.join(import.meta.dirname, "fixtures", "music-root"),
    path.join(scratchDir, "music-root"),
    { recursive: true }
  );
  fs.writeFileSync(getMarkerPath(), scratchDir, "utf-8");

  return scratchDir;
}

// Name of the sentinel file `globalSetup.ts` writes into the scratch dir once it's created, and
// that `scanLockHooks.ts` checks for before trusting the scan-lock mutex — see the doc comment on
// `getSentinelPath()` below for what this guards against.
const SCRATCH_DIR_SENTINEL_NAME = "scratch-dir-sentinel.json";

/**
 * Path to the sentinel file `globalSetup.ts` writes (once, containing this run's `E2E_RUN_ID`)
 * into the scratch dir after creating it. `Before("@scan-lock")` in `scanLockHooks.ts` checks for
 * this file's existence at ITS OWN `getScratchDir()` result before acquiring the scan-lock mutex:
 * if `globalSetup.ts`'s process and this worker's process ever disagreed on the scratch dir (e.g.
 * `E2E_RUN_ID` wasn't actually shared, so this worker fell back to its own pid-keyed directory —
 * see the `RUN_ID` doc comment above), this worker's `getScratchDir()` would resolve to a
 * directory `globalSetup.ts` never touched, and this file would be missing. That is exactly the
 * failure mode this guards against: a scan-lock mutex that silently provides zero real protection
 * because each worker is locking its own separate, uncontended lock file.
 */
export function getSentinelPath(): string {
  return path.join(getScratchDir(), SCRATCH_DIR_SENTINEL_NAME);
}

/** Deletes the scratch dir and its marker. Called once, from globalTeardown.ts, after the suite finishes. */
export function cleanupScratchDir(): void {
  fs.rmSync(getScratchDir(), { recursive: true, force: true });
  fs.rmSync(getMarkerPath(), { force: true });
  scratchDir = undefined;
}

function readMarker(): string | undefined {
  try {
    return fs.readFileSync(getMarkerPath(), "utf-8").trim();
  } catch {
    return undefined;
  }
}

/**
 * Removes scratch dirs + marker files left behind by previous invocations that crashed before
 * `globalTeardown` ran (so `cleanupScratchDir()` never fired for them). This is pure OS-temp
 * hygiene, not a safety mechanism — see the `RUN_ID` doc comment above for why leftover markers
 * can never be mistakenly reused regardless of whether this sweep runs or finds anything.
 */
function sweepAbandonedLeftovers(): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(os.tmpdir());
  } catch {
    return;
  }

  const now = Date.now();
  for (const entry of entries) {
    if (!entry.startsWith(MARKER_PREFIX) || !entry.endsWith(".txt")) continue;
    const otherMarkerPath = path.join(os.tmpdir(), entry);
    try {
      const stat = fs.statSync(otherMarkerPath);
      if (now - stat.mtimeMs < ABANDONED_MARKER_MAX_AGE_MS) continue;

      const leftoverDir = fs.readFileSync(otherMarkerPath, "utf-8").trim();
      if (leftoverDir) fs.rmSync(leftoverDir, { recursive: true, force: true });
      fs.rmSync(otherMarkerPath, { force: true });
    } catch {
      // Best-effort cleanup only; never let a sweep failure block the current run.
    }
  }
}
