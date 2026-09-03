/**
 * Step definitions for the "Settings" panel (SettingsPanel.tsx) — opened via the header's
 * "Settings" button (App.tsx), a wholly separate panel/mechanism from the "Prod Folder" scan
 * settings panel scanning.steps.ts covers: this panel's two checkboxes ("Exclude Samples
 * folders" / "Exclude Backup folders") persist via `PUT /api/config/scan-settings` and are
 * applied by `shouldIgnoreDir` (ignoreRules.ts) as an exact, case-insensitive folder-*name*
 * match ("samples"/"backup"), not the path-exclusion mechanism's exact relative-*path* match.
 *
 * Task 7.2 adds these steps for the name-based exclusion-toggle scenarios (see
 * e2e/features/scanning-settings/scan-settings.feature), which reuse scanning.steps.ts's own
 * scan-triggering steps ("I open the production folder scan settings panel" / "I start a scan
 * from the scan settings panel" / "I should see a scan complete banner") rather than duplicating
 * them here.
 */

import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { When, Then } = createBdd();

// `exact: true` is required here: Playwright's default accessible-name matching is a
// case-insensitive substring match, and the "Prod Folder" panel's own `aria-label`
// ("Production folder scan settings" — see scanning.steps.ts) contains "settings" as a
// substring, which would otherwise make this locator ambiguous whenever both panels exist in
// the DOM (SettingsPanel.tsx/ScanFolderPanel.tsx stay mounted, just translated off-screen, when
// closed — see the `translate-x-full` class toggling on `open`).
function settingsPanel(page: Page) {
  return page.getByRole("dialog", { name: "Settings", exact: true });
}

When("I open the settings panel", async ({ page }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(settingsPanel(page)).toBeVisible();
});

// Required before opening the "Prod Folder" scan settings panel while this one is still open:
// unlike ScanFolderPanel.tsx (which auto-closes itself on a successful scan — see
// scanning.steps.ts's own comment), SettingsPanel.tsx has no such handoff, and its full-screen
// backdrop (`fixed inset-0 z-30 ...`, rendered whenever `open`) intercepts pointer events across
// the header even though clicking "Prod Folder" would itself flip `showSettings` to false in
// App.tsx — the click never lands because the backdrop is in the way first.
When("I close the settings panel", async ({ page }) => {
  await settingsPanel(page).getByRole("button", { name: "Close panel", exact: true }).click();
});

// SettingRow's <label> wraps the checkbox AND two text spans (the setting's own visible label
// plus its description), with no `aria-label` narrowing the checkbox's computed accessible name
// to just the label — unlike ScanFolderPanel.tsx's folder checkboxes (see scanning.steps.ts's own
// comment on that distinction), a role/name lookup here would match on label+description text
// concatenated. Locating via the <label> element's own text content instead (then descending to
// its checkbox) sidesteps that and matches on just the visible label, which is unique per row.
function settingCheckbox(page: Page, label: string) {
  return settingsPanel(page).locator("label", { hasText: label }).locator('input[type="checkbox"]');
}

// Waits for the PUT this toggle fires (SettingsPanel.tsx's handleChange -> api.setScanSettings),
// the same wait-for-response-then-act pattern every other mutating step in this suite uses (see
// scanning.steps.ts's isExclusionsPut).
function isScanSettingsPut(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "PUT" && new URL(res.url()).pathname === "/api/config/scan-settings"
  );
}

When("I toggle {string} in the settings panel", async ({ page }, label: string) => {
  await Promise.all([isScanSettingsPut(page), settingCheckbox(page, label).click()]);
});

// Matches the panel's own save-state text exactly ("Saving…"/"Saved"/"Failed to save" — see the
// `saveState` block in SettingsPanel.tsx). Note this panel's error text has no trailing
// "— will retry on next change" suffix, unlike ScanFolderPanel.tsx's equivalent.
Then("the settings panel should show save state {string}", async ({ page }, label: string) => {
  await expect(settingsPanel(page).getByText(label, { exact: true })).toBeVisible();
});
