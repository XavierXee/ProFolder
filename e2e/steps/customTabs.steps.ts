/**
 * Step definitions for e2e/features/custom-tabs/*.feature.
 *
 * --- Hazard: custom tabs are a GLOBAL, shared-visibility list, not a per-scenario-scoped row ---
 *
 * Unlike most fixtures in this suite (a project folder, an audio file — see the doc comment atop
 * common.steps.ts), a custom tab is rendered in the tab bar for every scenario/spec file sharing
 * this run's one app/DB instance (see testEnv.ts) at once. `@scan-lock` (see scanLock.ts) is the
 * WRONG tool for the race this creates: custom tabs are plain CRUD on a per-scenario-scoped
 * table, not a scan-triggering or global-config-mutating action, so serializing against scans
 * would protect nothing real here. The actual hazard, and this file's precautions:
 *
 *   1. Every custom tab created below gets a random suffix (`randomUUID()`) appended to its
 *      given base name (see `createCustomTab`/`registerCreatedTab`) — so concurrent repeats of
 *      the SAME scenario across DIFFERENT Playwright workers (as `--repeat-each` produces) never
 *      collide over one shared tab-bar row. `@mode:serial` alone only serializes scenarios
 *      WITHIN one feature file/worker — it does nothing for `--repeat-each`'s cross-worker
 *      repeats of that same file, which is the actual scenario this suffix protects against.
 *   2. Every assertion below is scoped to a scenario's OWN resolved (suffixed) tab name — never
 *      the tab bar's total tab count or a tab's position among every tab currently open, since
 *      other concurrently-running scenarios/files may have their own custom tabs open at the
 *      same time.
 *   3. Every scenario cleans up any tab it created, either explicitly through the delete-confirm
 *      UI flow (also exercising that flow) or via the `After("@custom-tabs")` hook below, which
 *      deletes (directly through the API, tolerating an already-404 if the scenario's own steps
 *      already deleted it through the UI) anything left in the per-page registry.
 *   4. Every scenario in both feature files is tagged `@custom-tabs` (this hook's trigger) and
 *      `@mode:serial` (serializes scenarios within each file, since several of them share the
 *      tab bar and the "Create custom tab" modal) — but deliberately NOT `@scan-lock`.
 *
 * --- Hazard: the cascade scenario's shared fixture, and TWO dead ends found empirically ---
 *
 * The cascade scenario needs a file with a REAL project association (`projectId` set), which
 * only happens for a file inside a DAW-marker-classified folder (see projectDetector.ts) — but
 * every such fixture already in this repo before this task turned out, on inspection, to already
 * be under active tag/score management by another feature file's own scenario(s) with fixed
 * target values of their own (e.g. "Batch E2E Cascade Proj1"'s two files, "Projects E2E Cascade
 * Session"'s two files, "Batch E2E Projects Alpha/Bravo/Charlie"'s files), so reusing any of them
 * here would race those other files' writers. "Custom Tabs E2E Cascade/cascade-check.wav" (added
 * alongside this step file) is a dedicated fixture no other feature file touches, which rules out
 * *cross-file* contention — but `--repeat-each` still runs several instances of THIS OWN scenario
 * concurrently against that one shared fixture, and two different mutation mechanisms in this
 * app's UI turned out to be unsafe for that even with everyone targeting the identical value:
 *
 *   1. A *tag* edit: TagEditor.tsx's `computeAddTag` is a no-op (`onChange` never fires, so no
 *      PATCH is ever sent) once the tag is already present — which a fixed, non-randomized tag
 *      string deliberately invites once one concurrent repeat's write has landed. The step this
 *      would have reused (`files.steps.ts`'s "I type ... and press Enter") unconditionally awaits
 *      a PATCH response, so that no-op left it hanging until the test timeout (reproduced 2/3
 *      times under `--repeat-each=3`).
 *   2. A *score* edit via the obvious "click the target value" step: confirmed reproducing (via a
 *      captured Playwright trace showing the PATCH's own response body) that ScoreEditor.tsx's
 *      radio `onClick` TOGGLES an already-selected value OFF — `onChange(score === value ? null :
 *      value)` — rather than being a plain idempotent "set". So whichever concurrent repeat's
 *      click happens to land AFTER a sibling repeat's write already set the shared file to the
 *      target score toggles it back to null, discarding every repeat's work but the last one to
 *      NOT observe it as already-set.
 *
 * The fix below (`I ensure the file score is {int}`) is idempotent against #2: it checks the
 * file's CURRENT score via a direct, fresh API read (not the radio's `aria-checked` DOM attribute
 * or the panel's own React state — seeing this file's own doc comment further down for why even
 * that first, more obvious fix attempt still raced) and only clicks (then waits for a PATCH) when
 * the server-side score doesn't already match. This is intentionally a NEW, narrowly-scoped step
 * rather than a change to `files.steps.ts`'s existing (and, for every other scenario that uses it
 * against a scenario-exclusive fixture, entirely correct) "I set the file score to {int}" step.
 */

import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given, When, Then, After } = createBdd();

// --- Per-page registry of tabs created during a scenario --------------------------------------
//
// Playwright-bdd step definitions are plain functions with no shared "World" object across steps
// the way classic Cucumber has — the `page` fixture (stable across every step of one scenario,
// fresh per scenario) is what's used here instead to key a WeakMap, so a later step in the same
// scenario (or the `After` cleanup hook) can resolve a Gherkin-text base name (e.g. "Custom Tabs
// E2E Files Draft") back to the actual randomized full name/id a prior step generated.

type CreatedTab = { fullName: string; id: number; deletedViaUi: boolean };

const tabsByPage = new WeakMap<Page, Map<string, CreatedTab>>();

function registryFor(page: Page): Map<string, CreatedTab> {
  let map = tabsByPage.get(page);
  if (!map) {
    map = new Map();
    tabsByPage.set(page, map);
  }
  return map;
}

function resolveTabName(page: Page, baseName: string): string {
  const record = registryFor(page).get(baseName);
  if (!record) {
    throw new Error(
      `No custom tab registered for "${baseName}" — create it first with a step like ` +
        `"I create a custom tab of type ... named \"${baseName}\" ..."`
    );
  }
  return record.fullName;
}

// --- Create Custom Tab modal (CreateCustomTabModal.tsx) --------------------------------------

function createTabDialog(page: Page) {
  return page.getByRole("dialog", { name: "Create custom tab" });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Mirrors files.steps.ts's/projects.steps.ts's own `toggleFilterOption`, scoped to the modal
// dialog instead of the page-level FilterToolbar (both use the same MultiSelectDropdown
// component, not portaled, so a dialog-scoped locator finds the modal's own trigger/listbox —
// FilterBar.tsx and CreateCustomTabModal.tsx render the FilterToolbar's Status/Score/Tags
// triggers with the exact same accessible names in the background at the same time this modal is
// open, so scoping to the dialog is what disambiguates). Deliberately does NOT press Escape to
// close the dropdown afterward, unlike that sibling helper: CreateCustomTabModal.tsx's own
// `useEffect` also listens for a window-level Escape keydown to close the WHOLE modal (`if (e.key
// === "Escape" && open) onClose()`), so pressing Escape here closes the dropdown AND the modal
// itself in the same keystroke — confirmed empirically (the modal vanished, "Create" was never
// actually clicked, `page.waitForResponse` for the POST then hung until the test timeout).
// MultiSelectDropdown.tsx already closes its own listbox on any outside `mousedown` (see its own
// `onPointerDown` effect), so simply proceeding to the next click (another filter trigger, or
// "Create") closes it as a side effect, with no modal-closing keystroke needed.
async function toggleModalFilterOption(page: Page, triggerLabel: string, optionText: string): Promise<void> {
  const dialog = createTabDialog(page);
  await dialog.getByRole("button", { name: new RegExp(`^${escapeRegExp(triggerLabel)}`) }).click();
  const listbox = dialog.getByRole("listbox", { name: `Filter by ${triggerLabel.toLowerCase()}` });
  await listbox.locator("label", { hasText: new RegExp(`^${escapeRegExp(optionText)}$`) }).click();
}

async function createCustomTab(
  page: Page,
  options: {
    baseName: string;
    typeLabel: "Project Folders" | "Audio Files";
    statusFilter?: string;
    scoreFilter?: string;
    tagFilter?: string;
  }
): Promise<void> {
  const fullName = `${options.baseName} ${randomUUID()}`;

  await page.getByRole("button", { name: "Create custom tab" }).click();
  const dialog = createTabDialog(page);
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Name").fill(fullName);
  await dialog.getByRole("radio", { name: options.typeLabel }).check();
  if (options.statusFilter) await toggleModalFilterOption(page, "Status", options.statusFilter);
  if (options.scoreFilter) await toggleModalFilterOption(page, "Score", options.scoreFilter);
  if (options.tagFilter) await toggleModalFilterOption(page, "Tags", options.tagFilter);

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/custom-tabs"
    ),
    dialog.getByRole("button", { name: "Create" }).click(),
  ]);
  const created = (await response.json()) as { id: number };
  // CreateCustomTabModal.tsx now stays permanently mounted and slides off-screen via a CSS
  // transform on close (its own slide-animation fix), rather than
  // unmounting — so "closed" is asserted via the off-screen transform class, not DOM absence/
  // visibility (a `translate-x-full`-positioned element is still `visible` to Playwright, since
  // CSS transforms don't affect the visibility/display computation). Mirrors the same fix
  // already applied to CreateCustomTabModal.test.tsx/App.customTabs.test.tsx.
  await expect(dialog).toHaveClass(/translate-x-full/);

  registryFor(page).set(options.baseName, { fullName, id: created.id, deletedViaUi: false });
}

When(
  "I create a custom tab of type {string} named {string} with status filter {string}",
  async ({ page }, typeLabel: string, baseName: string, statusFilter: string) => {
    await createCustomTab(page, { baseName, typeLabel: typeLabel as "Project Folders" | "Audio Files", statusFilter });
  }
);

When(
  "I create a custom tab of type {string} named {string} with tag filter {string}",
  async ({ page }, typeLabel: string, baseName: string, tagFilter: string) => {
    await createCustomTab(page, { baseName, typeLabel: typeLabel as "Project Folders" | "Audio Files", tagFilter });
  }
);

When(
  "I create a custom tab of type {string} named {string} with no filter",
  async ({ page }, typeLabel: string, baseName: string) => {
    await createCustomTab(page, { baseName, typeLabel: typeLabel as "Project Folders" | "Audio Files" });
  }
);

// --- Tab bar (App.tsx's custom-tabs section) ---------------------------------------------------

function customTabButton(page: Page, fullName: string) {
  return page.getByRole("button", { name: fullName, exact: true });
}

Then("I should see my custom tab {string} in the tab bar", async ({ page }, baseName: string) => {
  const fullName = resolveTabName(page, baseName);
  await expect(customTabButton(page, fullName)).toBeVisible();
});

Then("I should not see my custom tab {string} in the tab bar", async ({ page }, baseName: string) => {
  const fullName = resolveTabName(page, baseName);
  await expect(customTabButton(page, fullName)).toHaveCount(0);
});

Then("my custom tab {string} should be the active tab", async ({ page }, baseName: string) => {
  const fullName = resolveTabName(page, baseName);
  await expect(customTabButton(page, fullName)).toHaveAttribute("aria-current", "true");
});

When("I switch to my custom tab {string}", async ({ page }, baseName: string) => {
  const fullName = resolveTabName(page, baseName);
  await customTabButton(page, fullName).click();
});

// --- Delete flow (the "×" button + DeleteTabConfirmDialog.tsx) ---------------------------------

function deleteConfirmDialog(page: Page) {
  return page.getByRole("dialog", { name: "Delete tab confirmation" });
}

When("I click the delete button for my custom tab {string}", async ({ page }, baseName: string) => {
  const fullName = resolveTabName(page, baseName);
  await page.getByRole("button", { name: `Delete tab ${fullName}` }).click();
});

Then("I should see the delete confirmation for my custom tab {string}", async ({ page }, baseName: string) => {
  const fullName = resolveTabName(page, baseName);
  const dialog = deleteConfirmDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(fullName);
});

When("I cancel the delete confirmation", async ({ page }) => {
  await deleteConfirmDialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(deleteConfirmDialog(page)).not.toBeVisible();
});

When("I confirm deleting my custom tab {string}", async ({ page }, baseName: string) => {
  const fullName = resolveTabName(page, baseName);
  // confirmTabDeletion defaults to true (see src/config/confirmationSettings.ts) on this
  // suite's fresh scratch DB, so DeleteTabConfirmDialog.tsx renders a "type the tab name to
  // confirm" input that must be filled before Delete is enabled — see
  // DeleteTabConfirmDialog.tsx/ConfirmTextInput.tsx. Filled defensively (only if present) so
  // this step still works unchanged if that setting is ever off.
  const confirmInput = deleteConfirmDialog(page).getByLabel(`Type "${fullName}" to confirm`);
  if ((await confirmInput.count()) > 0) {
    await confirmInput.fill(fullName);
  }
  await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === "DELETE" && new URL(res.url()).pathname.startsWith("/api/custom-tabs/")
    ),
    deleteConfirmDialog(page).getByRole("button", { name: "Delete" }).click(),
  ]);
  const record = registryFor(page).get(baseName);
  if (record) record.deletedViaUi = true;
});

// --- Idempotent score edit for the cascade scenario (see this file's top doc comment) ----------

function fileDetailPanel(page: Page) {
  return page.getByRole("dialog", { name: /^File detail: / });
}

// Checks the server's CURRENT score via a direct API read, not the radio's `aria-checked` DOM
// attribute or FileDetailPanel.tsx's own local `score` state, before deciding whether to click —
// confirmed necessary (not just theoretical) via a captured trace of a real failure: even a
// check-then-click sequence reading `aria-checked` right after opening the panel can still race,
// because FileDetailPanel.tsx's `score` state initializes to `null` on every mount and is only
// corrected to the real `file.score` by a `useEffect` keyed on `file?.id` (see FileDetailPanel.tsx)
// — a render/effect tick that can land AFTER the DOM read but BEFORE the click dispatches under
// heavy `--repeat-each` contention, so the click's own `onClick` closure ends up reading the
// CORRECTED (already-4) value and toggles it off, even though the read moments earlier saw
// "not yet checked". A direct, fresh API read has no such render-timing gap.
When("I ensure the file score is {int}", async ({ page, request }, value: number) => {
  const res = await request.get(`/api/files?search=${encodeURIComponent("cascade-check")}`);
  expect(res.ok(), `GET /api/files?search=cascade-check failed with status ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { files: { filename: string; score: number | null }[] };
  const match = body.files.find((f) => f.filename === "cascade-check.wav");
  if (!match) throw new Error(`No file named "cascade-check.wav" found via GET /api/files?search=...`);
  if (match.score === value) return;

  const dialog = fileDetailPanel(page);
  const radio = dialog.getByRole("radiogroup", { name: "Set score" }).getByRole("radio", { name: `${value} of 5` });
  await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === "PATCH" && new URL(res.url()).pathname.endsWith("/score")
    ),
    page.waitForResponse(
      (res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/projects"
    ),
    radio.click(),
  ]);
});

// --- Locked filter absence + live search/sort (FilterToolbar.tsx's `locked` prop) --------------

Then("I should not see a {string} filter control", async ({ page }, triggerLabel: string) => {
  // FileTable/ProjectsTable's sortable column headers can render a same-named button (e.g. the
  // "Score" sort header) alongside FilterToolbar's own Status/Score/Tags picker triggers, so an
  // unscoped name match would collide — aria-haspopup="listbox" alone used to be enough to
  // disambiguate (sort-header buttons carry no such attribute), but CreateCustomTabModal.tsx now
  // stays permanently mounted (its own slide-animation fix) and renders its
  // own identically-labeled, aria-haspopup="listbox" Status/Score/Tags pickers even while
  // closed/off-screen. Scope to FilterToolbar's own role="toolbar" landmark instead, which
  // CreateCustomTabModal's create-tab form never renders (see files.steps.ts's/projects.steps.ts's
  // toggleFilterOption, which hit and fixed this identical collision).
  const pickerButton = page.getByRole("toolbar", { name: "Filters" }).getByRole("button", { name: triggerLabel, exact: true });
  await expect(pickerButton).toHaveCount(0);
});

// The old FilterToolbar.tsx "Sort: Modified" toggle button is gone — every scenario in
// locked-filtering.feature that uses this step is against a Files-type custom tab (see
// CustomFilesTabPanel.tsx, which renders the same FileTable.tsx every other Files-tab scenario
// does), so this locates that table's "Modified" column-header sort button instead, mirroring the
// generic `sortColumnHeader`/`sortButton` helpers in common.steps.ts (see that file's doc comment
// for why the exact match is `"Sort by Modified"`, not just `"Modified"` — the `<th>`'s accessible
// name is inherited from its inner button's `aria-label`, not its visible text). Column headers
// use `aria-sort` ("ascending"/"descending"/"none"), not `aria-pressed` — there's no
// `aria-pressed` anywhere on a `SortTh` button.
function toolbarSortColumnHeader(page: Page) {
  return page.getByRole("columnheader", { name: "Sort by Modified", exact: true });
}

function toolbarSortButton(page: Page) {
  return toolbarSortColumnHeader(page).getByRole("button");
}

When("I click the custom tab sort button", async ({ page }) => {
  await toolbarSortButton(page).click();
});

Then("the custom tab sort button should indicate active sort", async ({ page }) => {
  await expect(toolbarSortColumnHeader(page)).not.toHaveAttribute("aria-sort", "none");
});

Then("the custom tab sort button should not indicate active sort", async ({ page }) => {
  await expect(toolbarSortColumnHeader(page)).toHaveAttribute("aria-sort", "none");
});

// Both CustomFilesTabPanel and CustomProjectsTabPanel pass the same "Search by filename or path"/
// "Search project folders" aria-labels their default-tab equivalents use (FilterBar.tsx /
// ProjectsFilterBar.tsx) — safe to match on the Files-tab one here since every scenario in
// locked-filtering.feature that uses this step is against a Files-type custom tab, and only one
// of the default/custom panels is ever mounted at a time (see App.tsx's tab-switch ternary).
Then("the custom tab search box should be empty", async ({ page }) => {
  await expect(page.getByLabel("Search by filename or path")).toHaveValue("");
});

// --- Cleanup: delete anything this scenario created and didn't already delete via the UI -------

After("@custom-tabs", async ({ page, request }) => {
  const registry = tabsByPage.get(page);
  if (!registry) return;

  for (const record of registry.values()) {
    if (record.deletedViaUi) continue;
    const res = await request.delete(`/api/custom-tabs/${record.id}`);
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`Cleanup failed: DELETE /api/custom-tabs/${record.id} returned ${res.status()}`);
    }
  }
});
