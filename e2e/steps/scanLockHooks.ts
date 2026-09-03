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
 */

import { createBdd } from "playwright-bdd";
import { acquireScanLock, releaseScanLock } from "../support/scanLock.js";

const { Before, After } = createBdd();

Before("@scan-lock", async () => {
  await acquireScanLock();
});

After("@scan-lock", async () => {
  releaseScanLock();
});
