import path from "node:path";
import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";
import { getScratchDir } from "./e2e/support/testEnv.js";

// `npm run test:e2e`/`test:e2e:headed` already export a shared `E2E_RUN_ID` before invoking
// `bddgen && playwright test` (see package.json), so every process they spawn — including this
// config-loading process and every forked worker — agrees on it. But this config module can also
// be loaded directly (e.g. a bare `npx playwright test`), in which case `E2E_RUN_ID` is unset. Set
// it here, once, before `getScratchDir()` (below) or `webServer`/worker processes ever read it, so
// even a bare invocation gets a single shared id. This must run in THIS module (not deeper inside
// `testEnv.ts`) because Playwright workers are forked from this main process and inherit its
// `process.env` at fork time — setting it here, synchronously, at config-load time, is what
// guarantees every worker sees the same value rather than each computing its own. Without this,
// `getScratchDir()` falls back to keying its marker on `process.pid`, and since every worker is a
// distinct process with a distinct pid, each one silently resolves its own separate scratch dir —
// which `scanLock.ts` derives its cross-process mutex's lock-file path from, so disagreement here
// makes the mutex a silent no-op (see the doc comment on the `RUN_ID` fallback in `testEnv.ts`).
if (!process.env.E2E_RUN_ID) {
  process.env.E2E_RUN_ID = randomUUID();
}

const testDir = defineBddConfig({
  features: "e2e/features/**/*.feature",
  steps: "e2e/steps/**/*.ts",
  outputDir: "e2e/.features-gen",
});

// Built synchronously at config-load time so the scratch dir exists before `webServer` boots,
// and so `webServer.env`, `globalSetup.ts`, and `globalTeardown.ts` all refer to the exact same
// directory (see the memoization comment on `getScratchDir()` in `testEnv.ts`).
const scratchDir = getScratchDir();

export default defineConfig({
  testDir,
  globalSetup: "./e2e/support/globalSetup.ts",
  globalTeardown: "./e2e/support/globalTeardown.ts",
  fullyParallel: true,
  // On CI only: retry once to absorb load-dependent flakes on shared runners, and fail the run
  // if a stray `.only` would silently skip the rest of the suite.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    // Deliberately NOT the Playwright default of `!process.env.CI`. A developer may already
    // have `npm run dev` running against their real music library/database — always spinning
    // up (and failing loudly on a port conflict rather than silently attaching to) our own
    // isolated instance is what keeps this suite from ever touching real data.
    reuseExistingServer: false,
    env: {
      MUSIC_ROOT: path.join(scratchDir, "music-root"),
      DB_PATH: path.join(scratchDir, "library.db"),
    },
  },
});
