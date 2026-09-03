import fs from "node:fs";
import path from "node:path";
import { getScratchDir } from "./testEnv.js";

/**
 * Cross-process mutex serializing every scenario that mutates suite-wide scan configuration
 * (`scan_exclusions` or the `excludeSamplesFolders`/`excludeBackupFolders` settings) and/or
 * triggers a real `POST /api/scan` mid-test.
 *
 * `@mode:serial` (playwright-bdd's `test.describe.configure({ mode: "serial" })`) only
 * guarantees ordering *within one feature file* — Playwright still happily runs two DIFFERENT
 * spec files' tests concurrently in separate worker processes. Once a second feature file
 * (scan-settings.feature, Task 7.2) started mutating this same global state and triggering its
 * own real scans mid-test — the same pattern exclusion-toggles.feature (Task 7.1) established —
 * that cross-file concurrency became observable and reproducible:
 *
 *   - Two full-root scans running genuinely concurrently on the same running server can race
 *     each other's diff-then-write (each computes its own "removed" set against a snapshot taken
 *     at ITS OWN start, then commits; a later-committing scan's snapshot can be stale relative to
 *     the other scan's just-applied changes, stomping them back to a wrong state).
 *   - The scan walk itself is async (multiple `await`s over `fs/promises` calls), so the
 *     single-threaded Node server can still interleave *other* requests — e.g. another
 *     scenario's `PUT /api/scan/exclusions` or `PUT /api/config/scan-settings` — into the gaps
 *     between those awaits, mid-scan.
 *
 * Confirmed empirically: `playwright test --grep "path-exclusion toggles|Settings panel"`
 * (exclusion-toggles.feature + scan-settings.feature together) failed intermittently — both at
 * an elevated `--workers=8` and at this suite's actual default worker count — with the same
 * signature each time: a file re-included and rescanned by one file's own scenario not showing
 * up, even though each file's own scenarios were already individually stable in isolation.
 * Locking only the "start a scan" step itself (an earlier attempt) was NOT sufficient to fix
 * this — the race is between a scenario's *entire* toggle-then-scan sequence and another
 * scenario's, not just between two scan clicks — so the lock is instead held for a whole
 * scenario's duration via the `@scan-lock`-tagged Before/After hooks in scanLockHooks.ts, applied
 * to every scenario in both files that mutates this global state.
 *
 * Implemented as a lockfile (`fs.mkdirSync`, atomic across processes) inside the shared scratch
 * dir rather than an in-memory lock, since Playwright workers are separate OS processes that
 * share no JS heap — see the doc comment on `getScratchDir()` in testEnv.ts for why that
 * directory is itself already the suite's cross-process-shared coordination point.
 */

const LOCK_DIR_NAME = "scan-mutex.lock";
const POLL_INTERVAL_MS = 50;

// Safety valve only: if a lock holder crashed mid-scenario (leaving the lock dir behind
// forever), this bounds how long every other worker would otherwise wait forever. Comfortably
// longer than any single scenario in this suite (UI interactions + a handful of small fixture
// folders' worth of scanning) ever takes.
const STALE_LOCK_MAX_AGE_MS = 60_000;

function lockPath(): string {
  return path.join(getScratchDir(), LOCK_DIR_NAME);
}

export async function acquireScanLock(): Promise<void> {
  const dir = lockPath();

  for (;;) {
    try {
      fs.mkdirSync(dir);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      try {
        const age = Date.now() - fs.statSync(dir).mtimeMs;
        if (age > STALE_LOCK_MAX_AGE_MS) {
          fs.rmSync(dir, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Lock dir disappeared between our EEXIST and this stat (the holder just released it) —
        // just retry immediately, the next mkdirSync attempt will succeed.
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

export function releaseScanLock(): void {
  fs.rmSync(lockPath(), { recursive: true, force: true });
}
