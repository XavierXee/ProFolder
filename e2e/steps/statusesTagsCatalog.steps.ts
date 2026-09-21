/**
 * Step definitions for e2e/features/statuses-tags/catalog-crud.feature.
 *
 * --- Hazard: statuses and tags are a GLOBAL, shared-visibility catalog, not a per-scenario row ---
 *
 * Mirrors customTabs.steps.ts's own top doc comment almost exactly: a status or tag row created
 * below is visible to every scenario/spec file sharing this run's one app/DB instance at once.
 * `@scan-lock` is the wrong tool here — this is plain CRUD on independently-keyed rows, not scan/config-mutating state. The
 * precautions this file takes, mirroring customTabs.steps.ts's numbered list:
 *
 *   1. Every status/tag created below gets a random suffix (`randomUUID()`) appended to its given
 *      base name, so concurrent repeats of the SAME scenario across different Playwright workers
 *      (as `--repeat-each` produces) never collide over one shared catalog row or duplicate-name
 *      rejection.
 *   2. Every assertion is scoped to a scenario's OWN resolved (suffixed) name — never the panel's
 *      total status/tag count.
 *   3. Every scenario cleans up anything it created, either explicitly through the delete-confirm
 *      UI flow (also exercising that flow) or via the `After("@statuses-tags-catalog")` hook
 *      below, which deletes (directly through the API, tolerating an already-404) anything left
 *      in the per-page registries. Statuses are cleaned up by their stable `key` (immune to a
 *      rename changing the display name); tags are cleaned up by their current name (a tag has no
 *      separate stable id exposed to the client — its name IS its identity, see tags.ts's `:name`
 *      route param), so the tag registry always stores whatever the CURRENT name is after a
 *      rename.
 *
 * --- Hazard: one shared target file cannot referee two DIFFERENT concurrent status/tag writes ---
 *
 * Unlike a custom tab (each one is its own independent tab-bar row — many can coexist), a file's
 * `status` column and `tags` join rows are a single piece of shared mutable state. Two concurrent
 * repeats of "assign my uniquely-named status to this file" targeting the SAME physical fixture
 * file cannot both "win" — whichever write lands last determines what a subsequent read sees,
 * exactly the class of bug customTabs.steps.ts's own doc comment found empirically for a *shared*
 * score/tag target under `--repeat-each`. The fix applied here is the same one used for the
 * "Custom Tabs E2E Cascade" fixture: every scenario that assigns a status/tag to a real file gets
 * its OWN dedicated, scenario-exclusive fixture file ("Statuses Tags E2E Status Assign.wav",
 * "... Status Edit.wav", "... Tag Assign.wav", "... Tag Rename.wav" — see
 * e2e/support/fixtures/music-root/), so no two SCENARIOS ever race over the same file.
 *
 * This does NOT fully close the risk for `--repeat-each` running the SAME scenario concurrently in
 * multiple workers, since that would still mean two workers targeting the one dedicated file for
 * THAT scenario — a residual, documented limitation (see this project's Developer report for this
 * task): the assign-then-read-back checks that stay within one page's own optimistic React state
 * (immune to another worker's writes) are safe, but the delete-cascades-to-Unknown / rename-
 * cascades-onto-the-file checks require a server refetch of that shared file's row, which a
 * concurrent repeat's own write could race. `@mode:serial` fully protects the normal
 * `npm run test:e2e` invocation (one worker runs every scenario in this file sequentially); only
 * a deliberate `--repeat-each` stress run of this specific file has any residual exposure.
 */

import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { When, Then, After } = createBdd();

// --- Per-page registries --------------------------------------------------------------------

type CreatedStatus = { key: string; fullName: string; deletedViaUi: boolean };
type CreatedTag = { fullName: string; deletedViaUi: boolean };

const statusesByPage = new WeakMap<Page, Map<string, CreatedStatus>>();
const tagsByPage = new WeakMap<Page, Map<string, CreatedTag>>();
const lastCancelledStatusByPage = new WeakMap<Page, string>();
const lastCancelledTagByPage = new WeakMap<Page, string>();

function statusRegistryFor(page: Page): Map<string, CreatedStatus> {
  let map = statusesByPage.get(page);
  if (!map) {
    map = new Map();
    statusesByPage.set(page, map);
  }
  return map;
}

function tagRegistryFor(page: Page): Map<string, CreatedTag> {
  let map = tagsByPage.get(page);
  if (!map) {
    map = new Map();
    tagsByPage.set(page, map);
  }
  return map;
}

function resolveStatus(page: Page, baseName: string): CreatedStatus {
  const record = statusRegistryFor(page).get(baseName);
  if (!record) {
    throw new Error(
      `No status registered for "${baseName}" — create it first with "I create a new status named \"${baseName}\" ..."`
    );
  }
  return record;
}

function resolveTag(page: Page, baseName: string): CreatedTag {
  const record = tagRegistryFor(page).get(baseName);
  if (!record) {
    throw new Error(
      `No tag registered for "${baseName}" — create it first with "I create a new tag named \"${baseName}\""`
    );
  }
  return record;
}

// Exposed so other step-definition files (e.g. metrics.steps.ts) can resolve the actual,
// randomUUID()-suffixed name a "I create a new tag named ..." step produced, without needing to
// duplicate this file's registry/randomUUID machinery — the resolved name is needed verbatim to
// select the matching <option> in MetricsPanel.tsx's "New ... metric value" dropdown.
export function resolveTagFullName(page: Page, baseName: string): string {
  return resolveTag(page, baseName).fullName;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Statuses & Tags panel (TagsStatusesPanel.tsx, opened via the header button) ---------------

function statusesTagsButton(page: Page) {
  return page.getByRole("button", { name: "Statuses and tags" });
}

function tagsStatusesPanel(page: Page) {
  return page.getByRole("dialog", { name: "Statuses and tags" });
}

When("I open the statuses and tags panel", async ({ page }) => {
  await statusesTagsButton(page).click();
  await expect(tagsStatusesPanel(page)).toBeVisible();
});

// Idempotent: a prior step in the same scenario may already have closed the panel as a side
// effect (e.g. clicking a FilterToolbar picker trigger outside the panel counts as an "outside
// pointerdown" for TagsStatusesPanel.tsx's own auto-close listener), so this only clicks the
// explicit close button if the panel is still actually open.
When("I close the statuses and tags panel", async ({ page }) => {
  const closeBtn = page.getByRole("button", { name: "Close statuses and tags panel" });
  if ((await closeBtn.count()) > 0) {
    await closeBtn.click();
  }
  await expect(tagsStatusesPanel(page)).not.toBeVisible();
});

// --- Built-in Unknown (deliberately omitted from the panel) + seeded default statuses ----------
// (Task 1's migration seed). "Unknown" is a blank/default sentinel, not a real catalog row, and
// the panel intentionally never lists it (nothing to add/edit/delete/color for it) — see
// TagsStatusesPanel.tsx.

Then("I should not see the built-in Unknown status in the panel", async ({ page }) => {
  const panel = tagsStatusesPanel(page);
  await expect(panel.locator('[aria-label="Status: Unknown"]')).toHaveCount(0);
});

Then(
  "I should see the default status {string} with edit and delete controls in the panel",
  async ({ page }, label: string) => {
    const panel = tagsStatusesPanel(page);
    await expect(panel.locator(`[aria-label="Status: ${label}"]`)).toBeVisible();
    await expect(panel.getByRole("button", { name: `Edit status ${label}` })).toBeVisible();
    await expect(panel.getByRole("button", { name: `Delete status ${label}` })).toBeVisible();
  }
);

// --- Create status ------------------------------------------------------------------------------

When(
  "I create a new status named {string} with color {string}",
  async ({ page }, baseName: string, color: string) => {
    const fullName = `${baseName} ${randomUUID()}`;
    const panel = tagsStatusesPanel(page);

    await panel.getByRole("button", { name: "Add status", exact: true }).click();
    await panel.getByLabel("New status name").fill(fullName);
    await panel.getByLabel("New status color").fill(color);

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/statuses"
      ),
      panel.getByRole("button", { name: "Add", exact: true }).click(),
    ]);
    const created = (await response.json()) as { key: string; name: string };

    statusRegistryFor(page).set(baseName, { key: created.key, fullName, deletedViaUi: false });
  }
);

Then("I should see my status {string} in the panel", async ({ page }, baseName: string) => {
  const { fullName } = resolveStatus(page, baseName);
  await expect(tagsStatusesPanel(page).locator(`[aria-label="Status: ${fullName}"]`)).toBeVisible();
});

Then("I should not see my status {string} in the panel", async ({ page }, baseName: string) => {
  const { fullName } = resolveStatus(page, baseName);
  await expect(tagsStatusesPanel(page).locator(`[aria-label="Status: ${fullName}"]`)).toHaveCount(0);
});

// --- Cancelling an add-status flow --------------------------------------------------------------

When("I start creating a status named {string} then cancel", async ({ page }, baseName: string) => {
  const fullName = `${baseName} ${randomUUID()}`;
  const panel = tagsStatusesPanel(page);

  await panel.getByRole("button", { name: "Add status", exact: true }).click();
  await panel.getByLabel("New status name").fill(fullName);
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();

  lastCancelledStatusByPage.set(page, fullName);
});

Then("the cancelled status should not appear in the panel", async ({ page }) => {
  const fullName = lastCancelledStatusByPage.get(page);
  if (!fullName) {
    throw new Error('No cancelled status recorded — call "I start creating a status named ... then cancel" first');
  }
  await expect(tagsStatusesPanel(page).locator(`[aria-label="Status: ${fullName}"]`)).toHaveCount(0);
});

// --- Edit status name/color --------------------------------------------------------------------

When(
  "I rename my status {string} to {string} with color {string}",
  async ({ page }, baseName: string, newBaseName: string, newColor: string) => {
    const record = resolveStatus(page, baseName);
    const newFullName = `${newBaseName} ${randomUUID()}`;
    const panel = tagsStatusesPanel(page);

    await panel.getByRole("button", { name: `Edit status ${record.fullName}` }).click();
    await panel.getByLabel(`Edit name for ${record.fullName}`).fill(newFullName);
    await panel.getByLabel(`Edit color for ${record.fullName}`).fill(newColor);

    await Promise.all([
      page.waitForResponse(
        (res) => res.request().method() === "PATCH" && new URL(res.url()).pathname === `/api/statuses/${record.key}`
      ),
      panel.getByRole("button", { name: "Save", exact: true }).click(),
    ]);

    // Updated in place, keyed by the SAME baseName the scenario keeps using — later steps like
    // "I should see my status ... in the panel" resolve the CURRENT (post-rename) fullName, so
    // they only pass if the rename actually took effect, not just because the old name still
    // happens to be present.
    record.fullName = newFullName;
  }
);

// --- Delete status (typed-confirmation flow, DeleteStatusConfirmDialog.tsx) ---------------------

function deleteStatusConfirmDialog(page: Page) {
  return page.getByRole("dialog", { name: "Delete status confirmation" });
}

When("I click the delete button for my status {string}", async ({ page }, baseName: string) => {
  const { fullName } = resolveStatus(page, baseName);
  await tagsStatusesPanel(page)
    .getByRole("button", { name: `Delete status ${fullName}` })
    .click();
});

Then("I should see the delete confirmation for my status {string}", async ({ page }, baseName: string) => {
  const { fullName } = resolveStatus(page, baseName);
  const dialog = deleteStatusConfirmDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(fullName);
});

When("I cancel the delete status confirmation", async ({ page }) => {
  await deleteStatusConfirmDialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(deleteStatusConfirmDialog(page)).not.toBeVisible();
});

When("I confirm deleting my status {string}", async ({ page }, baseName: string) => {
  const record = resolveStatus(page, baseName);
  // confirmStatusDeletion defaults to true (see src/config/confirmationSettings.ts) on this
  // suite's fresh scratch DB, so the dialog renders a "type the name to confirm" input that must
  // be filled before Delete is enabled — filled defensively (only if present), mirroring
  // customTabs.steps.ts's identical convention.
  const dialog = deleteStatusConfirmDialog(page);
  const confirmInput = dialog.getByLabel(`Type "${record.fullName}" to confirm`);
  if ((await confirmInput.count()) > 0) {
    await confirmInput.fill(record.fullName);
  }
  await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === "DELETE" && new URL(res.url()).pathname.startsWith("/api/statuses/")
    ),
    // handleStatusDeleted (App.tsx) unconditionally calls refetch() (files) and refetchProjects()
    // after a successful delete — waiting for the files refetch here is what guarantees the
    // fixture file's reassigned-to-"unknown" status is already loaded into App.tsx's `files`
    // state by the time a later step re-opens that file's detail panel (which reads `status` off
    // the `files` array by id, not a live per-panel poll — see FileDetailPanel.tsx's
    // `useEffect(..., [file?.id])`, which only re-syncs local state when the panel is re-mounted
    // against a (possibly updated) file object, not on every render of the same file).
    page.waitForResponse((res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/files"),
    dialog.getByRole("button", { name: "Delete", exact: true }).click(),
  ]);
  record.deletedViaUi = true;
});

// --- Files tab Status filter dropdown (FilterToolbar.tsx / MultiSelectDropdown.tsx) -------------
//
// Scoped to the "Status" trigger specifically via `[aria-haspopup="listbox"]`, disambiguating
// from FileTable.tsx's own "Sort by Status"-shaped column headers — mirrors customTabs.steps.ts's
// "I should not see a {string} filter control" step's identical disambiguation rationale (no
// Status-labeled sortable column exists today, but this guards against a future collision the
// same way that step already does for other filter labels).

function statusFilterTrigger(page: Page) {
  // Scoped to FilterToolbar's own role="toolbar" landmark (docs/TODO.md item 140-147):
  // aria-haspopup="listbox" alone is no longer sufficient — CreateCustomTabModal.tsx stays
  // permanently mounted (its own slide-animation fix, item 25) and renders its own identically
  // named, aria-haspopup="listbox" Status picker even while closed/off-screen.
  return page.getByRole("toolbar", { name: "Filters" }).getByRole("button", { name: "Status", exact: true });
}

async function openStatusFilterListbox(page: Page) {
  await statusFilterTrigger(page).click();
  return page.getByRole("listbox", { name: "Filter by status" });
}

Then("I should see my status {string} as an option in the Files status filter", async ({ page }, baseName: string) => {
  const { fullName } = resolveStatus(page, baseName);
  const listbox = await openStatusFilterListbox(page);
  await expect(listbox.locator("label", { hasText: new RegExp(`^${escapeRegExp(fullName)}$`) })).toBeVisible();
  await page.keyboard.press("Escape");
});

Then(
  "I should not see my status {string} as an option in the Files status filter",
  async ({ page }, baseName: string) => {
    const { fullName } = resolveStatus(page, baseName);
    const listbox = await openStatusFilterListbox(page);
    await expect(listbox.locator("label", { hasText: new RegExp(`^${escapeRegExp(fullName)}$`) })).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
);

// --- File detail panel: assigning/reading a custom status (dynamic-name variants of the generic
// steps already in files.steps.ts, needed because the resolved full name isn't known until this
// scenario's own "I create a new status named ..." step ran) --------------------------------------

function fileDetailPanel(page: Page) {
  return page.getByRole("dialog", { name: /^File detail: / });
}

When("I set the file status to my status {string}", async ({ page }, baseName: string) => {
  const { fullName } = resolveStatus(page, baseName);
  const dialog = fileDetailPanel(page);
  await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === "PATCH" && new URL(res.url()).pathname.endsWith("/status")
    ),
    dialog.getByRole("group", { name: "Select status" }).getByRole("button", { name: fullName }).click(),
  ]);
});

Then("the file detail panel should show my status {string}", async ({ page }, baseName: string) => {
  const { fullName } = resolveStatus(page, baseName);
  await expect(fileDetailPanel(page).locator(`[aria-label="Status: ${fullName}"]`)).toBeVisible();
});

// docs/TODO.md item 148: the color half of a status rename/edit was never actually verified —
// every existing assertion checks the badge's aria-label (name propagation) only. StatusBadge.tsx
// sets its color via inline `color-mix(...)` style properties embedding the literal hex, so the
// raw `style` HTML attribute (not the CSSOM-normalized `element.style.*` getters, which a real
// browser may resolve into rgb()) is the one property guaranteed to still contain that literal
// hex string exactly as passed — checking it directly proves the new color actually reached the
// DOM without needing to compute the resulting color-mix() output.
Then("the file detail panel's status badge for {string} should have color {string}", async ({ page }, baseName: string, hex: string) => {
  const { fullName } = resolveStatus(page, baseName);
  const style = await fileDetailPanel(page).locator(`[aria-label="Status: ${fullName}"]`).getAttribute("style");
  expect(style).toContain(hex);
});

// --- Create tag -----------------------------------------------------------------------------------

When("I create a new tag named {string}", async ({ page }, baseName: string) => {
  const fullName = `${baseName} ${randomUUID()}`;
  const panel = tagsStatusesPanel(page);

  await panel.getByRole("button", { name: "Add tag", exact: true }).click();
  await panel.getByLabel("New tag name").fill(fullName);

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/tags"),
    panel.getByRole("button", { name: "Add", exact: true }).click(),
  ]);

  tagRegistryFor(page).set(baseName, { fullName, deletedViaUi: false });
});

Then("I should see my tag {string} in the panel", async ({ page }, baseName: string) => {
  const { fullName } = resolveTag(page, baseName);
  await expect(tagsStatusesPanel(page).getByText(fullName, { exact: true })).toBeVisible();
});

Then("I should not see my tag {string} in the panel", async ({ page }, baseName: string) => {
  const { fullName } = resolveTag(page, baseName);
  await expect(tagsStatusesPanel(page).getByText(fullName, { exact: true })).toHaveCount(0);
});

// --- Cancelling an add-tag flow ------------------------------------------------------------------

When("I start creating a tag named {string} then cancel", async ({ page }, baseName: string) => {
  const fullName = `${baseName} ${randomUUID()}`;
  const panel = tagsStatusesPanel(page);

  await panel.getByRole("button", { name: "Add tag", exact: true }).click();
  await panel.getByLabel("New tag name").fill(fullName);
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();

  lastCancelledTagByPage.set(page, fullName);
});

Then("the cancelled tag should not appear in the panel", async ({ page }) => {
  const fullName = lastCancelledTagByPage.get(page);
  if (!fullName) {
    throw new Error('No cancelled tag recorded — call "I start creating a tag named ... then cancel" first');
  }
  await expect(tagsStatusesPanel(page).getByText(fullName, { exact: true })).toHaveCount(0);
});

// --- Rename tag ------------------------------------------------------------------------------------

When("I rename my tag {string} to {string}", async ({ page }, baseName: string, newBaseName: string) => {
  const record = resolveTag(page, baseName);
  const newFullName = `${newBaseName} ${randomUUID()}`;
  const panel = tagsStatusesPanel(page);

  await panel.getByRole("button", { name: `Edit tag ${record.fullName}` }).click();
  await panel.getByLabel(`Rename tag ${record.fullName}`).fill(newFullName);

  await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === "PATCH" && new URL(res.url()).pathname.startsWith("/api/tags/")
    ),
    // onTagsChanged (App.tsx's handleTagCatalogChanged) unconditionally refetches files/projects
    // after a successful rename — needed so a later step that re-opens the file detail panel sees
    // the renamed tag (see the identical rationale on the status-delete step above).
    page.waitForResponse((res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/files"),
    panel.getByRole("button", { name: "Save", exact: true }).click(),
  ]);

  record.fullName = newFullName;
});

// --- Delete tag (typed-confirmation flow, DeleteCatalogTagConfirmDialog.tsx) ----------------------

function deleteTagConfirmDialog(page: Page) {
  return page.getByRole("dialog", { name: "Delete tag confirmation" });
}

When("I click the delete button for my tag {string}", async ({ page }, baseName: string) => {
  const { fullName } = resolveTag(page, baseName);
  await tagsStatusesPanel(page)
    .getByRole("button", { name: `Delete tag ${fullName}` })
    .click();
});

Then("I should see the delete confirmation for my tag {string}", async ({ page }, baseName: string) => {
  const { fullName } = resolveTag(page, baseName);
  const dialog = deleteTagConfirmDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(fullName);
});

When("I cancel the delete tag confirmation", async ({ page }) => {
  await deleteTagConfirmDialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(deleteTagConfirmDialog(page)).not.toBeVisible();
});

When("I confirm deleting my tag {string}", async ({ page }, baseName: string) => {
  const record = resolveTag(page, baseName);
  // confirmTagDeletion defaults to true (see src/config/confirmationSettings.ts), same
  // defensive-fill convention as the status-delete step above.
  const dialog = deleteTagConfirmDialog(page);
  const confirmInput = dialog.getByLabel(`Type "${record.fullName}" to confirm`);
  if ((await confirmInput.count()) > 0) {
    await confirmInput.fill(record.fullName);
  }
  await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === "DELETE" && new URL(res.url()).pathname.startsWith("/api/tags/")
    ),
    // See the identical rationale on the status-delete step above: onTagsChanged's refetch() must
    // land before a later step re-opens the file detail panel and expects the cascaded removal to
    // already be reflected.
    page.waitForResponse((res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/files"),
    dialog.getByRole("button", { name: "Delete", exact: true }).click(),
  ]);
  record.deletedViaUi = true;
});

// --- File detail panel: assigning/reading a custom tag (dynamic-name variant of files.steps.ts's
// generic tag-input steps, needed for the same reason as the status variants above) ---------------

When("I assign my tag {string} to the open file via its tag editor", async ({ page }, baseName: string) => {
  const { fullName } = resolveTag(page, baseName);
  const dialog = fileDetailPanel(page);
  const input = dialog.getByPlaceholder("Add tag, press Enter…");
  await input.fill(fullName);
  await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === "PATCH" && new URL(res.url()).pathname.endsWith("/tags")
    ),
    page.waitForResponse((res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/projects"),
    input.press("Enter"),
  ]);
});

Then("the file detail panel should show my tag {string}", async ({ page }, baseName: string) => {
  const { fullName } = resolveTag(page, baseName);
  await expect(fileDetailPanel(page).getByRole("button", { name: `Remove tag ${fullName}` })).toBeVisible();
});

Then("the file detail panel should not show my tag {string}", async ({ page }, baseName: string) => {
  const { fullName } = resolveTag(page, baseName);
  await expect(fileDetailPanel(page).getByRole("button", { name: `Remove tag ${fullName}` })).toHaveCount(0);
});

// --- Cleanup: delete anything this scenario created and didn't already delete via the UI ---------

After("@statuses-tags-catalog", async ({ page, request }) => {
  const statusRegistry = statusesByPage.get(page);
  if (statusRegistry) {
    for (const record of statusRegistry.values()) {
      if (record.deletedViaUi) continue;
      const res = await request.delete(`/api/statuses/${encodeURIComponent(record.key)}`);
      if (!res.ok() && res.status() !== 404) {
        throw new Error(`Cleanup failed: DELETE /api/statuses/${record.key} returned ${res.status()}`);
      }
    }
  }

  const tagRegistry = tagsByPage.get(page);
  if (tagRegistry) {
    for (const record of tagRegistry.values()) {
      if (record.deletedViaUi) continue;
      const res = await request.delete(`/api/tags/${encodeURIComponent(record.fullName)}`);
      if (!res.ok() && res.status() !== 404) {
        throw new Error(`Cleanup failed: DELETE /api/tags/${record.fullName} returned ${res.status()}`);
      }
    }
  }
});
