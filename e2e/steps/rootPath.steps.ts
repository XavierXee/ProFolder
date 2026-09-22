/**
 * Step definitions for RootPathControl.tsx — the always-mounted "production folder" (musicRoot)
 * path editor that lives in the app header, next to (but wholly separate from) the "Prod Folder"
 * button that opens the scan settings panel (ScanFolderPanel.tsx, scanning.steps.ts) and the
 * "Settings" panel (SettingsPanel.tsx, settings.steps.ts). Those two are dialogs with their own
 * open/close steps; this one has no dialog role at all — it's a small inline toggle between a
 * read-only "changer" button and an inline edit form (input + Browse…/Save/Cancel). Different
 * enough in shape and concern (global `musicRoot` divert/restore, path validation, no-op Cancel)
 * that a dedicated file — rather than folding into either panel's steps file — keeps this task's
 * narrow scope isolated.
 *
 * Task 7.4 adds these — deliberately narrow: Save/Cancel/validation mechanics only. Never clicks
 * "Browse…" (a real native folder-picker dialog Playwright can't see/dismiss) and never triggers
 * a scan while the effective root is diverted. See root-path-control.feature's own doc comment
 * for why every scenario here is still `@scan-lock`-tagged despite never calling `POST /api/scan`
 * itself.
 */

import os from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { getScratchDir } from "../support/testEnv.js";

const { When, Then } = createBdd();

// The scratch music root every scenario in this suite is seeded against (see testEnv.ts /
// playwright.config.ts's `MUSIC_ROOT` webServer env). Scenario 3 below diverts the app's
// effective root away from this path temporarily, then saves it back — this is what every other
// scenario/task in the suite (in this file or any other) depends on still being true by the time
// this file's scenarios finish.
function scratchMusicRoot(): string {
  return path.join(getScratchDir(), "music-root");
}

// A deterministic, guaranteed-absent path (see e2e/support/fixtures/music-root's real folder
// listing — nothing there is named this) so `setMusicRootOverride`'s `fs.statSync` reliably
// throws. Nested under the scratch root (not, say, `/nonexistent`) purely so it's obviously
// scoped to this run's own scratch dir rather than colliding with anything on a real filesystem.
function nonexistentPath(): string {
  return path.join(scratchMusicRoot(), "Root Path Control E2E Nonexistent");
}

// `path.resolve()` mirrors exactly what the server does to the raw input before validating/
// persisting it (see `setMusicRootOverride` in musicRoot.ts) — computing the expected value the
// same way here (rather than hardcoding a string) is what keeps the display/API assertions below
// exact-match rather than approximate.
function temporaryValidPath(): string {
  return path.resolve(os.tmpdir());
}

function editInput(page: Page) {
  return page.getByLabel("Production folder path", { exact: true });
}

function saveButton(page: Page) {
  return page.getByRole("button", { name: "Save", exact: true });
}

function cancelButton(page: Page) {
  // Scoped to the header landmark: an unscoped exact "Cancel" match
  // collides with CreateCustomTabModal.tsx's own form Cancel button, which stays permanently
  // mounted (its own slide-animation fix) even while closed/off-screen.
  return page.getByRole("banner").getByRole("button", { name: "Cancel", exact: true });
}

function changeButton(page: Page) {
  return page.getByRole("button", { name: "Change production folder", exact: true });
}

function isMusicRootPut(page: Page) {
  return page.waitForResponse(
    (res) => res.request().method() === "PUT" && new URL(res.url()).pathname === "/api/config/music-root"
  );
}

// --- Cancel scenario's "no request was ever sent" proof -------------------------------------
//
// Registered once per page, from "I start editing the production folder path" (the first step
// every scenario below takes) — i.e. BEFORE any Save/Cancel action runs — so it can never miss a
// request fired by a later step. `page.on("request")` is a passive, real network-level observer
// (not a route interceptor that could alter behavior), and is checked only after a subsequent
// UI-settle assertion (the editor closing) has already proven the click handler ran to
// completion — see "no request to update the production folder path should have been sent"
// below for why that ordering makes this a deterministic proof rather than a timing-based guess.
const musicRootPutTracking = new WeakMap<Page, { seen: boolean }>();

function trackMusicRootPuts(page: Page) {
  if (musicRootPutTracking.has(page)) return;
  const state = { seen: false };
  musicRootPutTracking.set(page, state);
  page.on("request", (req) => {
    if (req.method() === "PUT" && new URL(req.url()).pathname === "/api/config/music-root") {
      state.seen = true;
    }
  });
}

When("I start editing the production folder path", async ({ page }) => {
  trackMusicRootPuts(page);
  await changeButton(page).click();
  await expect(editInput(page)).toBeVisible();
});

When("I type a path that does not exist as the production folder path", async ({ page }) => {
  await editInput(page).fill(nonexistentPath());
});

When("I type some throwaway text as the production folder path", async ({ page }) => {
  await editInput(page).fill("/this/path/should/never/reach/the/save/api");
});

When("I type a valid temporary folder path as the production folder path", async ({ page }) => {
  await editInput(page).fill(temporaryValidPath());
});

When("I type the original scratch production folder path", async ({ page }) => {
  await editInput(page).fill(scratchMusicRoot());
});

When("I save the production folder path", async ({ page }) => {
  await Promise.all([isMusicRootPut(page), saveButton(page).click()]);
});

When("I cancel editing the production folder path", async ({ page }) => {
  await cancelButton(page).click();
});

Then("I should see a production folder path validation error for the nonexistent path", async ({ page }) => {
  const expectedMessage = `Path does not exist: ${nonexistentPath()}`;
  await expect(page.getByText(expectedMessage, { exact: true })).toBeVisible();
});

Then("the production folder path editor should still be open", async ({ page }) => {
  await expect(editInput(page)).toBeVisible();
  await expect(saveButton(page)).toBeVisible();
});

Then("the production folder path editor should be closed", async ({ page }) => {
  await expect(changeButton(page)).toBeVisible();
  await expect(editInput(page)).toHaveCount(0);
});

Then("no request to update the production folder path should have been sent", async ({ page }) => {
  const state = musicRootPutTracking.get(page);
  if (!state) throw new Error('Expected "I start editing the production folder path" to have run first');
  expect(state.seen).toBe(false);
});

Then("the displayed production folder path should be the temporary folder path", async ({ page }) => {
  await expect(page.getByTitle(temporaryValidPath(), { exact: true })).toBeVisible();
});

Then("the displayed production folder path should be the original scratch production folder path", async ({
  page,
}) => {
  await expect(page.getByTitle(scratchMusicRoot(), { exact: true })).toBeVisible();
});

// App.tsx's `handleRootPathSave` banner — a plain, non-live-region `<div>`, matched by its fixed
// text (see the scan-complete banner's own equivalent step in scanning.steps.ts).
Then("I should see the production folder updated banner", async ({ page }) => {
  await expect(
    page.getByText("Production folder updated. Open Prod Folder and run a scan to index the new location.", {
      exact: true,
    })
  ).toBeVisible();
});

Then("the effective production folder path per the API should be the temporary folder path", async ({
  request,
}) => {
  const res = await request.get("/api/config");
  expect(res.ok(), `GET /api/config failed with status ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { musicRoot: string };
  expect(body.musicRoot).toBe(temporaryValidPath());
});

Then("the effective production folder path per the API should be the original scratch production folder path", async ({
  request,
}) => {
  const res = await request.get("/api/config");
  expect(res.ok(), `GET /api/config failed with status ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { musicRoot: string };
  expect(body.musicRoot).toBe(scratchMusicRoot());
});
