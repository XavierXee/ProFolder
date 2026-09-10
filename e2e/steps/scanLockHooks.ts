/**
 * Cross-file scan-configuration mutex — see the doc comment on scanLock.ts for the full
 * rationale (why `@mode:serial` alone doesn't prevent exclusion-toggles.feature's,
 * scan-settings.feature's, and root-path-control.feature's scenarios from racing each other
 * across worker processes).
 *
 * All three feature files tag every scenario `@scan-lock` (alongside their own `@mode:serial`, which
 * only serializes scenarios within that one file). These hooks acquire the mutex before any
 * `@scan-lock` scenario's first step runs and release it after its last step finishes — spanning
 * the *whole* scenario, not just its scan-triggering step, since the race is between one
 * scenario's entire toggle-then-scan sequence and another's.
 *
 * `Before("@scan-lock")` compiles to a Playwright `beforeEach`, which runs inside the scenario's
 * own test timeout — so time spent queued behind another scenario's held lock eats directly into
 * the budget the scenario's own steps need afterward. Worse, under this suite's own
 * `--repeat-each` stress runs, a single global mutex serializing many scenario instances across
 * a handful of workers can make an individual wait longer than one test's whole default 30s
 * timeout BEFORE `acquireScanLock()` ever returns — so extending the timeout only once
 * acquisition succeeds is too late; Playwright would have already killed the test mid-wait.
 * Instead, `acquireScanLock()`'s `onWaitTick` callback fires on every poll interval while still
 * waiting, and each tick extends the test's timeout to (original timeout + however long we've
 * waited so far), capped at `STALE_LOCK_MAX_AGE_MS` — so the deadline always stays just ahead of
 * real elapsed wait time for as long as the wait is legitimate, while a genuine deadlock still
 * eventually fails (at original timeout + `STALE_LOCK_MAX_AGE_MS`) rather than hanging
 * indefinitely. See the doc comment on `releaseScanLock()` in scanLock.ts for the lock-theft bug
 * this pairs with.
 */

import fs from "node:fs";
import { createBdd } from "playwright-bdd";
import { acquireScanLock, releaseScanLock, STALE_LOCK_MAX_AGE_MS } from "../support/scanLock.js";
import { getScratchDir, getSentinelPath } from "../support/testEnv.js";

const { Before, After } = createBdd();

Before("@scan-lock", async ({ $testInfo }) => {
  assertScratchDirSentinelPresent();

  const baseTimeout = $testInfo.timeout;

  await acquireScanLock((waitedMs) => {
    const extensionMs = Math.min(waitedMs, STALE_LOCK_MAX_AGE_MS);
    $testInfo.setTimeout(baseTimeout + extensionMs);
  });
});

/**
 * Guards against the scan-lock mutex silently providing zero real protection. The mutex's
 * lock-file path is derived from this worker's own `getScratchDir()` result (see scanLock.ts), so
 * if this worker's scratch dir doesn't actually match the one `globalSetup.ts` populated (and
 * stamped with a sentinel file — see `getSentinelPath()`'s doc comment in `testEnv.ts`), this
 * worker would happily acquire/release a lock file nobody else is contending for: every worker
 * "passes" while providing no real cross-process serialization. Fail loudly instead.
 */
function assertScratchDirSentinelPresent(): void {
  const sentinelPath = getSentinelPath();
  if (fs.existsSync(sentinelPath)) return;

  throw new Error(
    `scan-lock scratch dir mismatch — this worker's getScratchDir() (${getScratchDir()}) doesn't ` +
      `match globalSetup's scratch dir (no sentinel file found at ${sentinelPath}). This means ` +
      `E2E_RUN_ID wasn't shared correctly across processes, and the cross-process scan mutex is ` +
      `NOT actually protecting this run — refusing to proceed with a lock that provides no real ` +
      `protection. See the doc comments on getScratchDir()/getSentinelPath() in ` +
      `e2e/support/testEnv.ts.`
  );
}

After("@scan-lock", async () => {
  releaseScanLock();
});
