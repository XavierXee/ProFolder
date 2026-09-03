/**
 * Scenario-isolation convention (read before adding scenarios in Tasks 4+):
 *
 * This suite's `webServer` boots ONE app instance (and one scratch DB) for the entire
 * Playwright run — scenarios are NOT given a fresh app/DB each time, unlike vitest's
 * per-test isolation. That means:
 *
 *   - Every fixture (project folder, audio file, tag, etc.) any future scenario relies on
 *     must have a name/path that is unique to that scenario, so scenarios running in any
 *     order (or in parallel) never collide over the same row.
 *   - Step definitions must filter down to a scenario's own fixture(s) before asserting
 *     (e.g. by that unique name) — never assert a raw global count (like "total projects
 *     = N"), since other scenarios' fixtures are present in the same DB at the same time.
 *
 * This doesn't matter for the smoke test below, which only asserts on static UI chrome,
 * but must be followed by every scenario added after it.
 */

import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given, When, Then } = createBdd();

Given("I open the app", async ({ page }) => {
  await page.goto("/");
});

When("I switch to the {string} tab", async ({ page }, tabLabel: string) => {
  await page.getByRole("button", { name: tabLabel }).click();
});

// Full browser reload (fresh mount, fresh fetch from the server) — used by detail-panel
// persistence scenarios (Task 4.5) to prove a save round-tripped to the DB, rather than just
// reflecting optimistic client-side state that was never actually sent/persisted.
When("I reload the page", async ({ page }) => {
  await page.reload();
});

Then("I should see the {string} tab", async ({ page }, tabLabel: string) => {
  await expect(page.getByRole("button", { name: tabLabel })).toBeVisible();
});

Then("the {string} tab should be the active tab", async ({ page }, tabLabel: string) => {
  await expect(page.getByRole("button", { name: tabLabel })).toHaveAttribute("aria-current", "true");
});

// Backend-liveness + seed-scan check: the visible "N of M files/projects" result count only
// renders once a tab's initial fetch has settled (success or failure — see useAudioFiles.ts/
// useProjects.ts), and the app only renders visible error text when that fetch actually failed
// (see the `error &&` banner in App.tsx and the `Request failed: …` message in api/client.ts).
// So a rendered result count with no error text visible means the backend actually responded —
// this is what would have caught the API process crashing while Vite stayed up and looked
// "ready" to Playwright's webServer health check. The `M` total is additionally asserted
// non-zero (rather than just matching `\d+`, which a "0 of 0" empty DB would also satisfy) to
// prove `globalSetup.ts`'s seed scan actually populated the DB before this scenario ran.
Then("the {string} tab should finish loading without a backend error", async ({ page }, tabLabel: string) => {
  const resultCount = page.getByText(/^\d+ of \d+ (files|projects)$/);
  await expect(resultCount).toBeVisible();
  const text = await resultCount.innerText();
  const total = Number(text.match(/^\d+ of (\d+) /)?.[1]);
  expect(total).toBeGreaterThan(0);
  await expect(page.getByText(/request failed/i)).toHaveCount(0);
});
