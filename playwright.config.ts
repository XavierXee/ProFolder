import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";
import { getScratchDir } from "./e2e/support/testEnv.js";

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
  reporter: "html",
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
