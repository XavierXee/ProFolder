import path from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { SHOWCASE_MUSIC_ROOT, SHOWCASE_OUTPUT_DIR } from "./showcaseLibrary.js";

/**
 * A slow, sequential tour of the app's features, recorded to video for demo purposes. This is a
 * presentation script, not a test: it asserts only what it needs to wait on before moving to the
 * next step. Run it with `npm run showcase` (see playwright.showcase.config.ts).
 *
 * Along the way it also saves the README's screenshots to docs/screenshots/, so re-running the
 * showcase refreshes them.
 */

const VIDEO_PATH = path.join(SHOWCASE_OUTPUT_DIR, "showcase.webm");
const SCREENSHOTS_DIR = path.resolve(import.meta.dirname, "..", "..", "docs", "screenshots");

// Headless video has no mouse pointer, so draw one (plus a click pulse) and a caption bar.
// Both are aria-hidden and ignore pointer events so they never affect the app or its locators.
const OVERLAY_SCRIPT = `
  window.addEventListener("DOMContentLoaded", () => {
    const cursor = document.createElement("div");
    cursor.id = "showcase-cursor";
    cursor.setAttribute("aria-hidden", "true");
    cursor.style.cssText = "position:fixed;top:0;left:0;width:22px;height:22px;margin:-11px 0 0 -11px;" +
      "border-radius:50%;background:rgba(255,255,255,0.35);border:2px solid rgba(20,20,20,0.85);" +
      "box-shadow:0 0 0 2px rgba(255,255,255,0.7);pointer-events:none;z-index:2147483647;" +
      "transition:transform 120ms ease, background 120ms ease;transform:translate(-100px,-100px);";
    document.body.appendChild(cursor);
    let x = -100, y = -100;
    const place = (scale) => { cursor.style.transform = "translate(" + x + "px," + y + "px) scale(" + scale + ")"; };
    window.addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; place(1); }, true);
    window.addEventListener("mousedown", () => { cursor.style.background = "rgba(255,190,60,0.8)"; place(0.75); }, true);
    window.addEventListener("mouseup", () => { cursor.style.background = "rgba(255,255,255,0.35)"; place(1); }, true);

    const caption = document.createElement("div");
    caption.id = "showcase-caption";
    caption.setAttribute("aria-hidden", "true");
    caption.style.cssText = "position:fixed;left:24px;bottom:24px;max-width:560px;padding:14px 18px;" +
      "border-radius:10px;background:rgba(12,12,16,0.88);color:#fff;font:15px/1.4 system-ui,sans-serif;" +
      "box-shadow:0 8px 30px rgba(0,0,0,0.35);pointer-events:none;z-index:2147483646;" +
      "opacity:0;transition:opacity 300ms ease;";
    document.body.appendChild(caption);
    window.__showcaseCaption = (title, subtitle) => {
      caption.innerHTML = "";
      const heading = document.createElement("div");
      heading.textContent = title;
      heading.style.cssText = "font-weight:600;font-size:18px;margin-bottom:4px;";
      const body = document.createElement("div");
      body.textContent = subtitle;
      body.style.opacity = "0.85";
      caption.append(heading, body);
      caption.style.opacity = "1";
    };

    // Screenshot helpers (see Showcase.snap): hide both overlays, and rewrite the demo
    // library's absolute path wherever it's displayed.
    const overlays = [cursor, caption];
    window.__showcaseBeforeSnap = (root) => {
      overlays.forEach((el) => { el.style.visibility = "hidden"; });
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeValue.includes(root)) node.nodeValue = node.nodeValue.split(root).join("~/Music");
      }
      for (const input of document.querySelectorAll("input")) {
        if (input.value.includes(root)) input.value = input.value.split(root).join("~/Music");
      }
    };
    window.__showcaseAfterSnap = () => {
      overlays.forEach((el) => { el.style.visibility = "visible"; });
    };
  });
`;

test("ProFolder feature showcase", async ({ page }) => {
  await page.addInitScript(OVERLAY_SCRIPT);
  const show = new Showcase(page);

  await page.goto("/");
  const projects = page.getByRole("table", { name: "Project folders" });
  await expect(projects.locator("tbody tr", { hasText: "Midnight Drive" })).toBeVisible();
  await page.mouse.move(720, 450);

  // --- Project Folders -------------------------------------------------------------------------
  await show.chapter("Project Folders", "Every DAW project in your production folder, detected automatically — Ableton, FL Studio, Pro Tools, Reaper, Studio One, Bitwig, Cubase…");
  for (const name of ["Midnight Drive", "Neon Horizon", "Ocean Echoes", "Paper Planes"]) {
    await show.hover(projects.locator("tbody tr", { hasText: name }));
  }
  await show.wait(1000);
  await show.snap("project-folders");

  await show.chapter("Sorting", "Click any column header to sort, click again to reverse.");
  await show.click(projects.getByRole("button", { name: "Sort by Score", exact: true }));
  await show.wait(1200);
  await show.click(projects.getByRole("button", { name: "Sort by Score", exact: true }));
  await show.wait(1200);
  await show.click(projects.getByRole("button", { name: "Sort by Project Folder", exact: true }));
  await show.wait(1000);

  await show.chapter("Search & filters", "Narrow the list down by name, status, score or tag.");
  const projectSearch = page.getByLabel("Search project folders");
  await show.type(projectSearch, "paper");
  await show.wait(1500);
  await show.clear(projectSearch);
  await show.toggleFilter("Status", "Need Mixing");
  await show.wait(1800);
  await show.toggleFilter("Status", "Need Mixing");
  await show.wait(800);

  await show.chapter("Project details", "Open a project to set its status, score and tags — changes cascade to the project's audio files.");
  await show.click(projects.locator("tbody tr", { hasText: "Golden Hour" }));
  const folderPanel = page.getByRole("dialog", { name: /^Folder detail: / });
  await expect(folderPanel).toBeVisible();
  await show.wait(1000);
  await show.click(folderPanel.getByRole("group", { name: "Select status" }).getByRole("button", { name: "Need Mixing", exact: true }));
  await show.wait(600);
  await show.click(folderPanel.getByRole("radiogroup", { name: "Set score" }).getByRole("radio", { name: "4 of 5" }));
  await show.wait(600);
  await show.addTag(folderPanel.getByPlaceholder("Add tag, press Enter…"), "acoustic");
  await show.addTag(folderPanel.getByPlaceholder("Add tag, press Enter…"), "summer");
  await show.wait(1200);
  await show.snap("project-detail");
  await show.click(folderPanel.getByRole("button", { name: "Close panel" }));
  await show.wait(800);

  await show.chapter("Batch edit", "Select several projects and update them all at once.");
  await show.click(projects.getByRole("checkbox", { name: "Select Static Bloom" }));
  await show.click(projects.getByRole("checkbox", { name: "Select Ocean Echoes" }));
  await show.click(page.getByRole("button", { name: /^Batch Edit/ }));
  const projectBatch = page.getByRole("dialog", { name: "Batch edit project folders" });
  await expect(projectBatch).toBeVisible();
  await show.wait(1000);
  await show.click(projectBatch.getByRole("radiogroup", { name: "Set score" }).getByRole("radio", { name: "3 of 5" }));
  await show.wait(500);
  await show.addTag(projectBatch.getByPlaceholder("Add tag, press Enter…"), "wip");
  await show.wait(1000);
  await show.snap("batch-edit");
  await show.click(projectBatch.getByRole("button", { name: "Close panel" }));
  await show.wait(1500);

  // --- Audio Files -----------------------------------------------------------------------------
  await show.chapter("Audio Files", "Every bounce, mix and export in one list — with its project, location, status, tags and score.");
  await show.click(page.getByRole("button", { name: "Audio Files", exact: true }));
  const files = page.getByRole("table", { name: "Audio files" });
  await expect(files.locator("tbody tr", { hasText: "Club Remix.wav" })).toBeVisible();
  await show.wait(1500);
  await show.snap("audio-files");
  await show.hover(files.locator("tbody tr", { hasText: "Summer Single - Radio Edit.wav" }).getByTestId("tag-chips"));
  await show.wait(1500);

  await show.chapter("Audio player", "Preview any file straight from the list.");
  await show.click(files.getByRole("button", { name: "Play Midnight Drive - Master.wav", exact: true }));
  await show.wait(2000);
  await show.snap("audio-player");
  await show.wait(2000);
  await show.click(page.getByRole("button", { name: "Close player" }));
  await show.wait(800);

  await show.chapter("Sorting & filtering files", "The same sorting and filters work on audio files.");
  await show.click(files.getByRole("button", { name: "Sort by Location", exact: true }));
  await show.wait(1200);
  await show.toggleFilter("Tags", "pop");
  await show.wait(1800);
  await show.toggleFilter("Tags", "pop");
  await show.wait(600);
  await show.click(files.getByRole("button", { name: "Sort by Track / File", exact: true }));
  await show.wait(1000);

  await show.chapter("Batch edit files", "Tag several files in one go.");
  await show.click(files.getByRole("checkbox", { name: "Select Club Remix.wav" }));
  await show.click(files.getByRole("checkbox", { name: "Select Summer Single - Extended Mix.wav" }));
  await show.click(page.getByRole("button", { name: /^Batch Edit/ }));
  const fileBatch = page.getByRole("dialog", { name: "Batch edit audio files" });
  await expect(fileBatch).toBeVisible();
  await show.wait(1000);
  await show.addTag(fileBatch.getByPlaceholder("Add tag, press Enter…"), "summer-ep");
  await show.wait(1000);
  await show.click(fileBatch.getByRole("button", { name: "Close panel" }));
  await show.wait(1500);
  await show.click(files.getByRole("checkbox", { name: "Select Club Remix.wav" }));
  await show.click(files.getByRole("checkbox", { name: "Select Summer Single - Extended Mix.wav" }));

  await show.chapter("File details", "Open a file to edit its status, score and tags.");
  await show.click(files.locator("tbody tr", { hasText: "Idea 02.wav" }));
  const filePanel = page.getByRole("dialog", { name: /^File detail: / });
  await expect(filePanel).toBeVisible();
  await show.wait(1000);
  await show.click(filePanel.getByRole("group", { name: "Select status" }).getByRole("button", { name: "Draft", exact: true }));
  await show.wait(500);
  await show.click(filePanel.getByRole("radiogroup", { name: "Set score" }).getByRole("radio", { name: "5 of 5" }));
  await show.wait(500);
  await show.addTag(filePanel.getByPlaceholder("Add tag, press Enter…"), "hook");
  await show.wait(1000);

  await show.chapter("Copy, move & delete", "Reorganize files on disk without leaving the app — metadata travels with them.");
  await show.click(filePanel.getByRole("button", { name: "Copy", exact: true }));
  const fileOp = page.getByRole("dialog", { name: /^(Copy|Move) /i });
  await expect(fileOp).toBeVisible();
  await show.wait(1000);
  await show.click(fileOp.getByRole("radio", { name: "Archive" }));
  await show.wait(600);
  await show.snap("copy-move-delete");
  const confirmInput = fileOp.getByLabel('Type "COPY" to confirm');
  if ((await confirmInput.count()) > 0) await show.type(confirmInput, "COPY");
  await show.wait(600);
  await show.click(fileOp.getByRole("button", { name: /^Copy/ }));
  await expect(fileOp).toHaveCount(0);
  if (await filePanel.isVisible()) await show.click(filePanel.getByRole("button", { name: "Close panel" }));
  const fileSearch = page.getByLabel("Search by filename or path");
  await show.type(fileSearch, "idea 02");
  await show.wait(2500);
  await show.clear(fileSearch);
  await show.wait(800);

  // --- Custom tabs -----------------------------------------------------------------------------
  await show.chapter("Custom tabs", "Save a filtered view as its own tab — here, every finished audio file.");
  await show.click(page.getByRole("button", { name: "Create custom tab" }));
  const createTab = page.getByRole("dialog", { name: "Create custom tab" });
  await expect(createTab).toBeVisible();
  await show.wait(800);
  await show.type(createTab.getByLabel("Name"), "Ready to Release");
  await show.click(createTab.getByRole("radio", { name: "Audio Files" }));
  await show.click(createTab.getByRole("button", { name: /^Status/ }));
  await show.click(createTab.getByRole("listbox", { name: "Filter by status" }).locator("label", { hasText: /^Done$/ }));
  await show.wait(600);
  await show.click(createTab.getByRole("button", { name: "Create" }));
  await expect(page.getByRole("button", { name: "Ready to Release", exact: true })).toBeVisible();
  await show.wait(2500);
  await show.snap("custom-tab");

  await show.click(page.getByRole("button", { name: "Show all tabs" }));
  const allTabs = page.getByRole("dialog", { name: "All tabs" });
  await show.wait(1500);
  await show.click(allTabs.getByRole("button", { name: "Go to tab Project Folders", exact: true }));
  await show.wait(1200);

  // --- Library management ----------------------------------------------------------------------
  await show.chapter("Statuses & tags", "Make the workflow yours: add, rename or recolor statuses and tags.");
  await show.click(page.getByRole("button", { name: "Statuses and tags" }));
  const catalog = page.getByRole("dialog", { name: "Statuses and tags" });
  await expect(catalog).toBeVisible();
  await show.wait(1200);
  await show.click(catalog.getByRole("button", { name: "Add status", exact: true }));
  await show.type(catalog.getByLabel("New status name"), "Mastering");
  await catalog.getByLabel("New status color").fill("#e0569b");
  await show.wait(500);
  await show.click(catalog.getByRole("button", { name: "Add", exact: true }));
  await show.wait(1800);
  await show.snap("statuses-and-tags");
  await show.click(page.getByRole("button", { name: "Close statuses and tags panel" }));
  await show.wait(800);

  await show.chapter("Library metrics", "An at-a-glance overview of your library and the latest scan.");
  await show.click(page.getByRole("button", { name: "Metrics", exact: true }));
  await expect(page.getByRole("dialog", { name: "Library metrics" })).toBeVisible();
  await show.wait(1500);
  await show.snap("metrics");
  await show.wait(1500);
  await show.click(page.getByRole("button", { name: "Close metrics panel" }));
  await show.wait(800);

  await show.chapter("Scanning", "Choose which folders to index, then rescan to pick up new work.");
  await show.click(page.getByRole("button", { name: "Scan Library", exact: true }));
  const scanPanel = page.getByRole("dialog", { name: "Production folder scan settings" });
  await expect(scanPanel).toBeVisible();
  await show.wait(2000);
  await show.snap("scan-settings");
  await show.click(scanPanel.getByRole("button", { name: "Scan", exact: true }));
  // The panel closes itself once the scan finishes, leaving the result banner on screen.
  await expect(page.getByText(/^Scan complete:/)).toBeVisible();
  await show.wait(2500);

  await show.chapter("Settings", "Exclusion rules, confirmations and more.");
  await show.click(page.getByRole("button", { name: "Settings", exact: true }));
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings).toBeVisible();
  await show.wait(1500);
  await show.snap("settings");
  await show.wait(1500);

  await show.chapter("Themes", "Default, Light or Dark.");
  for (const theme of ["Dark", "Light", "Default"]) {
    await show.click(settings.getByRole("button", { name: "Theme" }));
    await show.click(page.getByRole("listbox", { name: "Theme" }).getByRole("option", { name: theme, exact: true }));
    await show.wait(2000);
    if (theme === "Dark") await show.snap("theme-dark");
  }
  await show.click(settings.getByRole("button", { name: "Close panel", exact: true }));
  await show.wait(800);

  await show.chapter("ProFolder", "Your whole music production library, organized.");
  await show.wait(3000);

  const video = page.video();
  await page.close();
  await video?.saveAs(VIDEO_PATH);
  console.log(`[showcase] video saved to ${VIDEO_PATH}`);
});

class Showcase {
  constructor(private readonly page: Page) {}

  wait(ms: number) {
    return this.page.waitForTimeout(ms);
  }

  /** Saves a screenshot of the current screen to docs/screenshots/<name>.png, without the
   * showcase's own cursor and caption overlays. The demo library lives inside this checkout, so
   * its absolute path (shown in the header and detail panels) is swapped for "~/Music" first,
   * keeping the local machine's directory layout out of published images. */
  async snap(name: string) {
    await this.page.evaluate(`window.__showcaseBeforeSnap(${JSON.stringify(SHOWCASE_MUSIC_ROOT)})`);
    await this.page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`) });
    await this.page.evaluate("window.__showcaseAfterSnap()");
  }

  async chapter(title: string, subtitle: string) {
    await this.page.evaluate(`window.__showcaseCaption(${JSON.stringify(title)}, ${JSON.stringify(subtitle)})`);
    await this.wait(2200);
  }

  /** Glides the visible cursor to the element's centre. */
  async hover(locator: Locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) return;
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
    await this.wait(400);
  }

  async click(locator: Locator) {
    await this.hover(locator);
    await locator.click();
    await this.wait(300);
  }

  async type(locator: Locator, text: string) {
    await this.click(locator);
    await locator.pressSequentially(text, { delay: 110 });
  }

  async clear(locator: Locator) {
    await this.click(locator);
    await locator.fill("");
  }

  async addTag(input: Locator, tag: string) {
    await this.type(input, tag);
    await this.wait(300);
    await input.press("Enter");
    await this.wait(600);
  }

  /** Opens a Filters-toolbar picker, toggles one option, and closes it again. */
  async toggleFilter(picker: string, option: string) {
    await this.click(this.page.getByRole("toolbar", { name: "Filters" }).getByRole("button", { name: new RegExp(`^${picker}`) }));
    const listbox = this.page.getByRole("listbox", { name: `Filter by ${picker.toLowerCase()}` });
    await this.click(listbox.locator("label", { hasText: new RegExp(`^${option}$`) }));
    await this.wait(500);
    await this.page.keyboard.press("Escape");
  }
}
