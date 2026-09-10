import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
 * directory is itself already the suite's cross-process-shared coordination point. Stale-lock
 * reclaim is likewise made atomic: instead of a check-then-act `statSync`-then-`rmSync` (which two
 * waiters could both pass before either deletes), the stale dir is first `renameSync`'d to a
 * unique doomed path — at most one racing rename can succeed on a given source path, so only the
 * winner ever deletes it, and the loser's `ENOENT` just means "someone else already reclaimed it,
 * re-poll".
 *
 * Ownership-aware release (added after a real, reproduced lock-theft bug): a waiter's
 * `Before("@scan-lock")` hook runs inside the scenario's own test timeout, so under contention it
 * can time out WHILE STILL POLLING inside `acquireScanLock()` — it never actually acquired
 * anything. Playwright still runs the matching `After("@scan-lock")` hook regardless, which used
 * to call an unconditional `fs.rmSync` on the lock dir — deleting whatever lock dir currently
 * existed, including one legitimately held by a different, actively-running worker mid-scan. The
 * next waiter's `mkdirSync` then succeeded immediately, producing two genuinely concurrent
 * holders. `releaseScanLock()` now only deletes the lock dir if this process's own in-memory
 * token matches the on-disk `owner` file, so a release that was never a real acquisition — or a
 * release that raced a stale-lock reclaim by someone else — is a no-op instead of theft. See
 * scanLockHooks.ts for the matching fix (continuously extending the test's own timeout for as
 * long as it's legitimately still waiting, via `acquireScanLock()`'s `onWaitTick` callback, so
 * this fix doesn't just trade "steal the lock" for "look like a timeout failure when correctly
 * queued behind a legitimate long-held lock" — under this suite's own `--repeat-each` stress
 * runs, a single global mutex serializing 10+ scenario instances across 8 workers routinely
 * produces individual waits longer than one test's own default 30s timeout).
 */

const LOCK_DIR_NAME = "scan-mutex.lock";
const OWNER_FILE_NAME = "owner";
const POLL_INTERVAL_MS = 50;

// Safety valve only: if a lock holder crashed mid-scenario (leaving the lock dir behind
// forever), this bounds how long every other worker would otherwise wait forever. Comfortably
// longer than any single scenario in this suite (UI interactions + a handful of small fixture
// folders' worth of scanning) ever takes.
export const STALE_LOCK_MAX_AGE_MS = 60_000;

// How often a held lock's mtime is refreshed (see `startHeartbeat()`) so the staleness check
// above only ever fires for a genuinely crashed/abandoned holder, never a slow-but-alive one.
// Comfortably shorter than `STALE_LOCK_MAX_AGE_MS` so several heartbeats land before a legitimate
// holder could ever be mistaken for stale.
const HEARTBEAT_INTERVAL_MS = 5_000;

function lockPath(): string {
  return path.join(getScratchDir(), LOCK_DIR_NAME);
}

function ownerFilePath(dir: string): string {
  return path.join(dir, OWNER_FILE_NAME);
}

// This process's own record of "do I currently hold the lock, and under what token" — a single
// Playwright worker process runs one test (and therefore one acquire/release cycle) at a time, so
// there's never a concurrent second `acquireScanLock()` call within this same process to race
// against this module-level state.
let heldToken: string | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;

function startHeartbeat(dir: string): void {
  heartbeatTimer = setInterval(() => {
    try {
      const now = new Date();
      fs.utimesSync(dir, now, now);
    } catch {
      // Lock dir is gone (released, or reclaimed as stale by someone else) — nothing to refresh.
    }
  }, HEARTBEAT_INTERVAL_MS);
  // Never let this interval keep the worker process alive on its own.
  heartbeatTimer.unref();
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
}

/**
 * @param onWaitTick Invoked every poll interval (~`POLL_INTERVAL_MS`) while blocked on a
 * currently-held lock, with the total time waited so far. Lets a caller running inside its own
 * outer deadline (e.g. a Playwright test's `beforeEach` timeout) extend that deadline WHILE still
 * waiting — not just once acquisition finally succeeds — since under heavy contention (many
 * scenarios queued for one global mutex) the wait itself can exceed a single test's own timeout
 * budget before `acquireScanLock()` ever returns. See scanLockHooks.ts for the caller.
 */
export async function acquireScanLock(onWaitTick?: (waitedMs: number) => void): Promise<void> {
  const dir = lockPath();
  const start = Date.now();

  for (;;) {
    try {
      fs.mkdirSync(dir);
      const token = `${process.pid}-${randomUUID()}`;
      fs.writeFileSync(ownerFilePath(dir), token, "utf-8");
      heldToken = token;
      startHeartbeat(dir);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      let stat: fs.Stats | undefined;
      try {
        stat = fs.statSync(dir);
      } catch (statErr) {
        if ((statErr as NodeJS.ErrnoException).code !== "ENOENT") throw statErr;
        // Lock dir disappeared between our EEXIST and this stat (the holder just released it) —
        // just retry immediately, the next mkdirSync attempt will succeed.
      }

      if (stat && Date.now() - stat.mtimeMs > STALE_LOCK_MAX_AGE_MS) {
        const doomed = `${dir}.stale-${randomUUID()}`;
        try {
          fs.renameSync(dir, doomed);
        } catch (renameErr) {
          if ((renameErr as NodeJS.ErrnoException).code !== "ENOENT") throw renameErr;
          // Someone else already renamed/reclaimed it first — not our stale lock to delete
          // anymore. Fall through and re-poll; the next mkdirSync attempt will race normally.
          continue;
        }
        fs.rmSync(doomed, { recursive: true, force: true });
        continue;
      }

      onWaitTick?.(Date.now() - start);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

/**
 * Ownership-aware release. Deleting the lock dir unconditionally (the old behavior) let a
 * process that never actually finished acquiring the lock — e.g. a `Before("@scan-lock")` hook
 * whose `acquireScanLock()` call was still polling when the scenario's own 30s test timeout hit —
 * delete a lock dir currently owned by a DIFFERENT, actively-running holder once Playwright still
 * ran the matching `After("@scan-lock")` hook anyway. That let two holders run genuinely
 * concurrently. Now: only delete the lock dir if this process actually holds it (verified against
 * the on-disk owner token, not just this process's own belief that it does).
 */
export function releaseScanLock(): void {
  const token = heldToken;
  if (!token) return;

  const dir = lockPath();

  let onDiskOwner: string | undefined;
  try {
    onDiskOwner = fs.readFileSync(ownerFilePath(dir), "utf-8");
  } catch {
    // Owner file missing/unreadable — already cleaned up (or reclaimed as stale by someone
    // else). Not ours to delete anymore.
    stopHeartbeat();
    heldToken = undefined;
    return;
  }

  stopHeartbeat();
  heldToken = undefined;

  if (onDiskOwner !== token) return;

  fs.rmSync(dir, { recursive: true, force: true });
}
