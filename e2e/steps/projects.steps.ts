/**
 * Step definitions for e2e/features/projects-tab/filtering.feature.
 *
 * Precondition seeding (status/score/tags on a fixture project) goes straight through the API
 * via PATCH calls (see the `Given "project ... has status ..."` step below) rather than the
 * UI's click-to-edit path. This is a
 * deliberate architecture decision, not a shortcut: the click-to-edit path itself is exercised
 * by the (separate) detail-panel scenarios, and API-seeding keeps these filtering scenarios
 * fast and focused on filter *behavior*, not on how status/score/tags get edited. Each fixture's
 * `:id` is resolved via `GET /api/projects?search=<name>` first, since the UI never surfaces a
 * project's id directly and PATCH routes are id-keyed (see src/api/routes/projects.ts).
 */

import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given, When, Then } = createBdd();

async function findProjectIdByName(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.get(`/api/projects?search=${encodeURIComponent(name)}`);
  expect(response.ok(), `GET /api/projects?search=${name} failed with status ${response.status()}`).toBeTruthy();

  const body = (await response.json()) as { projects: { id: string; name: string }[] };
  const match = body.projects.find((p) => p.name === name);
  if (!match) {
    throw new Error(
      `No project named "${name}" found via GET /api/projects?search=... (results: ${body.projects
        .map((p) => p.name)
        .join(", ")})`
    );
  }
  return match.id;
}

function parseTagsCsv(tagsCsv: string): string[] {
  return tagsCsv
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

Given(
  "project {string} has status {string}, score {int}, and tags {string}",
  async ({ request }, name: string, status: string, score: number, tagsCsv: string) => {
    const id = await findProjectIdByName(request, name);
    const tags = parseTagsCsv(tagsCsv);

    const statusRes = await request.patch(`/api/projects/${encodeURIComponent(id)}/status`, { data: { status } });
    expect(statusRes.ok(), `PATCH /api/projects/${id}/status failed with status ${statusRes.status()}`).toBeTruthy();

    const scoreRes = await request.patch(`/api/projects/${encodeURIComponent(id)}/score`, { data: { score } });
    expect(scoreRes.ok(), `PATCH /api/projects/${id}/score failed with status ${scoreRes.status()}`).toBeTruthy();

    const tagsRes = await request.patch(`/api/projects/${encodeURIComponent(id)}/tags`, { data: { tags } });
    expect(tagsRes.ok(), `PATCH /api/projects/${id}/tags failed with status ${tagsRes.status()}`).toBeTruthy();
  }
);

// Score-only reset, no status/tags touched — used by the batch-edit scenarios (Task 6.2) to
// guarantee a fixture starts unscored before a scenario asserts "stays unscored"/"now scored",
// since these fixtures are shared across every scenario in batch-edit.feature and Playwright
// gives no ordering guarantee between them. `null` (not an {int}) means this can't reuse the
// combined status/score/tags step above, which requires a Cucumber {int}.
Given("project {string} has no score", async ({ request }, name: string) => {
  const id = await findProjectIdByName(request, name);
  const scoreRes = await request.patch(`/api/projects/${encodeURIComponent(id)}/score`, { data: { score: null } });
  expect(scoreRes.ok(), `PATCH /api/projects/${id}/score failed with status ${scoreRes.status()}`).toBeTruthy();
});

// Tags-only variant (no status/score touched) — used by the detail-panel tag-suggestion scenario
// to seed a tag into the global tag dictionary (the `tags` table row survives even after it's
// removed from this project again, since removal only deletes the `project_tags` join row — see
// `setTags` in projectRepository.ts) without mutating this project's own status/score, which a
// concurrently-running status/score scenario against the same fixture project may depend on.
Given("project {string} has tags {string}", async ({ request }, name: string, tagsCsv: string) => {
  const id = await findProjectIdByName(request, name);
  const tagsRes = await request.patch(`/api/projects/${encodeURIComponent(id)}/tags`, {
    data: { tags: parseTagsCsv(tagsCsv) },
  });
  expect(tagsRes.ok(), `PATCH /api/projects/${id}/tags failed with status ${tagsRes.status()}`).toBeTruthy();
});

// FilterToolbar.tsx debounces the search input 250ms before calling onChange (which is what
// actually fires the filtered fetch AND, per handleProjectsFilterChange in App.tsx, resets
// selectedProjectIds to empty) — waiting for that debounced fetch to actually land, rather than
// just filling the input and moving on, is required by the batch-edit scenarios (Task 6.2): a
// subsequent row-checkbox click that happens to land inside that 250ms window would otherwise get
// silently wiped out the instant the debounce finally fires and calls handleProjectsFilterChange.
//
// Skipped entirely when the box already holds this exact term (e.g. a scenario searching the
// same term twice, once before and once after some other action — see the reverse-cascade
// scenario in files-tab/detail-panel-status-tags-score.feature): FilterToolbar.tsx's own debounce
// only calls `onChange` when the typed value differs from what's already applied, and — since
// React bails out of re-rendering (and therefore never re-runs that debounce effect) for a
// `setState` call with a value that's `Object.is`-equal to the current one — re-`fill()`ing the
// exact same string never dispatches a *new* filtered fetch to wait for at all.
When("I search projects for {string}", async ({ page }, term: string) => {
  const input = page.getByLabel("Search project folders");
  if ((await input.inputValue()) === term) return;

  await Promise.all([
    page.waitForResponse((res) => {
      if (res.request().method() !== "GET") return false;
      const url = new URL(res.url());
      return url.pathname === "/api/projects" && url.searchParams.get("search") === term;
    }),
    input.fill(term),
  ]);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Opens a FilterToolbar MultiSelectDropdown (Status/Score/Tags) and toggles one option by its
 * exact visible label, then closes the dropdown again (Escape) so it doesn't obscure whatever
 * the next step needs to interact with. */
async function toggleFilterOption(page: Page, triggerLabel: string, optionText: string): Promise<void> {
  // The trigger's accessible name is `${triggerLabel}` when nothing is selected, or
  // `${triggerLabel} (N)` once N options are selected (see FilterToolbar.tsx) — match the prefix.
  // Scoped to FilterToolbar's own role="toolbar" landmark: an
  // unscoped name match on "Status" collides with the header's "Statuses and tags" button
  // (also starts with "Status"), and aria-haspopup="listbox" alone is no longer sufficient
  // either — CreateCustomTabModal.tsx stays permanently mounted since its own slide-animation
  // fix and renders its own same-named Status/Score/Tags MultiSelectDropdown triggers
  // even while closed/off-screen. FilterToolbar is the only role="toolbar" landmark in the page,
  // so scoping to it excludes both collisions at once.
  const trigger = page
    .getByRole("toolbar", { name: "Filters" })
    .getByRole("button", { name: new RegExp(`^${escapeRegExp(triggerLabel)}`) });
  await trigger.click();

  const listbox = page.getByRole("listbox", { name: `Filter by ${triggerLabel.toLowerCase()}` });
  await listbox.locator("label", { hasText: new RegExp(`^${escapeRegExp(optionText)}$`) }).click();

  await page.keyboard.press("Escape");
}

When("I filter projects by status {string}", async ({ page }, statusLabel: string) => {
  await toggleFilterOption(page, "Status", statusLabel);
});

When("I filter projects by score {string}", async ({ page }, scoreLabel: string) => {
  await toggleFilterOption(page, "Score", scoreLabel);
});

When("I filter projects by tag {string}", async ({ page }, tag: string) => {
  await toggleFilterOption(page, "Tags", tag);
});

When("I clear all project filters", async ({ page }) => {
  await page.getByRole("button", { name: "Clear all filters" }).click();
});

function projectsTable(page: Page) {
  return page.getByRole("table", { name: "Project folders" });
}

function projectRow(page: Page, name: string) {
  return projectsTable(page).locator("tbody tr", { hasText: name });
}

Then("I should see project {string} in the table", async ({ page }, name: string) => {
  await expect(projectRow(page, name)).toHaveCount(1);
});

Then("I should not see project {string} in the table", async ({ page }, name: string) => {
  await expect(projectRow(page, name)).toHaveCount(0);
});

// Every "Projects E2E ..." fixture folder under e2e/support/fixtures/music-root/ (see Task 4.2).
// Cascade Session, DetailPanel Session, and Sort Oldest/Middle/Newest are reserved for other,
// not-yet-written Task 4 sub-tasks and currently sit at scan defaults (unseeded), so they don't
// match any filter in this file today — but nothing enforces that going forward. Listing every
// fixture here (rather than trusting a broad "Projects E2E" search + row count to only ever catch
// this task's own fixtures) lets "only these projects" assert absence by *name*, so a future task
// that seeds one of the reserved fixtures to match this task's filter criteria produces a specific
// "unexpected fixture appeared" failure pointing at the actual cause, not a generic count mismatch.
const ALL_PROJECTS_E2E_FIXTURES = [
  "Projects E2E Alpha Sessions",
  "Projects E2E Beta Session",
  "Projects E2E Cascade Session",
  "Projects E2E Delta Untouched",
  "Projects E2E DetailPanel Session",
  "Projects E2E Gamma Idea",
  "Projects E2E Sort Middle",
  "Projects E2E Sort Newest",
  "Projects E2E Sort Oldest",
  // "Projects E2E ScoreSort Low/Mid/High" — Task 8's dedicated fixtures for the Score-column
  // sorting scenarios (see projects-tab/sorting.feature): score isn't scan-derived, so unlike the
  // "Sort Oldest/Middle/Newest" mtime-stamped fixtures above, these get their scores set at
  // runtime via the existing "project ... has status ..., score ..." step instead.
  "Projects E2E ScoreSort Low",
  "Projects E2E ScoreSort Mid",
  "Projects E2E ScoreSort High",
  // "Batch E2E Projects ..." — Task 6.2's 3 batch-edit fixtures (see batch-edit.feature).
  "Batch E2E Projects Alpha",
  "Batch E2E Projects Bravo",
  "Batch E2E Projects Charlie",
  // "Batch E2E Cascade Proj1/Proj2" — Task 6.4's cross-view batch cascade fixtures (see
  // e2e/features/files-tab/batch-edit-cascade.feature). Proj1 has two files
  // (cascade-proj1-take1.wav, cascade-proj1-take2.wav); Proj2 has one (cascade-proj2-take1.wav).
  "Batch E2E Cascade Proj1",
  "Batch E2E Cascade Proj2",
  // "Scanning E2E Exclusion Toggle" — Task 7.1's scan-settings-panel fixture (see
  // e2e/features/scanning-settings/exclusion-toggles.feature). It's a plain folder with no DAW
  // marker, but the scanner registers every visited folder as a project row regardless of DAW
  // classification (see the `for (const dir of directories)` loop in scanner.ts), so it does show
  // up here too even though this task's own scenarios only ever assert against it through the
  // Audio Files tab.
  "Scanning E2E Exclusion Toggle",
  // "Scanning E2E Settings" and its two children "Scanning E2E Settings/Samples" /
  // "Scanning E2E Settings/Backup" — Task 7.2's fixtures for the "Settings" panel's name-based
  // exclusion toggles (see e2e/features/scanning-settings/scan-settings.feature). The parent has
  // no DAW marker itself, so it's never classified as a project and its children aren't treated
  // as "inside a project" either (see the `findProjectRoot` skip in scanner.ts) — all three get
  // their own project row once scanned. The parent is present from the very first seed scan
  // (never excluded by either toggle); the two children only appear once their own toggle is off.
  // Each project row's path div renders the fixture's full absolute filesystem path, so matching
  // on the relative-path substring below (real "/" separator, not FileRow.tsx's " / ") finds it
  // regardless of scratch-dir prefix.
  "Scanning E2E Settings",
  "Scanning E2E Settings/Samples",
  "Scanning E2E Settings/Backup",
  // "Scanning E2E Settings/Stems" — the "Exclude folders by pattern" scenario's own fixture
  // (same .feature file). Unlike Samples/Backup, this toggle defaults OFF, so this one is
  // present from the very first seed scan and only disappears while its own scenario runs.
  "Scanning E2E Settings/Stems",
  // "File Ops E2E Picker Destination" — Task 12's Copy/Move/Delete destination-picker fixture
  // (see e2e/features/file-ops/destination-picker.feature / cancel.feature). Has no DAW marker,
  // but every visited folder gets its own project row regardless of DAW classification (same
  // rationale as "Scanning E2E Exclusion Toggle" above) — this folder is only ever read (never
  // mutated) by its scenarios, so it's stable for the whole suite run.
  "File Ops E2E Picker Destination",
  // "File Ops E2E Copy Destination" / "File Ops E2E Move Destination" — copy.feature's and
  // move.feature's own destination folders (each a plain, no-DAW-marker folder holding an
  // untouched "keep.wav" placeholder, same convention as "File Ops E2E Picker Destination"
  // above). Neither scenario ever asserts anything about these folders' own project row — listed
  // here only so a stray leak into another scenario's "only these projects" check is caught by
  // name, same rationale as every other entry in this table.
  "File Ops E2E Copy Destination",
  "File Ops E2E Move Destination",
  // "File Ops E2E Project Move Source" / "File Ops E2E Project Move Destination" —
  // project-move.feature's own fixtures (see that file's doc comment). "Project Move Source" has
  // a real Ableton (.als) marker and one audio file inside it ("File Ops E2E Project Track.wav",
  // registered in ALL_FILES_E2E_FIXTURES above); it's the project this task's scenario moves. Its
  // OWN row's id/path is exclusive to this scenario and physically rekeyed by the move (a one-shot
  // mutation, never restored — same convention as every other mutating scenario in this
  // directory), so — unlike every other name in this list, which stays fixed for the whole suite
  // run — the row this name matches will, after project-move.feature's scenario runs, actually be
  // found nested under "File Ops E2E Project Move Destination/" instead of at the top level (see
  // that .feature file's own doc comment for why a plain substring match still finds it either
  // way). "Project Move Destination" is the plain, no-DAW-marker destination folder (with its own
  // untouched "keep.wav" placeholder) the source project is moved into.
  "File Ops E2E Project Move Source",
  "File Ops E2E Project Move Destination",
  // "loose-exports" and "Smoke Test Project" — Task 1's inert smoke-scaffolding fixtures (see
  // ALL_FILES_E2E_FIXTURES's own note on "loose-exports/silence-stub.wav"). Both get their own
  // project row like any other visited folder (same rationale as "Scanning E2E Exclusion Toggle"
  // above); previously untracked in this table.
  "loose-exports",
  "Smoke Test Project",
];

// Asserts the visible row set is *exactly* the given names — every listed name has a row, and
// every other known "Projects E2E ..." fixture (this task's own untouched fixtures plus the ones
// reserved for other Task 4 sub-tasks) explicitly does not. Safe to use whenever a scenario's own
// filters (search/status/score/tag) are expected to narrow the whole scratch DB down to just its
// own fixtures.
Then("I should see only these projects in the table: {string}", async ({ page }, namesCsv: string) => {
  const names = namesCsv.split(",").map((n) => n.trim());

  for (const name of names) {
    await expect(projectRow(page, name)).toHaveCount(1);
  }

  const unexpected = ALL_PROJECTS_E2E_FIXTURES.filter((fixture) => !names.includes(fixture));
  for (const name of unexpected) {
    await expect(projectRow(page, name), `unexpected fixture "${name}" appeared in the table`).toHaveCount(0);
  }
});

// Order-sensitive companion to "I should see only these projects in the table: ...": filters the
// table's visible rows down to just the given (expected) names before comparing sequence, so
// other fixtures that might incidentally be visible (e.g. if a future fixture's name happens to
// also match the scenario's search term) don't break the order assertion — only relative order
// among the named projects is asserted. Wrapped in `expect(...).toPass()` since the table updates
// asynchronously after a sort click (new API request + re-render), so the first read may briefly
// still reflect the pre-click order.
Then("I should see these projects in this order: {string}", async ({ page }, namesCsv: string) => {
  const expectedOrder = namesCsv.split(",").map((n) => n.trim());

  await expect(async () => {
    const rowTexts = await projectsTable(page).locator("tbody tr").allInnerTexts();
    const actualOrder = rowTexts
      .map((text) => expectedOrder.find((name) => text.includes(name)))
      .filter((name): name is string => name !== undefined);
    expect(actualOrder).toEqual(expectedOrder);
  }).toPass();
});

// ProjectsTable.tsx picks between two empty-result messages based on whether a content filter
// (search/status/score/tag) is currently active, not off the filtered `total` alone (`total`
// is already the filtered count, so `total === 0` can't distinguish
// "empty library" from "filtered to zero"). A search matching zero projects IS an active filter,
// so "No folders match your filters." is what renders here.
Then("I should see the projects empty-results message", async ({ page }) => {
  await expect(page.getByText("No folders match your filters.")).toBeVisible();
});

// ProjectsFilterBar.tsx's `resultLabel`, set in App.tsx to `${projects.length} of ${projectsTotal}
// projects` — the current page's row count over the filtered total.
Then("I should see the project result count {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
});

// --- Detail panel: status/tags/score edit-and-persist scenarios (Task 4.5) -------------------
//
// ProjectDetailPanel.tsx's `role="dialog"` wrapper is permanently mounted (only the content
// inside is conditionally rendered on `project`), and FileDetailPanel.tsx mounts its own,
// separate `role="dialog"` wrapper the same way — so `page.getByRole("dialog")` alone is always
// ambiguous (two matches) regardless of which item, if any, is actually selected. The dialog's
// accessible name is what actually distinguishes them: it's the generic "Folder detail" when
// closed and "Folder detail: <project name>" once a project is selected (see the `aria-label`
// in ProjectDetailPanel.tsx) — matching on that ": " suffix is what scopes every step below to
// "the Project Folders detail panel, currently open."

function folderDetailPanel(page: Page) {
  return page.getByRole("dialog", { name: /^Folder detail: / });
}

When("I open the folder detail panel for {string}", async ({ page }, name: string) => {
  await projectRow(page, name).click();
});

Then("I should see the folder detail panel for {string}", async ({ page }, name: string) => {
  const dialog = folderDetailPanel(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2, name })).toBeVisible();
});

// The panel's full-viewport backdrop (`fixed inset-0`, z-30 — see ProjectDetailPanel.tsx) sits
// above the tab bar (z-20) while open, intercepting clicks on it — so switching tabs while the
// panel is still open requires closing it first.
When("I close the folder detail panel", async ({ page }) => {
  await folderDetailPanel(page).getByRole("button", { name: "Close panel" }).click();
});

function isPatchTo(page: Page, pathSuffix: string) {
  return page.waitForResponse(
    (res) => res.request().method() === "PATCH" && new URL(res.url()).pathname.endsWith(pathSuffix)
  );
}

function isFilesRefetch(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/files"
  );
}

// Status isn't cascaded to files (see App.tsx's handleProjectStatusSave, which only calls
// refetchProjects() — unlike score/tags below, it never calls refetch()), so this only needs to
// wait for the status PATCH itself.
When("I set the folder status to {string}", async ({ page }, label: string) => {
  const dialog = folderDetailPanel(page);
  await Promise.all([
    isPatchTo(page, "/status"),
    dialog.getByRole("group", { name: "Select status" }).getByRole("button", { name: label }).click(),
  ]);
});

Then("the folder detail panel should show status {string}", async ({ page }, label: string) => {
  await expect(folderDetailPanel(page).locator(`[aria-label="Status: ${label}"]`)).toBeVisible();
});

Then("the projects table row for {string} should show status {string}", async ({ page }, name: string, label: string) => {
  await expect(projectRow(page, name).locator(`[aria-label="Status: ${label}"]`)).toBeVisible();
});

// Score IS linked: handleProjectScoreSave's PATCH .../score cascades onto every file in the
// project server-side, then the handler calls refetch() to pull the updated files list into the
// app's state. Waiting for both responses (not just the PATCH) is what proves that frontend
// refetch()-after-cascade wiring actually completes before a later step reads the Audio Files
// tab — see the cascade scenario in detail-panel-status-tags-score.feature.
When("I set the folder score to {int}", async ({ page }, value: number) => {
  const dialog = folderDetailPanel(page);
  await Promise.all([
    isPatchTo(page, "/score"),
    isFilesRefetch(page),
    dialog.getByRole("radiogroup", { name: "Set score" }).getByRole("radio", { name: `${value} of 5` }).click(),
  ]);
});

Then("the folder detail panel should show score {int}", async ({ page }, value: number) => {
  await expect(folderDetailPanel(page).locator(`[aria-label="Score: ${value} of 5"]`)).toBeVisible();
});

Then("the projects table row for {string} should show score {int}", async ({ page }, name: string, value: number) => {
  await expect(projectRow(page, name).locator(`[aria-label="Score: ${value} of 5"]`)).toBeVisible();
});

// Negative companion, added for Task 6.2's batch-edit scenarios: ScoreBadge.tsx renders
// `aria-label="Score: not set"` when a project's score is null (see ScoreBadge.tsx), which is
// what proves a batch score edit didn't leak onto an unselected row.
Then("the projects table row for {string} should show no score", async ({ page }, name: string) => {
  await expect(projectRow(page, name).locator(`[aria-label="Score: not set"]`)).toBeVisible();
});

// Tags are also linked (handleProjectTagsSave cascades then calls refetch()), same reasoning as
// score above. Both the free-text (Enter) and suggestion-select paths go through the same
// TagEditor.onChange -> onSaveTags -> PATCH .../tags flow (see TagEditor.tsx /
// TagAutocompleteInput.tsx), so both steps below wait on the same two responses.
When("I type {string} into the folder tag input and press Enter", async ({ page }, tag: string) => {
  const input = folderDetailPanel(page).getByPlaceholder("Add tag, press Enter…");
  await input.fill(tag);
  await Promise.all([isPatchTo(page, "/tags"), isFilesRefetch(page), input.press("Enter")]);
});

When(
  "I type {string} into the folder tag input and select the suggestion {string}",
  async ({ page }, query: string, suggestion: string) => {
    const dialog = folderDetailPanel(page);
    const input = dialog.getByPlaceholder("Add tag, press Enter…");
    await input.fill(query);
    await Promise.all([
      isPatchTo(page, "/tags"),
      isFilesRefetch(page),
      dialog.getByRole("listbox").getByRole("option", { name: suggestion, exact: true }).click(),
    ]);
  }
);

// Tag chips in the panel are only identifiable by their "Remove tag <name>" button (see
// TagEditor.tsx) — there's no dedicated role/test-id on the chip itself — so that's what this
// reads back, rather than matching on visible chip text (which could also match other on-screen
// text if a tag name happens to be a substring of something else in the panel).
async function getFolderDetailTagChips(page: Page): Promise<string[]> {
  const buttons = await folderDetailPanel(page)
    .getByRole("button", { name: /^Remove tag / })
    .all();
  const labels = await Promise.all(buttons.map((b) => b.getAttribute("aria-label")));
  return labels.map((l) => (l ?? "").replace(/^Remove tag /, "")).sort();
}

Then("the folder detail panel should show exactly these tags: {string}", async ({ page }, tagsCsv: string) => {
  const expected = parseTagsCsv(tagsCsv).sort();
  await expect(async () => {
    expect(await getFolderDetailTagChips(page)).toEqual(expected);
  }).toPass();
});

Then("the projects table row for {string} should show tags {string}", async ({ page }, name: string, tagsCsv: string) => {
  const row = projectRow(page, name);
  for (const tag of parseTagsCsv(tagsCsv)) {
    await expect(row).toContainText(tag);
  }
});

// Negation companion, added for Task 5b.3's reverse-cascade scenario: proves a tag that's no
// longer any of the project's files' tags actually drops off the recomputed project (see
// syncProjectFromFiles in linkSync.ts) rather than lingering — something the affirmative
// "should show tags" step above can't catch on its own, since it only ever asserts presence.
Then("the projects table row for {string} should not show tag {string}", async ({ page }, name: string, tag: string) => {
  await expect(projectRow(page, name)).not.toContainText(tag);
});

// --- Batch edit: selection mechanics (Task 6.2) -------------------------------------------------
//
// ProjectsTable.tsx's row checkbox (`RowCheckbox`) and header select-all checkbox are both plain
// `<input type="checkbox">`s, which get the implicit ARIA `checkbox` role — their accessible
// names are `Select ${project.name}` (row) and the fixed `Select all visible project folders`
// (header — see ProjectsTable.tsx). `RowCheckbox` has no `indeterminate` state of its own (a bare
// `checked` boolean prop, no partial-selection styling), so there's nothing beyond checked/
// unchecked to read back here. `onToggleSelectAll` (App.tsx's `toggleAllProjectSelect`) operates
// only on the current page's *filtered* `projects` array, never the whole DB — every scenario in
// batch-edit.feature scopes the table to just its 3 fixtures via search first, same as every
// other scenario in this file, before touching select-all.
//
// The BatchEditPanel itself (open/close/score/tag steps, and the "Batch Edit" trigger button's
// enabled/disabled/count state) lives in the shared e2e/steps/batchEdit.steps.ts instead — see
// that file's doc comment for why sharing it with the (future) Files-tab equivalent makes sense.

function projectRowCheckbox(page: Page, name: string) {
  return projectRow(page, name).getByRole("checkbox", { name: `Select ${name}` });
}

function selectAllProjectsCheckbox(page: Page) {
  return projectsTable(page).getByRole("checkbox", { name: "Select all visible project folders" });
}

When("I select project folder {string}", async ({ page }, name: string) => {
  await projectRowCheckbox(page, name).click();
});

When("I click the select-all project folders checkbox", async ({ page }) => {
  await selectAllProjectsCheckbox(page).click();
});

Then("the select-all project folders checkbox should be checked", async ({ page }) => {
  await expect(selectAllProjectsCheckbox(page)).toBeChecked();
});

Then("the select-all project folders checkbox should not be checked", async ({ page }) => {
  await expect(selectAllProjectsCheckbox(page)).not.toBeChecked();
});
