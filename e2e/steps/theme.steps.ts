/**
 * Step definitions for the 3-way Default/Light/Dark theme dropdown (ThemeSelector.tsx,
 * wired into App.tsx). Fully client-side: selecting an option calls `setTheme`, which a
 * `useLayoutEffect` in App.tsx mirrors onto `document.documentElement.dataset.theme` (i.e.
 * `<html data-theme="...">`, one of "profolder"/"light"/"dark" — NOT a `.light`/`.dark` CSS
 * class) and into `localStorage["musicLibraryManager.theme"]` (the raw theme string, not a
 * boolean). That effect also runs on initial mount, so even the untouched default ("profolder")
 * is written to both `data-theme` and localStorage as soon as the app loads. No backend
 * involvement (no shared/global state, no scan), and each scenario gets its own fresh browser
 * context with isolated localStorage, so no `@mode:serial`/`@scan-lock` tagging is needed here
 * (mirrors the reasoning that already applied to the old single-toggle version of this file).
 *
 * The dropdown trigger's accessible name is the static `aria-label="Theme"` (NOT its visible
 * text, which is the currently-selected option's own label and changes as the theme changes —
 * see ThemeSelector.tsx's doc comment on why it needed an explicit aria-label to avoid colliding
 * with other same-named accessible controls elsewhere in the view). The listbox shares that same
 * `aria-label="Theme"`. Each option's accessible name is its visible label text exactly
 * ("Default"/"Light"/"Dark").
 */

import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { When, Then } = createBdd();

const THEME_STORAGE_KEY = "musicLibraryManager.theme";

function themeTrigger(page: import("@playwright/test").Page) {
  return page.getByRole("button", { name: "Theme" });
}

When("I open the theme dropdown", async ({ page }) => {
  await themeTrigger(page).click();
});

When("I select the {string} theme option", async ({ page }, label: string) => {
  await page.getByRole("listbox", { name: "Theme" }).getByRole("option", { name: label, exact: true }).click();
});

Then("the page theme should be {string}", async ({ page }, theme: string) => {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
});

Then("the stored theme preference should be {string}", async ({ page }, expected: string) => {
  const stored = await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY);
  expect(stored).toBe(expected);
});

Then("the theme selector should show {string}", async ({ page }, label: string) => {
  await expect(themeTrigger(page)).toContainText(label);
});
