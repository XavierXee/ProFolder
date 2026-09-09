/**
 * Step definitions for the Audio Files tab. Originally seeded (Task 4.5) with just what the
 * Projects tab's detail-panel cascade scenario needed — seed an audio file's own tag via a
 * direct API call, then read that file's row back after switching tabs. Task 5a.2 added the
 * filtering scenarios' own steps below (status/score/tags seeding, filter toggles, presence/
 * absence-by-name assertions), mirroring projects.steps.ts's filtering section throughout. Task
 * 5a.3 added the sorting scenarios' own steps (per-column sort button, order-sensitive
 * assertion, ascending/descending indicators), mirroring projects.steps.ts's sorting section
 * adapted for FileTable.tsx's three independently-sortable columns. Task 5b.1 added the detail
 * panel's open/status/score edit-and-persist steps, mirroring projects.steps.ts's detail-panel
 * section adapted for FileDetailPanel.tsx. Task 5b.2 added the detail panel's tag edit-and-
 * persist steps (free-text add, autocomplete suggestion select, tag-chip read-back), mirroring
 * projects.steps.ts's tag steps; the cross-tab cascade proofs remain a separate future task.
 * Task 5b.4 added DOM/state-only steps for AudioPlayerBar.tsx (a wholly different component from
 * the detail panel — the row-level play button, not the row click) — bar visibility/filename,
 * Stop's displayed-time reset, Close hiding the bar, and the negative "does not also open the
 * detail panel" assertion. Deliberately no duration/seek/playing-icon assertions — see that
 * section's own doc comment for why.
 */

import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given, When, Then } = createBdd();

async function findFileIdByFilename(request: APIRequestContext, filename: string): Promise<string> {
  const response = await request.get(`/api/files?search=${encodeURIComponent(filename)}`);
  expect(response.ok(), `GET /api/files?search=${filename} failed with status ${response.status()}`).toBeTruthy();

  const body = (await response.json()) as { files: { id: string; filename: string }[] };
  const match = body.files.find((f) => f.filename === filename);
  if (!match) {
    throw new Error(
      `No file named "${filename}" found via GET /api/files?search=... (results: ${body.files
        .map((f) => f.filename)
        .join(", ")})`
    );
  }
  return match.id;
}

// Seeds a tag directly on one audio file (not through its project), via the same file-level
// PATCH route the real app's own file-tag-edit UI would use. This is what the cascade scenario
// uses to give a file "its own" tag before cascading a *different* tag down from its project, to
// prove the cascade adds onto a file's tags (addTagsToFiles — see linkSync.ts) rather than
// replacing them outright.
Given("file {string} has tag {string}", async ({ request }, filename: string, tag: string) => {
  const id = await findFileIdByFilename(request, filename);
  const res = await request.patch(`/api/files/${encodeURIComponent(id)}/tags`, { data: { tags: [tag] } });
  expect(res.ok(), `PATCH /api/files/${id}/tags failed with status ${res.status()}`).toBeTruthy();
});

function parseTagsCsv(tagsCsv: string): string[] {
  return tagsCsv
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// Tags-only variant (no status/score touched) — used by the detail-panel tag-suggestion scenario
// (Task 5b.2) to seed a tag into the global tag dictionary (the `tags` table row survives even
// after it's removed from this file again, since removal only deletes the `audio_file_tags` join
// row — see `setTags` in audioFileRepository.ts) without mutating this file's own status/score,
// which a concurrently-running status/score scenario against the same fixture file may depend on.
// Mirrors projects.steps.ts's "project {string} has tags {string}" exactly.
Given("file {string} has tags {string}", async ({ request }, filename: string, tagsCsv: string) => {
  const id = await findFileIdByFilename(request, filename);
  const tagsRes = await request.patch(`/api/files/${encodeURIComponent(id)}/tags`, {
    data: { tags: parseTagsCsv(tagsCsv) },
  });
  expect(tagsRes.ok(), `PATCH /api/files/${id}/tags failed with status ${tagsRes.status()}`).toBeTruthy();
});

// Combined status/score/tags seeder for the filtering scenarios — direct API PATCH (not the
// UI's click-to-edit path), same rationale as projects.steps.ts's equivalent step: this keeps
// the filtering scenarios fast and focused on filter *behavior*, not on how status/score/tags
// get edited (that's the file detail panel's job, a separate future task). Audio files' PATCH
// routes are id-keyed like projects' (see src/api/routes/files.ts), one route per field — there
// is no single combined PATCH, so this issues all three in sequence.
Given(
  "file {string} has status {string}, score {int}, and tags {string}",
  async ({ request }, filename: string, status: string, score: number, tagsCsv: string) => {
    const id = await findFileIdByFilename(request, filename);
    const tags = parseTagsCsv(tagsCsv);

    const statusRes = await request.patch(`/api/files/${encodeURIComponent(id)}/status`, { data: { status } });
    expect(statusRes.ok(), `PATCH /api/files/${id}/status failed with status ${statusRes.status()}`).toBeTruthy();

    const scoreRes = await request.patch(`/api/files/${encodeURIComponent(id)}/score`, { data: { score } });
    expect(scoreRes.ok(), `PATCH /api/files/${id}/score failed with status ${scoreRes.status()}`).toBeTruthy();

    const tagsRes = await request.patch(`/api/files/${encodeURIComponent(id)}/tags`, { data: { tags } });
    expect(tagsRes.ok(), `PATCH /api/files/${id}/tags failed with status ${tagsRes.status()}`).toBeTruthy();
  }
);

// Score + tags seeder, no status — used to pre-seed the "control" file (reverse-take-2.wav) in
// the reverse-cascade scenario (Task 5b.3) before the scenario's own UI-driven edits, mirroring
// "file {string} has status {string}, score {int}, and tags {string}" above minus the status leg
// (this control file's status is never asserted, and leaving it untouched keeps the seed focused
// on just the two fields the scenario's recompute assertions actually depend on).
Given(
  "file {string} has score {int} and tags {string}",
  async ({ request }, filename: string, score: number, tagsCsv: string) => {
    const id = await findFileIdByFilename(request, filename);
    const tags = parseTagsCsv(tagsCsv);

    const scoreRes = await request.patch(`/api/files/${encodeURIComponent(id)}/score`, { data: { score } });
    expect(scoreRes.ok(), `PATCH /api/files/${id}/score failed with status ${scoreRes.status()}`).toBeTruthy();

    const tagsRes = await request.patch(`/api/files/${encodeURIComponent(id)}/tags`, { data: { tags } });
    expect(tagsRes.ok(), `PATCH /api/files/${id}/tags failed with status ${tagsRes.status()}`).toBeTruthy();
  }
);

// Score-only reset, no status/tags touched — used by the batch-edit scenarios (Task 6.3) to
// guarantee a fixture starts unscored before a scenario asserts "stays unscored"/"now scored",
// since these fixtures are shared across every scenario in batch-edit.feature and Playwright
// gives no ordering guarantee between them. `null` (not an {int}) means this can't reuse the
// combined status/score/tags step above, which requires a Cucumber {int}. Mirrors
// projects.steps.ts's "project {string} has no score" exactly.
Given("file {string} has no score", async ({ request }, filename: string) => {
  const id = await findFileIdByFilename(request, filename);
  const scoreRes = await request.patch(`/api/files/${encodeURIComponent(id)}/score`, { data: { score: null } });
  expect(scoreRes.ok(), `PATCH /api/files/${id}/score failed with status ${scoreRes.status()}`).toBeTruthy();
});

function filesTable(page: Page) {
  return page.getByRole("table", { name: "Audio files" });
}

function fileRow(page: Page, filename: string) {
  return filesTable(page).locator("tbody tr", { hasText: filename });
}

// FilterBar.tsx's FilterToolbar debounces the search input 250ms before calling onChange (which
// is what actually fires the filtered fetch AND, per handleFilesFilterChange in App.tsx, resets
// selectedFileIds to empty) — waiting for that debounced fetch to actually land, rather than just
// filling the input and moving on, is required by the batch-edit scenarios (Task 6.3): a
// subsequent row-checkbox click that happens to land inside that 250ms window would otherwise get
// silently wiped out the instant the debounce finally fires and calls handleFilesFilterChange.
// Mirrors projects.steps.ts's "I search projects for" exactly, including the same-value skip
// below (see that step's doc comment for the full same-value-setState rationale).
When("I search files for {string}", async ({ page }, term: string) => {
  const input = page.getByLabel("Search by filename or path");
  if ((await input.inputValue()) === term) return;

  await Promise.all([
    page.waitForResponse((res) => {
      if (res.request().method() !== "GET") return false;
      const url = new URL(res.url());
      return url.pathname === "/api/files" && url.searchParams.get("search") === term;
    }),
    input.fill(term),
  ]);
});

Then("the file {string} row should show score {int}", async ({ page }, filename: string, value: number) => {
  await expect(fileRow(page, filename).locator(`[aria-label="Score: ${value} of 5"]`)).toBeVisible();
});

// Negative companion, added for Task 6.2's project->file batch-cascade scenario: ScoreBadge.tsx
// renders `aria-label="Score: not set"` when a file's score is null (see ScoreBadge.tsx /
// FileRow.tsx), mirroring projects.steps.ts's equivalent — what proves a batch project score
// edit didn't cascade onto a file belonging to an unselected project.
Then("the file {string} row should show no score", async ({ page }, filename: string) => {
  await expect(fileRow(page, filename).locator(`[aria-label="Score: not set"]`)).toBeVisible();
});

Then("the file {string} row should have tag {string}", async ({ page }, filename: string, tag: string) => {
  await expect(fileRow(page, filename)).toContainText(tag);
});

// Negative companion, added for the projects-tab batch-tag-cascade scenario (Task 9 follow-up
// #3): proves a batch-added project tag didn't leak onto an unselected project's file, mirroring
// projects.steps.ts's "the projects table row for ... should not show tag ..." exactly.
Then("the file {string} row should not have tag {string}", async ({ page }, filename: string, tag: string) => {
  await expect(fileRow(page, filename)).not.toContainText(tag);
});

// --- Filtering (Task 5a.2) --------------------------------------------------------------------
//
// FilterBar.tsx wraps the exact same FilterToolbar.tsx component ProjectsFilterBar.tsx wraps for
// the Project Folders tab (see FilterBar.tsx / ProjectsFilterBar.tsx), so the toggle mechanics —
// open a MultiSelectDropdown by its trigger's accessible name, click the option by its exact
// visible label, close with Escape — are identical. Duplicated here (rather than imported from
// projects.steps.ts) to keep each tab's step file self-contained, matching this repo's existing
// per-file duplication convention (see findFileIdByFilename / findProjectIdByName above).

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function toggleFilterOption(page: Page, triggerLabel: string, optionText: string): Promise<void> {
  await page.getByRole("button", { name: new RegExp(`^${escapeRegExp(triggerLabel)}`) }).click();

  const listbox = page.getByRole("listbox", { name: `Filter by ${triggerLabel.toLowerCase()}` });
  await listbox.locator("label", { hasText: new RegExp(`^${escapeRegExp(optionText)}$`) }).click();

  await page.keyboard.press("Escape");
}

When("I filter files by status {string}", async ({ page }, statusLabel: string) => {
  await toggleFilterOption(page, "Status", statusLabel);
});

When("I filter files by score {string}", async ({ page }, scoreLabel: string) => {
  await toggleFilterOption(page, "Score", scoreLabel);
});

When("I filter files by tag {string}", async ({ page }, tag: string) => {
  await toggleFilterOption(page, "Tags", tag);
});

// FilterToolbar.tsx's own "Clear all filters" control (`clearAll`) has an explicit
// `aria-label="Clear all filters"` overriding its visible text ("Clear") — but EmptyState.tsx
// (rendered inside the table's `<tbody>` whenever the current filtered result set is empty) has
// its OWN "Clear all filters" button with no `aria-label` at all, whose accessible name is just
// its plain visible text, which happens to be the exact same string. Whenever a scenario's filter
// combination narrows the table down to zero rows before calling this step (as Task 6.3's
// selection-clears-on-filter-change scenario does — none of its 3 fixtures have any status
// seeded, so filtering by any status empties the table), a plain `getByRole("button", { name:
// "Clear all filters" })` is ambiguous (two matches) and throws a strict-mode violation. Matching
// on the `aria-label` attribute directly (rather than the computed accessible name both buttons
// share) is what disambiguates: only FilterToolbar.tsx's own button actually has that attribute.
When("I clear all file filters", async ({ page }) => {
  await page.locator('button[aria-label="Clear all filters"]').click();
});

Then("I should see file {string} in the table", async ({ page }, filename: string) => {
  await expect(fileRow(page, filename)).toHaveCount(1);
});

Then("I should not see file {string} in the table", async ({ page }, filename: string) => {
  await expect(fileRow(page, filename)).toHaveCount(0);
});

// Every "Files E2E ..." fixture filename under e2e/support/fixtures/music-root/ (see Task 5a.1).
// This task's own 4 fixtures live directly under "Files E2E/"; the other 10 — 3 in "Files E2E
// FolderSort A/B/C" (all named "file.wav"), 3 in "Files E2E NameSort/", 3 loose "Files E2E
// Sort {Oldest,Middle,Newest}.wav" files, and the loose "Files E2E DetailPanel Take.wav" — are
// reserved for other tasks (5a.3's sorting scenarios and 5b.1's detail-panel scenarios,
// respectively) and currently sit at scan defaults (unseeded), so they don't match any filter in
// this file today — but nothing enforces that going forward. Listing every filename here (rather
// than trusting this task's own broad "Files E2E" search + row count to only ever catch its own
// fixtures — it doesn't: relative path matching means "Files E2E" also matches every reserved
// fixture's path, see the .feature file's Background comment) lets "only these files" assert
// absence by *name*, so a future task that seeds one of the reserved fixtures to match this
// task's filter criteria produces a specific "unexpected fixture appeared" failure pointing at
// the actual cause, not a generic count mismatch.
const ALL_FILES_E2E_FIXTURES = [
  "alpha-take.wav",
  "beta-mix.wav",
  "gamma-idea.wav",
  "delta-untouched.wav",
  "file.wav", // shared filename of Files E2E FolderSort A/B/C's one file each
  "alpha-name.wav",
  "bravo-name.wav",
  "charlie-name.wav",
  "Files E2E Sort Oldest.wav",
  "Files E2E Sort Middle.wav",
  "Files E2E Sort Newest.wav",
  "Files E2E DetailPanel Take.wav",
  "reverse-take-1.wav",
  "reverse-take-2.wav",
  // "Batch E2E Projects ..." folders' cascade-target files — Task 6.2's 3 batch-edit fixtures
  // (see e2e/features/projects-tab/batch-edit.feature's cascade scenario).
  "alpha-cascade.wav",
  "bravo-cascade.wav",
  "charlie-cascade.wav",
  // "Batch E2E Files ..." — Task 6.3's 3 loose, standalone (no linked project) batch-edit
  // fixtures (see e2e/features/files-tab/batch-edit.feature).
  "Batch E2E Files Alpha.wav",
  "Batch E2E Files Bravo.wav",
  "Batch E2E Files Charlie.wav",
  // "Batch E2E Cascade Proj1/Proj2" folders' files — Task 6.4's cross-view batch cascade
  // fixtures (see e2e/features/files-tab/batch-edit-cascade.feature): 2 files in Proj1, 1 in
  // Proj2, used to prove syncProjectsForFiles' dedupe-by-distinct-project loop resyncs BOTH
  // projects from a single batch call.
  "cascade-proj1-take1.wav",
  "cascade-proj1-take2.wav",
  "cascade-proj2-take1.wav",
  // "Scanning E2E Exclusion Toggle/track.wav" — Task 7.1's fixture for the "Prod Folder" scan
  // settings panel's exclusion-toggle scenarios (see e2e/features/scanning-settings/
  // exclusion-toggles.feature). A plain top-level folder with one loose file, repeatedly
  // excluded/re-included and rescanned by those scenarios — both the filename and the folder
  // name (which also appears in this table's Location text, same as the FolderSort fixtures'
  // rationale above) are listed so this task's own mid-suite scan can never silently leak a
  // stray row into another scenario's "only these files" check without being caught.
  "track.wav",
  "Scanning E2E Exclusion Toggle",
  // "Scanning E2E Settings/{Samples,Backup}/track.wav" — Task 7.2's fixtures for the "Settings"
  // panel's name-based exclusion toggles (see e2e/features/scanning-settings/scan-settings
  // .feature). Both share the filename "track.wav" (already listed above) with Task 7.1's own
  // fixture, so filename alone can't disambiguate rows — what's registered here instead is each
  // file's exact rendered Location-column text (FileRow.tsx joins relativePath's folder segments
  // with " / "), which is unique per fixture and lets "only these files" catch either one
  // leaking into an unrelated scenario's filtered view.
  "Scanning E2E Settings / Samples",
  "Scanning E2E Settings / Backup",
];

// Asserts the visible row set is *exactly* the given filenames — every listed filename has a
// row, and every other known "Files E2E ..." fixture (this task's own untouched fixture plus the
// ones reserved for Task 5a.3) explicitly does not. Safe to use whenever a scenario's own filters
// (search/status/score/tag) are expected to narrow the whole scratch DB down to just its own
// fixtures.
Then("I should see only these files in the table: {string}", async ({ page }, namesCsv: string) => {
  const names = namesCsv.split(",").map((n) => n.trim());

  for (const name of names) {
    await expect(fileRow(page, name)).toHaveCount(1);
  }

  const unexpected = ALL_FILES_E2E_FIXTURES.filter((fixture) => !names.includes(fixture));
  for (const name of unexpected) {
    await expect(fileRow(page, name), `unexpected fixture "${name}" appeared in the table`).toHaveCount(0);
  }
});

// FileTable.tsx renders EmptyState.tsx unconditionally whenever the current page has zero rows
// (no total-based branching like ProjectsTable.tsx's two messages — see the doc comment on the
// .feature file's equivalent scenario), so there's only ever one message to check for here.
Then("I should see the files empty-results message", async ({ page }) => {
  await expect(page.getByText("No audio files match your filters")).toBeVisible();
});

// Extra isolation check for the Location-column sort scenarios: their 3 "Files E2E FolderSort
// {A,B,C}/file.wav" fixtures all share the filename "file.wav", so `fileRow` (which matches on
// filename substring) can't disambiguate them the way "I should see only these files in the
// table" does elsewhere — every one of those 3 rows would match a `fileRow(page, "file.wav")`
// lookup. A plain row count is the substitute isolation check for that one fixture group.
Then("I should see exactly {int} files in the table", async ({ page }, count: number) => {
  await expect(filesTable(page).locator("tbody tr")).toHaveCount(count);
});

// --- Sorting (Task 5a.3) -----------------------------------------------------------------------
//
// FileTable.tsx has three independently-sortable columns (see SortTh usages: `name` under the
// "Track / File" header, `folder` under "Location", `modifiedAt` under "Modified"), unlike
// FilterToolbar.tsx's single hardcoded "Sort: Modified" button the Projects tab uses — so, unlike
// projects.steps.ts's `sortButton(page)`, this helper is parameterized by the column's header
// label. Each `<th scope="col">` gets the implicit ARIA `columnheader` role (it's a real semantic
// <table>), and its accessible name is its full text content — the column label plus, once that
// column is the active sort, a trailing " ↑"/" ↓" appended directly inline (not inside a separate
// `aria-hidden` span the way FilterToolbar.tsx's indicator is — see `sortIndicator` in
// FileTable.tsx). Matching on just the column label (Playwright's default `name` matching is a
// case-insensitive substring, not exact) finds the header/button regardless of whether that
// indicator is currently appended.
function sortColumnHeader(page: Page, columnLabel: string) {
  return page.getByRole("columnheader", { name: columnLabel });
}

function sortButton(page: Page, columnLabel: string) {
  return sortColumnHeader(page, columnLabel).getByRole("button");
}

When("I click the {string} sort button", async ({ page }, columnLabel: string) => {
  await sortButton(page, columnLabel).click();
});

// Order-sensitive companion to "I should see only these files in the table: ..." / "I should see
// exactly N files in the table", mirroring projects.steps.ts's equivalent: filters the table's
// visible rows down to just the given (expected) identifiers before comparing sequence, so other
// fixtures that might incidentally be visible don't break the order assertion — only relative
// order among the named identifiers is asserted. Wrapped in `expect(...).toPass()` since the
// table updates asynchronously after a sort click (new API request + re-render), so the first
// read may briefly still reflect the pre-click order.
//
// Deliberately takes generic "identifiers" rather than always filenames: the Location-column
// scenarios pass folder text (e.g. "Files E2E FolderSort A") instead, since their 3 fixtures
// share the filename "file.wav" and can't be told apart by name alone — but every row's full
// text also includes its folder (FileRow.tsx's Location cell), so matching against that text
// works the same way.
Then("I should see these files in this order: {string}", async ({ page }, identifiersCsv: string) => {
  const expectedOrder = identifiersCsv.split(",").map((n) => n.trim());

  await expect(async () => {
    const rowTexts = await filesTable(page).locator("tbody tr").allInnerTexts();
    const actualOrder = rowTexts
      .map((text) => expectedOrder.find((identifier) => text.includes(identifier)))
      .filter((identifier): identifier is string => identifier !== undefined);
    expect(actualOrder).toEqual(expectedOrder);
  }).toPass();
});

Then("the {string} sort button should indicate ascending order", async ({ page }, columnLabel: string) => {
  await expect(sortColumnHeader(page, columnLabel)).toHaveAttribute("aria-sort", "ascending");
  await expect(sortButton(page, columnLabel)).toContainText("↑");
});

Then("the {string} sort button should indicate descending order", async ({ page }, columnLabel: string) => {
  await expect(sortColumnHeader(page, columnLabel)).toHaveAttribute("aria-sort", "descending");
  await expect(sortButton(page, columnLabel)).toContainText("↓");
});

// --- Detail panel: status/tags/score edit-and-persist scenarios (Tasks 5b.1, 5b.2) --------------
//
// FileDetailPanel.tsx mounts its own, separate `role="dialog"` wrapper the same way
// ProjectDetailPanel.tsx does (see the doc comment atop the Detail panel section in
// projects.steps.ts) — permanently mounted, only its content conditionally rendered on `file`.
// Its accessible name is the generic "File detail" when closed and "File detail: <filename>" once
// a file is selected (see the `aria-label` in FileDetailPanel.tsx) — matching on that ": " suffix
// scopes every step below to "the Audio Files detail panel, currently open," mirroring
// `folderDetailPanel` exactly.

function fileDetailPanel(page: Page) {
  return page.getByRole("dialog", { name: /^File detail: / });
}

When("I open the file detail panel for {string}", async ({ page }, filename: string) => {
  await fileRow(page, filename).click();
});

Then("I should see the file detail panel for {string}", async ({ page }, filename: string) => {
  const dialog = fileDetailPanel(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2, name: filename })).toBeVisible();
});

// The panel's full-viewport backdrop (`fixed inset-0`, z-30 — see FileDetailPanel.tsx) sits above
// the tab bar while open, intercepting clicks on it — so switching tabs while the panel is still
// open requires closing it first, same as `folderDetailPanel`'s equivalent.
When("I close the file detail panel", async ({ page }) => {
  await fileDetailPanel(page).getByRole("button", { name: "Close panel" }).click();
});

function isPatchTo(page: Page, pathSuffix: string) {
  return page.waitForResponse(
    (res) => res.request().method() === "PATCH" && new URL(res.url()).pathname.endsWith(pathSuffix)
  );
}

// Mirrors projects.steps.ts's `isFilesRefetch` for the reverse direction: App.tsx's
// handleFileScoreSave/handleFileTagsSave both call refetchProjects() unconditionally after their
// PATCH (even for a file with no project — see the comment on "I set the file score to" below),
// so waiting on this alongside the PATCH is what proves that frontend refetch()-after-cascade
// wiring actually completes, the same way `isFilesRefetch` proves it for the project->file
// direction (Task 5b.3's reverse-cascade scenario).
function isProjectsRefetch(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/projects"
  );
}

// A file's own status edit isn't cascaded to its project (see App.tsx's handleFileStatusSave,
// which never calls refetchProjects() — the Architect confirmed this matches the Projects tab's
// non-cascading status behavior), so — like `folderDetailPanel`'s "I set the folder status to"
// step — this only needs to wait for the status PATCH itself.
When("I set the file status to {string}", async ({ page }, label: string) => {
  const dialog = fileDetailPanel(page);
  await Promise.all([
    isPatchTo(page, "/status"),
    dialog.getByRole("group", { name: "Select status" }).getByRole("button", { name: label }).click(),
  ]);
});

Then("the file detail panel should show status {string}", async ({ page }, label: string) => {
  await expect(fileDetailPanel(page).locator(`[aria-label="Status: ${label}"]`)).toBeVisible();
});

// A file's own score edit DOES cascade onto its project (App.tsx's handleFileScoreSave calls
// refetchProjects() too, unconditionally — even for a file with no project, like the loose
// "Files E2E DetailPanel Take.wav" fixture 5b.1's scenarios use this step against). Waiting on
// both the score PATCH and the resulting `/api/projects` refetch, mirroring `folderDetailPanel`'s
// "I set the folder score to" step exactly, is what proves that frontend refetch()-after-cascade
// wiring — the actual gap Task 5b.3's reverse-cascade scenario targets, since the backend
// recompute itself is already covered by tests/linkSync.test.ts.
When("I set the file score to {int}", async ({ page }, value: number) => {
  const dialog = fileDetailPanel(page);
  await Promise.all([
    isPatchTo(page, "/score"),
    isProjectsRefetch(page),
    dialog.getByRole("radiogroup", { name: "Set score" }).getByRole("radio", { name: `${value} of 5` }).click(),
  ]);
});

Then("the file detail panel should show score {int}", async ({ page }, value: number) => {
  await expect(fileDetailPanel(page).locator(`[aria-label="Score: ${value} of 5"]`)).toBeVisible();
});

// Tags (Task 5b.2). A file's own tag edit ALSO cascades onto its project (App.tsx's
// handleFileTagsSave calls refetchProjects() too, same as handleFileScoreSave, unconditionally).
// Both the free-text (Enter) and suggestion-select paths go through the same TagEditor.onChange
// -> onSaveTags -> PATCH .../tags flow (see TagEditor.tsx / TagAutocompleteInput.tsx — confirmed
// identical components to the Projects tab's), so both steps below mirror projects.steps.ts's
// equivalents exactly, including the `/api/projects` refetch wait — needed for Task 5b.3's
// reverse-cascade scenario, which edits a file's tags and then reads the result back through the
// Projects tab.
When("I type {string} into the file tag input and press Enter", async ({ page }, tag: string) => {
  const input = fileDetailPanel(page).getByPlaceholder("Add tag, press Enter…");
  await input.fill(tag);
  await Promise.all([isPatchTo(page, "/tags"), isProjectsRefetch(page), input.press("Enter")]);
});

When(
  "I type {string} into the file tag input and select the suggestion {string}",
  async ({ page }, query: string, suggestion: string) => {
    const dialog = fileDetailPanel(page);
    const input = dialog.getByPlaceholder("Add tag, press Enter…");
    await input.fill(query);
    await Promise.all([
      isPatchTo(page, "/tags"),
      isProjectsRefetch(page),
      dialog.getByRole("listbox").getByRole("option", { name: suggestion, exact: true }).click(),
    ]);
  }
);

// Tag chips in the panel are only identifiable by their "Remove tag <name>" button (see
// TagEditor.tsx) — there's no dedicated role/test-id on the chip itself — so that's what this
// reads back, rather than matching on visible chip text (which could also match other on-screen
// text if a tag name happens to be a substring of something else in the panel). Mirrors
// projects.steps.ts's `getFolderDetailTagChips` exactly.
async function getFileDetailTagChips(page: Page): Promise<string[]> {
  const buttons = await fileDetailPanel(page)
    .getByRole("button", { name: /^Remove tag / })
    .all();
  const labels = await Promise.all(buttons.map((b) => b.getAttribute("aria-label")));
  return labels.map((l) => (l ?? "").replace(/^Remove tag /, "")).sort();
}

Then("the file detail panel should show exactly these tags: {string}", async ({ page }, tagsCsv: string) => {
  const expected = parseTagsCsv(tagsCsv).sort();
  await expect(async () => {
    expect(await getFileDetailTagChips(page)).toEqual(expected);
  }).toPass();
});

// --- Reverse cascade: file -> project live recompute (Task 5b.3) -----------------------------
//
// TagEditor.tsx's remove-chip button (`removeTag`) goes through the exact same
// onChange -> onSaveTags -> PATCH .../tags flow as adding a tag (see TagEditor.tsx's `onChange`
// prop, wired to `handleTagsChange` in FileDetailPanel.tsx) — so this waits on the same PATCH +
// `/api/projects` refetch pair as the add-tag steps above, needed for the reverse-cascade
// scenario's "lower the score, remove the tag" half, which proves live recompute (a value that's
// no longer any file's max/no longer any file's tag drops off the project) rather than a sticky
// additive cascade.
When("I remove the file tag {string}", async ({ page }, tag: string) => {
  const dialog = fileDetailPanel(page);
  await Promise.all([
    isPatchTo(page, "/tags"),
    isProjectsRefetch(page),
    dialog.getByRole("button", { name: `Remove tag ${tag}` }).click(),
  ]);
});

// --- Audio player bar (Task 5b.4) --------------------------------------------------------------
//
// AudioPlayerBar.tsx is a wholly separate component from FileDetailPanel.tsx — a fixed bottom bar
// driven by App.tsx's own `playingFile`/`isPlaying` state (see handlePlayClick/handleClosePlayer),
// not the detail panel's `selectedId`. Its outer `<div className="fixed bottom-0 left-0 right-0
// ...">` has no role/aria-label/test-id of its own (confirmed by reading the component's real
// markup), so `playerBar` below scopes on the one attribute that IS unique and stable: the "Close
// player" button is a direct child of that same outer div (not nested inside any of its
// sub-groups), so `div:has(> button[aria-label="Close player"])` selects exactly that outer div
// and nothing else — the component unmounts entirely (returns null, see `if (!file) return null;`)
// rather than just hiding via CSS when no file is loaded, so this locator resolves to zero
// elements whenever the bar isn't showing, which is also what "I should not see the audio player
// bar" below asserts.
//
// Per the Architect's confirmed decision, these steps are DOM/state-only: no assertion here ever
// reads duration, seek position, or the Play/Pause icon's playing/paused state — the fixture WAVs'
// ~0.5ms of real sample data means `onEnded` can fire within microseconds of `play()` resolving,
// so a "Pause icon shows right after clicking Play" assertion would race a near-instant flip back
// to not-playing. Everything asserted below (bar mount/visibility, filename text, Stop's displayed
// time reset, Close hiding the bar) is pure React state set directly by the click handlers
// themselves (see `onPlayingChange`/`handleStop`/`onClose` in AudioPlayerBar.tsx), never read back
// from the `<audio>` element's actual playback outcome.
function playerBar(page: Page) {
  return page.locator('div:has(> button[aria-label="Close player"])');
}

// The row-level play button (FileRow.tsx) is a distinct control from the bar's own Play/Pause
// button — its accessible name is file-specific ("Play <filename>"/"Pause <filename>", toggling
// with `isPlayingThis`), and its `onClick` calls `e.stopPropagation()` before `onPlayClick()` (see
// FileRow.tsx) specifically so it does NOT also bubble up to the row's own `onClick` (which opens
// the file detail panel) — the first scenario in audio-player.feature asserts that negatively.
When("I click the play button for file {string}", async ({ page }, filename: string) => {
  await fileRow(page, filename)
    .getByRole("button", { name: `Play ${filename}`, exact: true })
    .click();
});

Then("I should see the audio player bar for {string}", async ({ page }, filename: string) => {
  const bar = playerBar(page);
  await expect(bar).toBeVisible();
  await expect(bar.getByText(filename, { exact: true })).toBeVisible();
});

Then("I should not see the file detail panel", async ({ page }) => {
  await expect(fileDetailPanel(page)).not.toBeVisible();
});

When("I click stop on the audio player", async ({ page }) => {
  await playerBar(page).getByRole("button", { name: "Stop" }).click();
});

// The bar's two `formatTime(...)` spans (current time, then duration) are the only two bare
// `<span>` elements it renders (see AudioPlayerBar.tsx — everything else is a `<p>`, `<button>`,
// or the `<input aria-label="Seek">` itself), in that fixed DOM order — `.first()` is always the
// current-time display, never the duration one.
Then("the audio player time should show {string}", async ({ page }, time: string) => {
  await expect(playerBar(page).locator("span").first()).toHaveText(time);
});

When("I close the audio player", async ({ page }) => {
  await playerBar(page).getByRole("button", { name: "Close player" }).click();
});

Then("I should not see the audio player bar", async ({ page }) => {
  await expect(playerBar(page)).toHaveCount(0);
});

// --- Batch edit: selection mechanics (Task 6.3) -------------------------------------------------
//
// FileTable.tsx's row checkbox (`RowCheckbox`) and header select-all checkbox are both plain
// `<input type="checkbox">`s, which get the implicit ARIA `checkbox` role — their accessible
// names are `Select ${file.filename}` (row) and the fixed `Select all visible files` (header —
// note this differs from the Projects tab's "Select all visible project folders", see
// FileTable.tsx / ProjectsTable.tsx). `onToggleSelectAll` (App.tsx's `toggleAllFileSelect`)
// operates only on the current page's *filtered* `files` array, never the whole DB — every
// scenario in batch-edit.feature scopes the table to just its 3 fixtures via search first, same
// as every other scenario in this file, before touching select-all. Mirrors
// projects.steps.ts's equivalent section exactly.
//
// The BatchEditPanel itself (open/close/score/tag steps, and the "Batch Edit" trigger button's
// enabled/disabled/count state) lives in the shared e2e/steps/batchEdit.steps.ts instead — see
// that file's doc comment for why it's shared with the Projects-tab equivalent (Task 6.2).

function fileRowCheckbox(page: Page, filename: string) {
  return fileRow(page, filename).getByRole("checkbox", { name: `Select ${filename}` });
}

function selectAllFilesCheckbox(page: Page) {
  return filesTable(page).getByRole("checkbox", { name: "Select all visible files" });
}

When("I select file {string}", async ({ page }, filename: string) => {
  await fileRowCheckbox(page, filename).click();
});

When("I click the select-all files checkbox", async ({ page }) => {
  await selectAllFilesCheckbox(page).click();
});

Then("the select-all files checkbox should be checked", async ({ page }) => {
  await expect(selectAllFilesCheckbox(page)).toBeChecked();
});

Then("the select-all files checkbox should not be checked", async ({ page }) => {
  await expect(selectAllFilesCheckbox(page)).not.toBeChecked();
});
