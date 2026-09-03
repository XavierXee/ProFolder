import { cleanupScratchDir } from "./testEnv.js";

/**
 * Runs once after the whole e2e suite finishes (see `globalTeardown` in playwright.config.ts).
 * Deletes the entire scratch dir created by `testEnv.ts` (fixture copy + throwaway db files),
 * so no test data or generated database is left behind on disk.
 */
export default async function globalTeardown(): Promise<void> {
  cleanupScratchDir();
}
