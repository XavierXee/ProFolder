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

import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given, When, Then } = createBdd();

Given("I open the app", async ({ page }) => {
  await page.goto("/");
});

// `exact: true` throughout this file's tab-name queries: the default substring match would
// otherwise also match the All Tabs panel's own "Go to tab {label}" button for the same tab (it
// stays mounted alongside the tab bar, just slid off-screen when closed — see
// TabListPanel.tsx's doc comment), resolving to two elements instead of one.
When("I switch to the {string} tab", async ({ page }, tabLabel: string) => {
  await page.getByRole("button", { name: tabLabel, exact: true }).click();
});

// Full browser reload (fresh mount, fresh fetch from the server) — used by detail-panel
// persistence scenarios (Task 4.5) to prove a save round-tripped to the DB, rather than just
// reflecting optimistic client-side state that was never actually sent/persisted.
When("I reload the page", async ({ page }) => {
  await page.reload();
});

Then("I should see the {string} tab", async ({ page }, tabLabel: string) => {
  await expect(page.getByRole("button", { name: tabLabel, exact: true })).toBeVisible();
});

Then("the {string} tab should be the active tab", async ({ page }, tabLabel: string) => {
  await expect(page.getByRole("button", { name: tabLabel, exact: true })).toHaveAttribute("aria-current", "true");
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
  // FilterToolbar.tsx reserves this label's width with an `aria-hidden="true"` sibling span
  // whose text is the same pattern with every digit run substituted to "999" (e.g.
  // "999 of 999 files") — a plain `page.getByText(...)` would resolve both spans and hit a
  // strict-mode violation. `getByRole`'s accessible-name computation excludes aria-hidden
  // text automatically (the convention used elsewhere in this suite, e.g. batchEdit.steps.ts/
  // projects.steps.ts's Sort button), but this label isn't inside a role-bearing element, so
  // exclude the aria-hidden span directly instead.
  const resultCount = page.locator('span:not([aria-hidden="true"])', { hasText: /^\d+ of \d+ (files|projects)$/ });
  await expect(resultCount).toBeVisible();
  const text = await resultCount.innerText();
  const total = Number(text.match(/^\d+ of (\d+) /)?.[1]);
  expect(total).toBeGreaterThan(0);
  await expect(page.getByText(/request failed/i)).toHaveCount(0);
});

// --- Column-header sorting (Task 5a.3, relocated here in Task 8) -------------------------------
//
// Both FileTable.tsx and ProjectsTable.tsx expose real, independently-sortable column headers
// (see SortTh usages in each — FileTable.tsx: `name`/"Track / File", `score`/"Score",
// `folder`/"Location", `modifiedAt`/"Modified"; ProjectsTable.tsx: `name`/"Project Folder",
// `score`/"Score", `modifiedAt`/"Modified") — the old Projects-only single hardcoded
// "Sort: Modified" toolbar button (FilterToolbar.tsx) has been fully removed, so these helpers and
// step defs are shared by both tabs' sorting scenarios rather than duplicated per tab. Each
// `<th scope="col">` gets the implicit ARIA `columnheader` role (it's a real semantic <table>).
//
// Its accessible name is NOT its visible text ("<label>", plus a trailing " ↑"/" ↓" once that
// column becomes the active sort) — confirmed via an `ariaSnapshot()` dump against a live page:
// the inner `<button>` has an explicit `aria-label="Sort by <label>"` (see SortTh in
// FileTable.tsx/ProjectsTable.tsx), which — per the accessible-name-from-content computation —
// is what the `<th>` inherits as ITS OWN name too, superseding the button's rendered text
// entirely. Critically, that `aria-label` never includes the sort-direction arrow (only the
// button's rendered *text* does, which `.toContainText()` below still reads correctly, since that
// checks DOM text content, not the accessible name) — so the header's accessible name is the
// constant, exact string `"Sort by <label>"` regardless of active/inactive state. Matching that
// full exact string (rather than a plain substring/prefix match on just `<label>`) is also what
// avoids a real collision confirmed by a strict-mode-violation failure: ProjectsTable.tsx's
// select-all-checkbox `<th>` has no text of its own, so its own accessible name is inherited from
// ITS checkbox's `aria-label="Select all visible project folders"` — which, case-insensitively,
// contains "Project Folder" as a substring (and even as a *prefix-anchored* match once "Sort by "
// is stripped), colliding with the Project Folder column's own SortTh. The exact `"Sort by
// <label>"` string never collides with that unrelated checkbox label.
function sortColumnHeader(page: Page, columnLabel: string) {
  return page.getByRole("columnheader", { name: `Sort by ${columnLabel}`, exact: true });
}

function sortButton(page: Page, columnLabel: string) {
  return sortColumnHeader(page, columnLabel).getByRole("button");
}

When("I click the {string} sort button", async ({ page }, columnLabel: string) => {
  await sortButton(page, columnLabel).click();
});

Then("the {string} sort button should indicate ascending order", async ({ page }, columnLabel: string) => {
  await expect(sortColumnHeader(page, columnLabel)).toHaveAttribute("aria-sort", "ascending");
  await expect(sortButton(page, columnLabel)).toContainText("↑");
});

Then("the {string} sort button should indicate descending order", async ({ page }, columnLabel: string) => {
  await expect(sortColumnHeader(page, columnLabel)).toHaveAttribute("aria-sort", "descending");
  await expect(sortButton(page, columnLabel)).toContainText("↓");
});
