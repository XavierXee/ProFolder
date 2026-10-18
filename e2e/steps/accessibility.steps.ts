import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { When, Then } = createBdd();

// Plain CSS attribute selectors rather than page.getByRole(...) throughout this file
// deliberately: `inert` removes an element from the accessibility tree per spec (that's part
// of what it's being used to fix here), so a role-based locator could legitimately fail to
// find — or worse, ambiguously match a different same-named control elsewhere — a button while
// its panel is closed. A raw CSS selector finds it in the DOM regardless, which is what these
// scenarios need: they're specifically testing whether a still-physically-present element can
// be focused, not whether it's exposed to assistive tech (a separate, already-implied question).

When("I press Tab", async ({ page }) => {
  await page.keyboard.press("Tab");
});

When("I open the Settings panel", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
});

When("I open the Create Custom Tab modal", async ({ page }) => {
  await page.getByRole("button", { name: "Create custom tab" }).click();
});

When("I open the All Tabs panel", async ({ page }) => {
  await page.getByRole("button", { name: "Show all tabs" }).click();
});

Then("the focused element should be visible", async ({ page }) => {
  await expect(page.locator(":focus")).toBeVisible();
});

function settingsCloseButton(page: import("@playwright/test").Page) {
  return page.locator('[role="dialog"][aria-label="Settings"] button[aria-label="Close panel"]');
}

Then("the Settings panel's close button should not be focusable", async ({ page }) => {
  const closeButton = settingsCloseButton(page);
  // locator.focus() only requires the element to be attached to the DOM, not visible — so this
  // still reaches the real, still-physically-present (just slid off-screen and inert) button and
  // calls the browser's own DOM focus() on it, which is exactly what this is testing: whether
  // the browser's own `inert` handling actually blocks the focus from taking.
  await closeButton.focus();
  await expect(closeButton).not.toBeFocused();
});

Then("the Settings panel's close button should be focusable", async ({ page }) => {
  const closeButton = settingsCloseButton(page);
  await closeButton.focus();
  await expect(closeButton).toBeFocused();
});

function createCustomTabNameField(page: import("@playwright/test").Page) {
  return page.locator('[role="dialog"][aria-label="Create custom tab"] #custom-tab-name');
}

Then("the Create Custom Tab modal's name field should not be focusable", async ({ page }) => {
  const nameField = createCustomTabNameField(page);
  await nameField.focus();
  await expect(nameField).not.toBeFocused();
});

Then("the Create Custom Tab modal's name field should be focusable", async ({ page }) => {
  const nameField = createCustomTabNameField(page);
  await nameField.focus();
  await expect(nameField).toBeFocused();
});

function allTabsPanelCloseButton(page: import("@playwright/test").Page) {
  return page.locator('[role="dialog"][aria-label="All tabs"] button[aria-label="Close panel"]');
}

Then("the All Tabs panel's close button should not be focusable", async ({ page }) => {
  const closeButton = allTabsPanelCloseButton(page);
  await closeButton.focus();
  await expect(closeButton).not.toBeFocused();
});

Then("the All Tabs panel's close button should be focusable", async ({ page }) => {
  const closeButton = allTabsPanelCloseButton(page);
  await closeButton.focus();
  await expect(closeButton).toBeFocused();
});
