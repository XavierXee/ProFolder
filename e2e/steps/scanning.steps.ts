/**
 * Step definitions for the "Prod Folder" scan settings panel (ScanFolderPanel.tsx) — opened via
 * the header's "Prod Folder" button, which lives outside both tabs' content in App.tsx so it's
 * always reachable regardless of which tab (or other panel) is currently active.
 *
 * Task 7.1 adds these steps for the exclusion-toggle scenarios (see
 * e2e/features/scanning-settings/exclusion-toggles.feature) — the first scenarios in this suite
 * to trigger a real `POST /api/scan` mid-test, rather than relying solely on globalSetup.ts's one
 * seed scan.
 */

import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { When, Then } = createBdd();

function scanPanel(page: Page) {
  return page.getByRole("dialog", { name: "Production folder scan settings" });
}

When("I open the production folder scan settings panel", async ({ page }) => {
  await page.getByRole("button", { name: "Prod Folder", exact: true }).click();
  await expect(scanPanel(page)).toBeVisible();
});

When("I close the scan settings panel", async ({ page }) => {
  await scanPanel(page).getByRole("button", { name: "Close", exact: true }).click();
});

// The fixture folder used by exclusion-toggles.feature ("Scanning E2E Exclusion Toggle") sits
// directly under the scratch music root (depth 0) — FolderTreeNode.tsx auto-expands depth-0 nodes
// (`useState(depth < 1)` in ScanFolderPanel.tsx) and this fixture is deliberately top-level, so
// its checkbox is visible as soon as the tree loads, with no expand click needed. The checkbox's
// accessible name is exactly the folder's name: it's wrapped in a `<label>` with no other text
// besides the `<span>{node.name}</span>` sibling (the expand/collapse ▾/▸ button lives outside
// that label, so it never bleeds into the checkbox's computed accessible name).
function folderCheckbox(page: Page, folderName: string) {
  return scanPanel(page).getByRole("checkbox", { name: folderName, exact: true });
}

// Waits for the PUT this toggle fires (ScanFolderPanel.tsx's persistExclusions), the same
// wait-for-response-then-act pattern every other mutating step in this suite uses (see
// files.steps.ts's isPatchTo).
function isExclusionsPut(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "PUT" && new URL(res.url()).pathname === "/api/scan/exclusions"
  );
}

When("I toggle the {string} folder exclusion in the scan settings panel", async ({ page }, folderName: string) => {
  await Promise.all([isExclusionsPut(page), folderCheckbox(page, folderName).click()]);
});

// Matches the panel's own save-state text exactly ("Saving…"/"Saved"/"Failed to save — will
// retry on next change" — see the `saveState` div in ScanFolderPanel.tsx).
Then("the scan settings panel should show save state {string}", async ({ page }, label: string) => {
  await expect(scanPanel(page).getByText(label, { exact: true })).toBeVisible();
});

// handleStartScan (ScanFolderPanel.tsx) re-saves exclusions defensively, triggers the scan, then
// closes the panel itself on success — so this only needs to wait for the scan POST; the banner
// assertion below is what actually proves the scan completed and its result reached the app.
//
// Cross-file scan serialization: see the `@scan-lock` Before/After hooks in scanLockHooks.ts and
// their own doc comment for why a scenario-scoped (not just this one step's) lock is required.
When("I start a scan from the scan settings panel", async ({ page }) => {
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/scan"),
    scanPanel(page).getByRole("button", { name: "Scan", exact: true }).click(),
  ]);
});

// App.tsx's scan-complete banner (handleScanComplete) — a plain, non-live-region `<div>`, matched
// by its fixed text shape only. The actual counts reflect the whole scratch music root (every
// scan triggered here is a full production-folder scan, not scoped to this task's own fixture),
// so this deliberately doesn't assert specific numbers — table presence/absence assertions
// elsewhere in these scenarios are what prove this task's own fixture's outcome.
Then("I should see a scan complete banner", async ({ page }) => {
  await expect(
    page.getByText(/^Scan complete: \d+ audio files \(\d+ new, \d+ modified, \d+ removed\)\.$/)
  ).toBeVisible();
});

// --- Select All / Unselect All --------------------------------------------------------------
//
// Confusingly named but confirmed against the real component: "Select All" clears the exclusion
// set (`excluded = new Set()` — every folder included/selected) and "Unselect All" adds every
// top-level folder to it (every folder excluded/deselected) — see handleSelectAll/
// handleUnselectAll in ScanFolderPanel.tsx.

When("I click {string} in the scan settings panel", async ({ page }, buttonLabel: string) => {
  await Promise.all([
    isExclusionsPut(page),
    scanPanel(page).getByRole("button", { name: buttonLabel, exact: true }).click(),
  ]);
});

// The exclusion-count summary ("All folders included" / "N folder(s) excluded" — see the
// `excluded.size > 0 ? ... : "All folders included"` span in ScanFolderPanel.tsx).
Then("the scan settings panel should show the summary {string}", async ({ page }, summaryText: string) => {
  await expect(scanPanel(page).getByText(summaryText, { exact: true })).toBeVisible();
});

// Regex companion for the nonzero "N folder(s) excluded" summary — deliberately not hardcoding an
// exact top-level folder count, which would be brittle as later tasks add their own top-level
// fixtures under the scratch music root (see the .feature file's own comment on this).
Then("the scan settings panel should show a nonzero exclusion count", async ({ page }) => {
  await expect(scanPanel(page).getByText(/^\d+ folders? excluded$/)).toBeVisible();
});
