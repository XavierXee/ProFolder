/**
 * Step definitions for e2e/features/file-ops/*.feature — Copy/Move/Delete e2e coverage.
 *
 * --- Hazard-class reasoning (see the `@scan-lock` doc comment in e2e/support/scanLock.ts) ---
 *
 * None of these scenarios trigger a real scan (`POST /api/scan`) or mutate global scan
 * configuration (`scan_exclusions`, `excludeSamplesFolders`/`excludeBackupFolders`) — the
 * copy/move/delete routes these scenarios drive (`src/api/routes/files.ts`/`projects.ts`) do
 * direct, synchronous-per-request filesystem + DB mutations scoped to the specific id(s) in the
 * request, with no full-tree rescan involved (confirmed by reading the route handlers). So this
 * is the lighter "plain CRUD, independently keyed" hazard class `customTabs.steps.ts`'s doc
 * comment describes, not the `@scan-lock` class — `@scan-lock` would protect nothing real here.
 *
 * What actually matters, since these scenarios physically copy/move/delete real files on disk
 * inside the shared scratch `music-root` (not just DB rows): every mutating scenario below uses
 * its OWN exclusive, scenario-unique fixture file(s) that no other scenario/feature file ever
 * touches (see each `.feature` file's own doc comment and the isolation-list registration in
 * `files.steps.ts`/`projects.steps.ts`). A deleted/moved fixture can't be "put back" the way a
 * merely-filtered one can, so — per the task brief's own guidance — every mutating scenario here
 * gets a fresh, single-use fixture rather than a shared one needing restoration. `@mode:serial`
 * is deliberately NOT applied to any of these files: each currently contains at most one
 * mutating scenario, and none of them share a fixture with any sibling scenario in the same
 * file, so there's no same-file, same-fixture race for `@mode:serial` to prevent (unlike e.g.
 * files-tab/batch-edit.feature, whose scenarios share 3 fixtures with different target values).
 *
 * --- Known, confirmed-during-this-task blocker: the destination picker sends a path the
 *     copy/move backend routes reject for every non-root folder ---
 *
 * `DestinationFolderPicker.tsx` sources its tree from `GET /folders/tree`, which returns
 * root-RELATIVE `path` values (`buildFolderTree` in `src/scanner/folderTree.ts`: the root node's
 * own `path` is `""`, children are e.g. `"SomeFolder"`/`"SomeFolder/Nested"`) — this is correct
 * for that endpoint's OTHER consumer, `ScanFolderPanel.tsx`'s scan-exclusion picker, where
 * relative paths are exactly what `scan_exclusions` stores. But `CopyMoveDeleteDialog.tsx` feeds
 * that same relative `node.path` straight through as `destinationPath` to
 * `api.copyFile`/`moveFile`/`copyProject`/`moveProject` (and their batch equivalents) with NO
 * conversion to an absolute path — and every one of those routes' `parseDestDir` + downstream
 * `FileOpsService.copyPath`/`movePath` require an ABSOLUTE `destDir` (`isWithinRoot` calls
 * `fs.realpathSync` on it, which resolves a relative string against `process.cwd()`, not the
 * music root). Confirmed empirically against a real running server (throwaway scratch
 * MUSIC_ROOT/DB_PATH, not `data/library.db`): `POST /api/files/:id/copy` with
 * `{"destDir":"Sub"}` (a real, existing subfolder's own relative tree path) returns 400
 * "Refusing to operate on a destination directory outside the configured music root", while the
 * identical request with the folder's ABSOLUTE path succeeds. Selecting the tree's ROOT node
 * fares no better: its `path` is `""`, which every copy/move route's `parseDestDir` rejects
 * outright as falsy ("destDir is required") before the containment check is even reached.
 *
 * Net effect (AS ORIGINALLY WRITTEN — now fixed, see below): EVERY real, UI-driven copy or move
 * — single-item or batch, Files or Projects — failed end-to-end via the actual destination
 * picker, for every possible folder selection (including the root). This was never caught by this
 * feature's own unit tests (`CopyMoveDeleteDialog.test.tsx`/`DestinationFolderPicker.test.tsx`/
 * `App.fileOps.test.tsx`) because all of them mock `api.getFolderTree` directly with arbitrary,
 * absolute-path-LOOKING strings (e.g. `"/music/Artist"`) rather than exercising the real
 * `/folders/tree` endpoint's actual (relative) path shape — so this was a genuine,
 * previously-undocumented, shipped bug, not a test-writing gap. Delete (which needs no
 * destination at all) and the picker's own selection/Apply-enablement mechanics (destination-
 * picker.feature/cancel.feature, neither of which ever clicks Apply) were the only things this
 * suite could exercise end-to-end at the time this comment was first written.
 *
 * --- Follow-up: the bug above is now fixed, and copy.feature/move.feature/project-move.feature
 *     prove it ---
 *
 * `CopyMoveDeleteDialog.tsx` now joins the picker's root-relative selection onto an absolute
 * `musicRoot` prop (`resolveAbsoluteDestination`) before ever calling `api.copyFile`/`moveFile`/
 * `copyProject`/`moveProject`. `copy.feature` (single file copy), `move.feature` (single file
 * move), and `project-move.feature` (a whole project subtree move, including a nested file) are
 * the first scenarios in this suite to actually click Apply against a real destination selection
 * — each is a genuine, DB+filesystem-verified proof the fix holds (confirmed via mutation testing:
 * temporarily reverting the join back to the raw relative path makes all three fail the exact way
 * the bug predicts — a 400 "Refusing to operate on a destination directory outside the configured
 * music root" surfaced as the dialog's own inline error text, `fileOpDialog`/Apply button staying
 * mounted since the request never resolves successfully). See each of those `.feature` files' own
 * doc comments for scenario-specific reasoning.
 */

import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { When, Then } = createBdd();

// --- Locators (duplicated from files.steps.ts/batchEdit.steps.ts per this repo's established
// per-file self-contained convention — see files.steps.ts's own doc comment on this) ----------

function fileDetailPanel(page: Page) {
  return page.getByRole("dialog", { name: /^File detail: / });
}

// Duplicated from projects.steps.ts's own `folderDetailPanel` per this suite's established
// per-file self-contained convention (see the top of this file's locator section) — needed here
// because project-move.feature is the first scenario in this directory to click a file-op button
// from the PROJECT detail panel rather than the file one.
function folderDetailPanel(page: Page) {
  return page.getByRole("dialog", { name: /^Folder detail: / });
}

function batchEditDialog(page: Page, kind: string) {
  return page.getByRole("dialog", { name: `Batch edit ${kind}` });
}

// Duplicated from files.steps.ts's own `filesTable`/`fileRow` (same self-contained-per-file
// convention) — needed here because copy.feature/move.feature/project-move.feature need to
// disambiguate between two rows sharing the same filename (a copy leaves the original AND the
// new copy both visible under the same search term) or to prove a row is no longer AT a specific
// location, neither of which files.steps.ts's plain "I should see file ... in the table" (a bare
// `toHaveCount(1)`, ambiguous once two same-named rows exist) can express.
function filesTable(page: Page) {
  return page.getByRole("table", { name: "Audio files" });
}

function fileRow(page: Page, filename: string) {
  return filesTable(page).locator("tbody tr", { hasText: filename });
}

// FileRow.tsx renders the Location cell's text (`computeLocation` in FileRow.tsx: the file's
// containing folder path segments joined by " / ", or the literal "(root)" for a loose top-level
// file) as part of the row's own text content, so filtering an already-filename-matched row set
// by that same location string (a second `hasText` filter, ANDed with the first) is what
// disambiguates "the original, still at its old folder" from "the new copy, now at the
// destination folder" when both share a filename.
function fileRowAtLocation(page: Page, filename: string, location: string) {
  return fileRow(page, filename).filter({ hasText: location });
}

// CopyMoveDeleteDialog.tsx returns `null` outright whenever `open` is false (`if (!open) return
// null;`) — unlike FileDetailPanel.tsx/ProjectDetailPanel.tsx/BatchEditPanel.tsx, which stay
// permanently mounted and only toggle visibility via CSS. So at most one match for this locator
// can ever exist at a time, and matching a loose "starts with Copy/Move" prefix (covering all
// three of this dialog's possible titles — `Copy "..."`, `Move "..."`, `Move to Trash "..."`, or
// the equivalent batch titles `Copy N files`/`Move N files`/`Move to Trash N files`) is enough to
// find it unambiguously, without needing to know the exact item name/count in advance the way
// `fileDetailPanel`/`batchEditDialog` above need their own exact accessible names.
function fileOpDialog(page: Page) {
  return page.getByRole("dialog", { name: /^(Copy|Move) /i });
}

// The Apply button's own label also always starts with "Copy" or "Move" (including the busy-state
// "Copying…"/"Moving…"/"Moving to Trash…" variants — see `applyButtonLabel` in
// CopyMoveDeleteDialog.tsx), which never collides with this same dialog's other two buttons
// ("Cancel", "Close dialog").
function fileOpApplyButton(page: Page) {
  return fileOpDialog(page).getByRole("button", { name: /^(Copy|Move)/ });
}

// confirmCopy/confirmMove/confirmDelete all default to true (see
// src/config/confirmationSettings.ts) on this suite's fresh scratch DB, so
// CopyMoveDeleteDialog.tsx now renders a "type COPY/MOVE/DELETE to confirm" input (see
// ConfirmTextInput.tsx) that must be filled with the exact keyword before Apply is enabled.
// Filled defensively (only if present) so the confirm steps below still work unchanged if a
// scenario ever runs with the relevant setting off.
function fileOpConfirmInput(page: Page, keyword: string) {
  return fileOpDialog(page).getByLabel(`Type "${keyword}" to confirm`);
}

async function fillFileOpConfirmationIfPresent(page: Page, keyword: string) {
  const input = fileOpConfirmInput(page, keyword);
  if ((await input.count()) > 0) {
    await input.fill(keyword);
  }
}

// Explicit action step for scenarios that need the Apply-enablement state itself to reflect a
// pre-typed confirmation BEFORE any confirm/cancel step runs (destination-picker.feature,
// cancel.feature — neither of which ever clicks Apply, so the fill-if-present helper above,
// which only runs from inside the confirm-click steps, never gets a chance to fire for them).
When("I type {string} to confirm in the file operation dialog", async ({ page }, keyword: string) => {
  await fileOpConfirmInput(page, keyword).fill(keyword);
});

When("I click {string} in the file detail panel", async ({ page }, label: string) => {
  await fileDetailPanel(page).getByRole("button", { name: label, exact: true }).click();
});

// Project-detail-panel equivalent of the step above — needed for project-move.feature, the first
// scenario in this directory to trigger a file-op button from ProjectDetailPanel.tsx rather than
// FileDetailPanel.tsx.
When("I click {string} in the folder detail panel", async ({ page }, label: string) => {
  await folderDetailPanel(page).getByRole("button", { name: label, exact: true }).click();
});

When(
  "I click {string} in the {string} batch edit panel",
  async ({ page }, label: string, kind: string) => {
    await batchEditDialog(page, kind).getByRole("button", { name: label, exact: true }).click();
  }
);

Then("I should see the file operation dialog", async ({ page }) => {
  await expect(fileOpDialog(page)).toBeVisible();
});

Then("I should not see the file operation dialog", async ({ page }) => {
  await expect(fileOpDialog(page)).toHaveCount(0);
});

Then("I should see the destination folder tree", async ({ page }) => {
  await expect(fileOpDialog(page).getByRole("tree", { name: "Destination folder" })).toBeVisible();
});

Then("the file operation apply button should be disabled", async ({ page }) => {
  await expect(fileOpApplyButton(page)).toBeDisabled();
});

Then("the file operation apply button should be enabled", async ({ page }) => {
  await expect(fileOpApplyButton(page)).toBeEnabled();
});

When(
  "I select destination folder {string} in the file operation dialog",
  async ({ page }, folderName: string) => {
    await fileOpDialog(page).getByRole("radio", { name: folderName }).click();
  }
);

When("I click cancel in the file operation dialog", async ({ page }) => {
  await fileOpDialog(page).getByRole("button", { name: "Cancel" }).click();
});

function isFilesRefetch(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/files"
  );
}

// Matches a single-item delete (`DELETE /api/files/:id`) but not the batch route
// (`DELETE /api/files/batch`, matched separately below) — safe to assume no fixture id in this
// suite is literally "batch".
function isSingleFileDelete(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "DELETE" && /^\/api\/files\/[^/]+$/.test(new URL(res.url()).pathname)
  );
}

function isBatchFileDelete(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "DELETE" && new URL(res.url()).pathname === "/api/files/batch"
  );
}

When("I confirm the delete in the file operation dialog", async ({ page }) => {
  await fillFileOpConfirmationIfPresent(page, "DELETE");
  await Promise.all([isSingleFileDelete(page), isFilesRefetch(page), fileOpApplyButton(page).click()]);
});

When("I confirm the batch delete in the file operation dialog", async ({ page }) => {
  await fillFileOpConfirmationIfPresent(page, "DELETE");
  await Promise.all([isBatchFileDelete(page), isFilesRefetch(page), fileOpApplyButton(page).click()]);
});

// --- Copy/move confirm steps (copy.feature, move.feature, project-move.feature) ---------------
//
// Mirrors `isSingleFileDelete`/`isFilesRefetch` above: wait for the operation's own API call AND
// the resulting refetch(es) that App.tsx's `handleFileOpSuccess`/`handleProjectOpSuccess` trigger
// (see those handlers in App.tsx), so the step doesn't resolve until the table has actually
// re-rendered with the mutation's outcome — the same race `isFilesRefetch` already guards against
// for delete.

function isProjectsRefetch(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "GET" && new URL(res.url()).pathname === "/api/projects"
  );
}

function isSingleFileCopy(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "POST" && /^\/api\/files\/[^/]+\/copy$/.test(new URL(res.url()).pathname)
  );
}

function isSingleFileMove(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "POST" && /^\/api\/files\/[^/]+\/move$/.test(new URL(res.url()).pathname)
  );
}

function isSingleProjectMove(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "POST" && /^\/api\/projects\/[^/]+\/move$/.test(new URL(res.url()).pathname)
  );
}

// handleFileOpSuccess (App.tsx) refetches both /api/files and /api/projects unconditionally on
// every successful file operation (a file's project membership/aggregate counts can shift on
// copy/move) — waiting on both is what proves that frontend refetch-after-mutation wiring
// actually completed before the next step reads the table, not just that the API call itself
// resolved.
When("I confirm the copy in the file operation dialog", async ({ page }) => {
  await fillFileOpConfirmationIfPresent(page, "COPY");
  await Promise.all([isSingleFileCopy(page), isFilesRefetch(page), isProjectsRefetch(page), fileOpApplyButton(page).click()]);
});

When("I confirm the move in the file operation dialog", async ({ page }) => {
  await fillFileOpConfirmationIfPresent(page, "MOVE");
  await Promise.all([isSingleFileMove(page), isFilesRefetch(page), isProjectsRefetch(page), fileOpApplyButton(page).click()]);
});

// handleProjectOpSuccess (App.tsx) refetches both /api/projects and /api/files unconditionally
// (a project's member files move along with it), same reasoning as the file-op steps above.
When("I confirm the project move in the file operation dialog", async ({ page }) => {
  await fillFileOpConfirmationIfPresent(page, "MOVE");
  await Promise.all([isSingleProjectMove(page), isProjectsRefetch(page), isFilesRefetch(page), fileOpApplyButton(page).click()]);
});

// --- Location-disambiguated row assertions (copy.feature, move.feature, project-move.feature) --
//
// files.steps.ts's plain "I should see file ... in the table" is a bare `toHaveCount(1)` — wrong
// once a copy leaves two same-named rows visible, and unable to express "not at THIS location
// specifically" (as opposed to "not anywhere") for a move's old-location check. The steps below
// use `fileRowAtLocation` to scope by both filename AND the FileRow.tsx Location-cell text.

Then(
  "I should see {int} row(s) for file {string} in the table",
  async ({ page }, count: number, filename: string) => {
    await expect(fileRow(page, filename)).toHaveCount(count);
  }
);

Then(
  "I should not see file {string} at location {string} in the table",
  async ({ page }, filename: string, location: string) => {
    await expect(fileRowAtLocation(page, filename, location)).toHaveCount(0);
  }
);

Then(
  "the file {string} row at location {string} should show score {int}",
  async ({ page }, filename: string, location: string, value: number) => {
    await expect(fileRowAtLocation(page, filename, location).locator(`[aria-label="Score: ${value} of 5"]`)).toBeVisible();
  }
);

Then(
  "the file {string} row at location {string} should have tag {string}",
  async ({ page }, filename: string, location: string, tag: string) => {
    await expect(fileRowAtLocation(page, filename, location)).toContainText(tag);
  }
);
