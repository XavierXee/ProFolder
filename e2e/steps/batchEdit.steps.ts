/**
 * Step definitions for BatchEditPanel.tsx — shared between the Projects tab (Task 6.2, this
 * task) and the Audio Files tab (Task 6.3, not yet written), since both tabs mount the exact
 * same component with only its `itemLabel`/`onApplyScore`/`onApplyTag` props swapped (see
 * App.tsx's two `<BatchEditPanel>` usages).
 *
 * Both panels are permanently mounted in the DOM at all times — only the `open` prop toggles
 * visibility via a CSS transform/opacity, the `role="dialog"` element itself is never
 * conditionally rendered (see BatchEditPanel.tsx) — the same "permanently mounted, disambiguated
 * only by accessible name" pattern ProjectDetailPanel.tsx/FileDetailPanel.tsx use (see the doc
 * comment atop projects.steps.ts's detail-panel section). So `page.getByRole("dialog", { name:
 * /^Batch edit/ })` alone is always ambiguous (two matches, regardless of which tab is active or
 * which panel is actually open) — the dialog's accessible name is `Batch edit ${itemLabel}s`
 * (BatchEditPanel.tsx), i.e. "Batch edit project folders" or "Batch edit audio files" (see
 * App.tsx's `itemLabel="project folder"` / `itemLabel="audio file"` props). Every step below
 * takes that accessible-name suffix ("project folders" / "audio files") as an explicit `kind`
 * parameter rather than hardcoding one tab, specifically so Task 6.3 can reuse these verbatim
 * for the Files tab instead of duplicating this whole file.
 *
 * The underlying "Batch Edit" trigger button (FilterToolbar.tsx), by contrast, is NOT ambiguous
 * and needs no `kind` parameter: only one tab's FilterToolbar is ever mounted at a time (App.tsx
 * renders ProjectsFilterBar/FilterBar behind an `activeTab === "projects" ? ... : ...` ternary,
 * never both at once), so there is always exactly one "Batch Edit" button in the DOM regardless
 * of which tab is active.
 *
 * Row-selection mechanics (checkbox toggle, header select-all) are deliberately NOT here — those
 * live in each tab's own step file (projects.steps.ts for this task), since they depend on that
 * tab's own table/row helpers (`projectRow` etc.) rather than on BatchEditPanel itself.
 */

import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { When, Then } = createBdd();

function batchEditButton(page: Page) {
  return page.getByRole("button", { name: /^Batch Edit/ });
}

function batchEditDialog(page: Page, kind: string) {
  return page.getByRole("dialog", { name: `Batch edit ${kind}` });
}

Then("the batch edit button should be enabled", async ({ page }) => {
  await expect(batchEditButton(page)).toBeEnabled();
});

Then("the batch edit button should be disabled", async ({ page }) => {
  await expect(batchEditButton(page)).toBeDisabled();
});

// Covers FilterToolbar.tsx's "(N)" selected-count suffix (e.g. "Batch Edit (3)") — the reserve
// span used to keep the button's width stable is `aria-hidden="true"`, so it's excluded from
// Playwright's accessible-name computation and doesn't interfere with this exact match.
Then("the batch edit button should read {string}", async ({ page }, label: string) => {
  await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
});

When("I open the {string} batch edit panel", async ({ page }, kind: string) => {
  await batchEditButton(page).click();
  await expect(batchEditDialog(page, kind)).toBeVisible();
});

When("I close the {string} batch edit panel", async ({ page }, kind: string) => {
  await batchEditDialog(page, kind).getByRole("button", { name: "Close panel" }).click();
});

function isPatchTo(page: Page, pathSuffix: string) {
  return page.waitForResponse(
    (res) => res.request().method() === "PATCH" && new URL(res.url()).pathname.endsWith(pathSuffix)
  );
}

function isProjectsRefetch(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/projects"
  );
}

function isFilesRefetch(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/files"
  );
}

// Score and tags are linked in both directions — App.tsx's handleBatchProjectScore/
// handleBatchProjectTag (batch-editing project folders) both unconditionally call refetchProjects()
// AND refetch() (the files list) since the edit cascades onto each selected project's files; the
// Files-tab equivalents (handleBatchFileScore/handleBatchFileTag, for Task 6.3) do the same in
// reverse — so waiting on both refetches here alongside the PATCH itself is safe and correct
// regardless of which tab's panel this is, and is what proves the frontend's
// refetch()-after-cascade wiring actually completes before a later step reads the *other* tab's
// table (see the Projects tab's equivalent reasoning on `isFilesRefetch` in projects.steps.ts).
When(
  "I set the batch score to {int} in the {string} batch edit panel",
  async ({ page }, value: number, kind: string) => {
    const dialog = batchEditDialog(page, kind);
    await Promise.all([
      isPatchTo(page, "/batch/score"),
      isProjectsRefetch(page),
      isFilesRefetch(page),
      dialog.getByRole("radiogroup", { name: "Set score" }).getByRole("radio", { name: `${value} of 5` }).click(),
    ]);
  }
);

When(
  "I add the batch tag {string} in the {string} batch edit panel",
  async ({ page }, tag: string, kind: string) => {
    const dialog = batchEditDialog(page, kind);
    const input = dialog.getByPlaceholder("Add tag, press Enter…");
    await input.fill(tag);
    await Promise.all([isPatchTo(page, "/batch/tags"), isProjectsRefetch(page), isFilesRefetch(page), input.press("Enter")]);
  }
);
