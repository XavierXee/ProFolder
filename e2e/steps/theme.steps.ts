/**
 * Step definitions for the dark/light theme toggle (App.tsx). Fully client-side: a click flips
 * `isDark` state, which an effect mirrors onto `documentElement.classList` ("light" class present
 * only in light mode, absent in dark — dark has no class of its own) and into
 * `localStorage["musicLibraryManager.isDark"]` ("true"/"false", default/absent-key = dark). No
 * backend involvement, so no scan-lock/serial tagging is needed here (see
 * e2e/features/theming/theme-toggle.feature).
 *
 * The toggle button has no static accessible name — its `aria-label`/`title` flip between
 * "Switch to light mode" (shown while dark) and "Switch to dark mode" (shown while light) — so it
 * must be located by a regex matching either phrasing, not a fixed string.
 */

import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { When, Then } = createBdd();

const THEME_STORAGE_KEY = "musicLibraryManager.isDark";

When("I toggle the theme", async ({ page }) => {
  await page.getByRole("button", { name: /Switch to (light|dark) mode/ }).click();
});

// "light" is the only class ever applied to <html> (see App.tsx's `classList.toggle("light", ...)`
// effect), so `toHaveClass("light")` / `not.toHaveClass(/light/)` fully captures both states.
// Verified empirically that `not.toHaveClass(/light/)` passes correctly for BOTH shapes the dark
// (no-class) state can take: a `class` attribute that was never set (value `null`) on first load,
// and one left as an empty string after `classList.remove` cleared it out following a prior
// toggle back from light — Playwright's class matchers handle both the same way.
Then("the theme should be {string}", async ({ page }, theme: string) => {
  const html = page.locator("html");
  if (theme === "light") {
    await expect(html).toHaveClass("light");
  } else {
    await expect(html).not.toHaveClass(/light/);
  }
});

Then("the stored theme preference should be {string}", async ({ page }, expected: string) => {
  const stored = await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY);
  expect(stored).toBe(expected);
});
