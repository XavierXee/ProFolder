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

function metricsButton(page: Page) {
  return page.getByRole("button", { name: "Metrics" });
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
