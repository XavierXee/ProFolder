import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import {
  SHOWCASE_DB_PATH,
  SHOWCASE_MUSIC_ROOT,
  SHOWCASE_OUTPUT_DIR,
  buildShowcaseLibrary,
} from "./e2e/showcase/showcaseLibrary.js";

/**
 * Feature showcase recording — NOT part of the e2e test plan (`playwright.config.ts` only runs
 * the playwright-bdd features). Run with `npm run showcase`: drives the app slowly through every
 * major feature in one sequential walkthrough and saves the video to
 * `showcase-output/showcase.webm`.
 */

const VIEWPORT = { width: 1440, height: 900 };

// This config module is evaluated again inside each worker process; only the main process
// (which boots `webServer` below) should regenerate the library, or a worker would wipe the
// database out from under the running server.
if (!process.env.SHOWCASE_LIBRARY_READY) {
  buildShowcaseLibrary();
  process.env.SHOWCASE_LIBRARY_READY = "1";
}

export default defineConfig({
  testDir: "./e2e/showcase",
  testMatch: "*.showcase.ts",
  outputDir: path.join(SHOWCASE_OUTPUT_DIR, "test-results"),
  globalSetup: "./e2e/showcase/globalSetup.ts",
  globalTeardown: "./e2e/showcase/globalTeardown.ts",
  workers: 1,
  retries: 0,
  timeout: 20 * 60 * 1000,
  reporter: "list",
  expect: { timeout: 20_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173",
    viewport: VIEWPORT,
    video: { mode: "on", size: VIEWPORT },
    launchOptions: { slowMo: 120 },
    // Fail fast with the offending step named, instead of hanging until the 20-minute test timeout.
    actionTimeout: 20_000,
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    // Same reasoning as playwright.config.ts: never attach to a developer's running instance,
    // which could be pointed at their real library.
    reuseExistingServer: false,
    env: {
      MUSIC_ROOT: SHOWCASE_MUSIC_ROOT,
      DB_PATH: SHOWCASE_DB_PATH,
    },
  },
});
