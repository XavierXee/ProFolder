import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  it("updates document.documentElement.dataset.theme and writes the new value to the new localStorage key when a ThemeSelector option is picked", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("profolder");

    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("option", { name: /Dark/ }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  });
});

describe("App - ThemeSelector wiring", () => {
  it("renders ThemeSelector in the header (replacing the old cycling toggle button), and selecting an option changes the real app state end-to-end", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForMount();

    // The old stopgap toggle button is gone.
    expect(screen.queryByRole("button", { name: "Switch to light mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch to dark mode" })).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "Theme" });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("ProFolder");
    expect(document.documentElement.dataset.theme).toBe("profolder");

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Light" }));

    // Real App state (not a mocked onChange) drove the document attribute and the trigger's
    // own displayed label.
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(screen.getByRole("button", { name: "Theme" })).toHaveTextContent("Light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
  });
});

describe("App - header branding", () => {
  it("renders the ProFolder heading and Logo, and no longer renders the old app name", async () => {
    render(<App />);
    await waitForMount();

    // Scoped to the heading role specifically: the ThemeSelector trigger button also displays
    // "ProFolder" as the current theme option's label, so a plain getByText("ProFolder") would
    // be ambiguous between the two elements.
    expect(screen.getByRole("heading", { name: "ProFolder" })).toBeInTheDocument();
    // Scoped to the header specifically: SplashScreen (mounted as a sibling overlay, per this
    // cycle's Task 5) also renders its own logo (data-testid="logo") for its ~1s lifetime, so a
    // page-wide getByTestId("logo") would be ambiguous between the header's and the splash's.
    const header = document.querySelector("header");
    expect(header).not.toBeNull();
    expect(within(header!).getByTestId("logo")).toBeInTheDocument();
    expect(screen.queryByText("Music Library Manager")).not.toBeInTheDocument();
  });

  it("renders the ProFolder name in the footer, not the old app name", async () => {
    render(<App />);
    await waitForMount();

    // Scoped to the footer element specifically: both the <h1> heading and the ThemeSelector
    // trigger button also render literal "ProFolder" text, so a page-wide getByText("ProFolder")
    // would be ambiguous between multiple elements (the same collision Task 4 hit).
    const footer = document.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(within(footer!).queryByText(/Music Library Manager/)).not.toBeInTheDocument();
    expect(within(footer!).getByText(/ProFolder/)).toBeInTheDocument();
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
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("option", { name: /Dark/ })); // profolder -> dark
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    expect(header!.className).toContain("bg-canvas/90");

    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("option", { name: "Light" })); // dark -> light
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(header!.className).toContain("bg-canvas/90");
  });
});
