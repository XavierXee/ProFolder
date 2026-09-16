import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.js";

// NOTE (jsdom limitation, per the project notes' documented environment limitation): jsdom does not
// implement layout/rendering, so these tests prove the correct token/class/attribute is applied
// per theme state (data-theme on <html>, localStorage persistence, which Tailwind token class
// names are present on converted chrome elements) — they do NOT prove resulting colors/fonts
// actually render correctly on screen. Visual confirmation of the token system was done
// separately via a real `npm run dev` + headless Playwright check (see this task's report), and
// even that only spot-checked a handful of tokens, not the full palette.

// App.tsx's mount effect fetches getConfig/getLastScan/getStats/getAllTags/getCustomTabs in
// addition to the paged getFiles/getProjects the two hooks fetch — every one of these is
// wrapped in `.catch(() => {})`, so an unmocked/rejected call is silently swallowed and
// produces a confusingly incomplete/empty render rather than a clear test failure. All seven
// must be mocked with resolved values.
vi.mock("../api/client.js", () => ({
  getFiles: vi.fn(),
  getProjects: vi.fn(),
  getConfig: vi.fn(),
  getLastScan: vi.fn(),
  getStats: vi.fn(),
  getAllTags: vi.fn(),
  getCustomTabs: vi.fn(),
}));

import * as api from "../api/client.js";

const mockGetFiles = vi.mocked(api.getFiles);
const mockGetProjects = vi.mocked(api.getProjects);
const mockGetConfig = vi.mocked(api.getConfig);
const mockGetLastScan = vi.mocked(api.getLastScan);
const mockGetStats = vi.mocked(api.getStats);
const mockGetAllTags = vi.mocked(api.getAllTags);
const mockGetCustomTabs = vi.mocked(api.getCustomTabs);

const THEME_KEY = "musicLibraryManager.theme";
const LEGACY_THEME_KEY = "musicLibraryManager.isDark";

beforeEach(() => {
  localStorage.clear();
  mockGetFiles.mockReset().mockResolvedValue({ files: [], total: 0, page: 1, pageSize: 50, totalPages: 1 });
  mockGetProjects.mockReset().mockResolvedValue({ projects: [], total: 0, page: 1, pageSize: 50, totalPages: 1 });
  mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music" });
  mockGetLastScan.mockReset().mockResolvedValue(undefined);
  mockGetStats.mockReset().mockResolvedValue({ total: 0, draftCount: 0, unscoredCount: 0 });
  mockGetAllTags.mockReset().mockResolvedValue([]);
  mockGetCustomTabs.mockReset().mockResolvedValue([]);
});

async function waitForMount() {
  // The Projects tab is the default landing tab; wait for its "no folders" empty state so we
  // know the initial render (and the useLayoutEffect that sets data-theme) has settled.
  await waitFor(() => expect(mockGetProjects).toHaveBeenCalled());
}

describe("App - theme default", () => {
  it("defaults to the profolder theme when localStorage has neither the new nor the legacy key", async () => {
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("profolder");
  });
});

describe("App - legacy theme migration", () => {
  it("migrates legacy isDark='true' to the new 'dark' theme", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "true");
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("migrates legacy isDark='false' to the new 'light' theme", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "false");
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("ignores the legacy key once the new key has already been written", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "true");
    localStorage.setItem(THEME_KEY, "light");
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("App - theme changes update the document attribute and persist to localStorage", () => {
  it("updates document.documentElement.dataset.theme and writes the new value to the new localStorage key when the toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("profolder");

    // Stopgap toggle cycles profolder -> dark -> light -> profolder (a proper dropdown lands in
    // a later task); starting from the profolder default, one click lands on "dark".
    await user.click(screen.getByRole("button", { name: "Switch to light mode" }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  });
});

describe("App - converted chrome elements carry token classes, not the old hardcoded ternary classes", () => {
  it("gives the header the bg-canvas/90 + border-border token classes regardless of theme value", async () => {
    render(<App />);
    await waitForMount();

    const header = document.querySelector("header");
    expect(header).not.toBeNull();
    // Token classes present...
    expect(header!.className).toContain("bg-canvas/90");
    expect(header!.className).toContain("border-border");
    // ...and the old hardcoded-hex ternary output is gone for good, regardless of theme.
    expect(header!.className).not.toContain("bg-[#0d0f14]");
    expect(header!.className).not.toContain("bg-[#f4f6f9]");

    // Same check holds after switching themes — the class itself never changes, only the
    // CSS custom property it resolves through does (confirmed separately via a real browser
    // check described in this task's report; jsdom can't confirm the resulting color here).
    // The stopgap toggle cycles profolder -> dark -> light -> profolder; isDark (theme !==
    // "light") stays true across both profolder and dark, so the button's aria-label only
    // flips to "Switch to dark mode" once the theme actually reaches "light".
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Switch to light mode" })); // profolder -> dark
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    expect(header!.className).toContain("bg-canvas/90");

    await user.click(screen.getByRole("button", { name: "Switch to light mode" })); // dark -> light
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(header!.className).toContain("bg-canvas/90");
  });
});
