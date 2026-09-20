/**
 * Step definitions for the header's Metrics panel (MetricsPanel.tsx) and the fixture-creation step
 * metrics-panel.feature needs to make its "Last Scan" assertion an exact count rather than a
 * regex — see that file's own doc comment for the full rationale.
 */

import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { getScratchDir } from "../support/testEnv.js";
import { resolveTagFullName } from "./statusesTagsCatalog.steps.js";

const { Given, When, Then } = createBdd();

function scratchMusicRoot(): string {
  return path.join(getScratchDir(), "music-root");
}

// A loose top-level file, deliberately never checked into e2e/support/fixtures/music-root (so
// globalSetup.ts's one seed scan never sees it) — created fresh by the step below instead, right
// before metrics-panel.feature's own scan, so that scan's change count is exact and predictable.
const METRICS_FIXTURE_FILENAME = "Metrics E2E New File.wav";

function metricsFixturePath(): string {
  return path.join(scratchMusicRoot(), METRICS_FIXTURE_FILENAME);
}

// Copies the same minimal, valid WAV fixture already used elsewhere in this suite
// (loose-exports/silence-stub.wav) rather than duplicating its raw bytes here. Re-copying on every
// run (rather than only writing if absent) is deliberate: the scanner's own "audio file" check is
// extension-only (see isAudioFile in audioDetector.ts), but its new-vs-modified check compares
// size/mtime against the DB fingerprint (see scanner.ts) — copying always bumps the destination's
// mtime, so a stress-test run that repeats this scenario several times within one suite invocation
// still gets a real, detected change every time (first run: "new"; later re-runs: "modified") —
// either way, exactly one changed file, which is what this step's caller actually needs.
Given("a new audio file exists in the production folder", async () => {
  const source = path.join(scratchMusicRoot(), "loose-exports", "silence-stub.wav");
  fs.copyFileSync(source, metricsFixturePath());
});

// `exact: true` matters here specifically because of this task's own fixture: any Audio Files
// row whose filename happens to contain "Metrics" (e.g. "Metrics E2E Tag Count.wav", used by
// metrics-panel-editable.feature) renders a per-row "Play <filename>" button whose accessible name
// contains "Metrics" as a substring — colliding with this header button under Playwright's default
// substring-and-case-insensitive `getByRole({name})` matching once that row is actually rendered
// (e.g. after a search-filter step narrows the table down to just that one file). Confirmed via a
// live `strict mode violation` failure while writing metrics-panel-editable.feature's scenario.
function metricsButton(page: Page) {
  return page.getByRole("button", { name: "Metrics", exact: true });
}

function metricsPanel(page: Page) {
  return page.getByRole("dialog", { name: "Library metrics" });
}

When("I open the metrics panel", async ({ page }) => {
  await metricsButton(page).click();
  await expect(metricsPanel(page)).toBeVisible();
});

// Matches the panel's "Last Scan" line exactly (see the `lastScanChanges === null ? ... : ...`
// text in MetricsPanel.tsx) — not scoped to just the "Last Scan" section specifically, since the
// panel's other tiles (Total Files/Draft/Unscored) never render this shape of text themselves.
Then("the metrics panel should show {string} for the last scan", async ({ page }, expectedText: string) => {
  await expect(metricsPanel(page).getByText(expectedText, { exact: true })).toBeVisible();
});

// --- Editable metrics (metrics-panel-editable.feature) ------------------------------------------
//
// `title` is always literally "Projects" or "Audio Files" (MetricsSection's own `title` prop in
// MetricsPanel.tsx) — every locator below is built from `metricsSection(page, title)`, itself
// scoped under `metricsPanel(page)`, never a bare `page.getByRole(...)`. This matters specifically
// for "Audio Files": that exact string is also the pre-existing tab-switcher button's accessible
// name, and Playwright's `getByRole({name})` substring-matches by default — an unscoped query
// would collide with it (a real, Reviewer-confirmed Task 4 finding — see the doc comment on
// e2e/features/scanning-settings/metrics-panel-editable.feature for the full citation).

type MetricsSectionTitle = "Projects" | "Audio Files";

// Each section's own root is the only element inside the dialog carrying the literal Tailwind
// class token "border-b" whose text content is exactly that section's title (the panel header row
// also has "border-b", but its own text is "Library Metrics", never "Projects"/"Audio Files").
function metricsSection(page: Page, title: MetricsSectionTitle) {
  return metricsPanel(page).locator("div.border-b", { hasText: title });
}

function metricsAddButton(page: Page, title: MetricsSectionTitle) {
  return metricsSection(page, title).getByRole("button", { name: `Add metric to ${title}` });
}

function metricsAddTypeSelect(page: Page, title: MetricsSectionTitle) {
  return metricsSection(page, title).getByLabel(`New ${title} metric type`);
}

function metricsAddValueSelect(page: Page, title: MetricsSectionTitle) {
  return metricsSection(page, title).getByLabel(`New ${title} metric value`);
}

function metricsConfirmAddButton(page: Page, title: MetricsSectionTitle) {
  return metricsSection(page, title).getByRole("button", { name: `Confirm adding ${title} metric` });
}

function metricsRemoveButton(page: Page, title: MetricsSectionTitle, label: string) {
  return metricsSection(page, title).getByRole("button", { name: `Remove ${label} from ${title} metrics` });
}

// A tile's own container carries the literal Tailwind class token "flex-col" — but so does the
// (only-rendered-while-open) add-metric form's own wrapper div, elsewhere in the same section. The
// `has` filter disambiguates: only a real, already-added tile contains a "Remove ... from ...
// metrics" button for this exact label.
//
// Deliberately NOT `has: metricsRemoveButton(page, title, label)` here: Playwright's `has` option
// re-applies the ENTIRE passed-in locator chain as a relative/descendant search under each
// candidate — since `metricsRemoveButton` is itself built from `metricsSection(page, title)` (an
// ANCESTOR condition, not a descendant one), that filter can never match anything (confirmed via a
// live "element(s) not found" failure while writing this scenario). Container is already
// guaranteed by the outer `metricsSection(page, title)` scoping this is chained from, so a plain,
// uniquely-worded button locator is both correct and safe here.
function metricsTile(page: Page, title: MetricsSectionTitle, label: string) {
  return metricsSection(page, title).locator("div.flex-col", {
    has: page.getByRole("button", { name: `Remove ${label} from ${title} metrics` }),
  });
}

function isMetricsSettingsPut(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "PUT" && new URL(res.url()).pathname === "/api/config/metrics-settings"
  );
}

When(
  "I add my tag {string} as a Tag metric to the Audio Files section",
  async ({ page }, baseTagName: string) => {
    const fullName = resolveTagFullName(page, baseTagName);
    const title: MetricsSectionTitle = "Audio Files";

    await metricsAddButton(page, title).click();
    await metricsAddTypeSelect(page, title).selectOption({ label: "Tag" });
    await metricsAddValueSelect(page, title).selectOption({ label: fullName });

    await Promise.all([isMetricsSettingsPut(page), metricsConfirmAddButton(page, title).click()]);
  }
);

When("I remove my tag {string} metric from the Audio Files section", async ({ page }, baseTagName: string) => {
  const fullName = resolveTagFullName(page, baseTagName);
  const title: MetricsSectionTitle = "Audio Files";

  await Promise.all([isMetricsSettingsPut(page), metricsRemoveButton(page, title, fullName).click()]);
});

Then(
  "the Audio Files metrics should show my tag {string} with count {int}",
  async ({ page }, baseTagName: string, count: number) => {
    const fullName = resolveTagFullName(page, baseTagName);
    const tile = metricsTile(page, "Audio Files", fullName);
    await expect(tile).toBeVisible();
    // The tile's own count span (Tailwind class token "text-xl", unique within one tile) — read
    // directly rather than via a regex, matching this suite's exact-count philosophy (see
    // metrics-panel.feature's own doc comment on this).
    await expect(tile.locator("span.text-xl")).toHaveText(String(count));
  }
);

Then("the Projects metrics should not show my tag {string}", async ({ page }, baseTagName: string) => {
  const fullName = resolveTagFullName(page, baseTagName);
  await expect(metricsTile(page, "Projects", fullName)).toHaveCount(0);
});

// Confirms the Projects section's own two default tiles (Total + the built-in Unknown-status
// tile — see defaultMetrics() in MetricsPanel.tsx) are still present and untouched, proving the
// Audio Files section's add/remove above patched only its own `filesMetrics` half of the settings
// object, not `projectsMetrics` too.
Then("the Projects metrics should still show its default tiles", async ({ page }) => {
  const section = metricsSection(page, "Projects");
  await expect(section.getByText("Total", { exact: true })).toBeVisible();
  await expect(section.getByText("Unknown", { exact: true })).toBeVisible();
});
