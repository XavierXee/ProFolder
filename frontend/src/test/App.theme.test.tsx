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
  setMusicRoot: vi.fn(),
}));

import * as api from "../api/client.js";

const mockGetFiles = vi.mocked(api.getFiles);
const mockGetProjects = vi.mocked(api.getProjects);
const mockGetConfig = vi.mocked(api.getConfig);
const mockGetLastScan = vi.mocked(api.getLastScan);
const mockGetStats = vi.mocked(api.getStats);
const mockGetAllTags = vi.mocked(api.getAllTags);
const mockGetCustomTabs = vi.mocked(api.getCustomTabs);
const mockSetMusicRoot = vi.mocked(api.setMusicRoot);

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
  mockSetMusicRoot.mockReset();
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

// Task 8 of the theming rework: the isProFolder JS ternary for tab button classes (the last two
// live isDark/isProFolder consumers anywhere in the codebase) was replaced by a single static
// className (see App.tsx's tabButtonClassName helper) that unconditionally carries both the
// underline-tab structural/color classes (border-b-2, -mb-px, border-blue-500/text-blue-400,
// etc.) AND the profolder:-prefixed override classes (profolder:border, profolder:bg-accent,
// etc.) — the exact same string renders for every theme; only the compiled CSS's
// higher-specificity `[data-theme="profolder"] &` selector (see index.css's `@custom-variant
// profolder`) decides which set of rules actually wins visually for a given theme. These
// assertions therefore expect the SAME exact className string under all three themes, which is
// itself the proof no JS branching survives on this element (a stale isProFolder ternary would
// produce two different strings across themes, as the pre-Task-8 version of this describe block
// asserted). jsdom cannot evaluate the CSS attribute-selector cascade itself (see file-level NOTE),
// so these tests prove the class list, not which ruleset visually wins.
describe("App - tab switcher styling per theme", () => {
  const ACTIVE_CLASSNAME =
    "px-3 py-2.5 text-xs font-mono font-medium uppercase tracking-wider border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 profolder:border profolder:mb-0 profolder:rounded-[var(--rt-radius)] border-blue-500 text-blue-400 profolder:bg-accent profolder:text-accent-ink profolder:border-accent";
  const INACTIVE_CLASSNAME =
    "px-3 py-2.5 text-xs font-mono font-medium uppercase tracking-wider border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 profolder:border profolder:mb-0 profolder:rounded-[var(--rt-radius)] border-transparent text-slate-500 hover:text-ink profolder:bg-surface profolder:text-ink-muted profolder:border-border";

  it("renders the exact same active/inactive tab classNames under the profolder theme", async () => {
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("profolder");

    const activeTab = screen.getByRole("button", { name: "Project Folders" });
    const inactiveTab = screen.getByRole("button", { name: "Audio Files" });

    expect(activeTab.className).toBe(ACTIVE_CLASSNAME);
    expect(inactiveTab.className).toBe(INACTIVE_CLASSNAME);
  });

  it("renders the exact same active/inactive tab classNames under the dark theme (no JS branch on theme)", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "true");
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("dark");

    const activeTab = screen.getByRole("button", { name: "Project Folders" });
    const inactiveTab = screen.getByRole("button", { name: "Audio Files" });

    expect(activeTab.className).toBe(ACTIVE_CLASSNAME);
    expect(inactiveTab.className).toBe(INACTIVE_CLASSNAME);
  });

  it("renders the exact same active/inactive tab classNames under the light theme (no JS branch on theme)", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "false");
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("light");

    const activeTab = screen.getByRole("button", { name: "Project Folders" });
    const inactiveTab = screen.getByRole("button", { name: "Audio Files" });

    expect(activeTab.className).toBe(ACTIVE_CLASSNAME);
    expect(inactiveTab.className).toBe(INACTIVE_CLASSNAME);
  });

  it("swaps the active/inactive classNames when switching tabs, regardless of theme", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("profolder");

    const projectsTab = screen.getByRole("button", { name: "Project Folders" });
    const filesTab = screen.getByRole("button", { name: "Audio Files" });

    expect(projectsTab.className).toBe(ACTIVE_CLASSNAME);
    expect(filesTab.className).toBe(INACTIVE_CLASSNAME);

    await user.click(filesTab);

    await waitFor(() => expect(filesTab.className).toBe(ACTIVE_CLASSNAME));
    expect(projectsTab.className).toBe(INACTIVE_CLASSNAME);
  });
});

// Task 3 of the theming rework removed isDark/isProFolder from FilterBar/ProjectsFilterBar/
// FilterToolbar entirely: the sectionLabel element is now always rendered (whenever the
// sectionLabel prop is provided, which App.tsx always does for both bars) and its per-theme
// visibility is gated purely by the CSS-only `hidden profolder:inline` variant pair, not a JS
// isProFolder conditional. jsdom does not evaluate CSS custom variants/media queries, so these
// tests can only prove the element and its class list, not the resulting visual visibility per
// theme (see the file-level NOTE above).
describe("App - FilterToolbar sectionLabel wiring (ProjectsFilterBar/FilterBar)", () => {
  it("renders the PROJECT FOLDERS sectionLabel on the Projects tab, and the AUDIO FILES sectionLabel after switching to the Files tab, with the hidden/profolder:inline CSS-variant classes, regardless of theme", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("profolder");

    // Projects is the default landing tab.
    const projectsLabel = screen.getByText("PROJECT FOLDERS");
    expect(projectsLabel).toBeInTheDocument();
    expect(projectsLabel.className).toContain("hidden");
    expect(projectsLabel.className).toContain("profolder:inline");

    await user.click(screen.getByRole("button", { name: "Audio Files" }));

    await waitFor(() => expect(screen.getByText("AUDIO FILES")).toBeInTheDocument());
    const filesLabel = screen.getByText("AUDIO FILES");
    expect(filesLabel.className).toContain("hidden");
    expect(filesLabel.className).toContain("profolder:inline");
    // The Projects tab's own bar unmounts when the Files tab is active (only one tab's bar is
    // ever mounted at a time) -- this swap is a mount/unmount effect, unrelated to theme.
    expect(screen.queryByText("PROJECT FOLDERS")).not.toBeInTheDocument();
  });

  it("still renders both sectionLabel elements (with the same CSS-variant classes) in the DOM under the dark theme, since visibility is CSS-gated, not JS-conditional", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "true");
    const user = userEvent.setup();
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("dark");

    const projectsLabel = screen.getByText("PROJECT FOLDERS");
    expect(projectsLabel.className).toContain("hidden");
    expect(projectsLabel.className).toContain("profolder:inline");

    await user.click(screen.getByRole("button", { name: "Audio Files" }));
    const filesLabel = screen.getByText("AUDIO FILES");
    expect(filesLabel.className).toContain("hidden");
    expect(filesLabel.className).toContain("profolder:inline");
  });

  it("still renders both sectionLabel elements (with the same CSS-variant classes) in the DOM under the light theme, since visibility is CSS-gated, not JS-conditional", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "false");
    const user = userEvent.setup();
    render(<App />);
    await waitForMount();
    expect(document.documentElement.dataset.theme).toBe("light");

    const projectsLabel = screen.getByText("PROJECT FOLDERS");
    expect(projectsLabel.className).toContain("hidden");
    expect(projectsLabel.className).toContain("profolder:inline");

    await user.click(screen.getByRole("button", { name: "Audio Files" }));
    const filesLabel = screen.getByText("AUDIO FILES");
    expect(filesLabel.className).toContain("hidden");
    expect(filesLabel.className).toContain("profolder:inline");
  });
});

describe("App - converted chrome elements carry token classes, not the old hardcoded ternary classes", () => {
  it("gives the header the bg-chrome/90 + border-border token classes regardless of theme value (Task 1.5: header/footer/logo-tile stay Rack Black chrome even though canvas/surface are now light under profolder)", async () => {
    render(<App />);
    await waitForMount();

    const header = document.querySelector("header");
    expect(header).not.toBeNull();
    // Token classes present...
    expect(header!.className).toContain("bg-chrome/90");
    expect(header!.className).toContain("border-border");
    // ...and neither the old hardcoded-hex ternary output nor the pre-Task-1.5 bg-canvas/90
    // class is present, regardless of theme.
    expect(header!.className).not.toContain("bg-[#0d0f14]");
    expect(header!.className).not.toContain("bg-[#f4f6f9]");
    expect(header!.className).not.toContain("bg-canvas/90");

    // Same check holds after switching themes — the class itself never changes, only the
    // CSS custom property it resolves through does (confirmed separately via a real browser
    // check described in this task's report; jsdom can't confirm the resulting color here).
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("option", { name: /Dark/ })); // profolder -> dark
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    expect(header!.className).toContain("bg-chrome/90");

    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("option", { name: "Light" })); // dark -> light
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(header!.className).toContain("bg-chrome/90");
  });

  it("gives the footer an explicit bg-chrome class regardless of theme value (it used to inherit bg-canvas from the page wrapper, which is now light under profolder and would otherwise turn the footer light too)", async () => {
    render(<App />);
    await waitForMount();

    const footer = document.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(footer!.className).toContain("bg-chrome");
    expect(document.documentElement.dataset.theme).toBe("profolder");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("option", { name: /Dark/ })); // profolder -> dark
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    expect(footer!.className).toContain("bg-chrome");

    await user.click(screen.getByRole("button", { name: "Theme" }));
    await user.click(screen.getByRole("option", { name: "Light" })); // dark -> light
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(footer!.className).toContain("bg-chrome");
  });
});

// Task 4 of the theming rework: App.tsx's own remaining direct isDark/isProFolder JSX usages
// (header title/subtitle, metrics-button unscored badge, info/error banners, footer, "+"
// create-tab button) were converted to token classes. These assertions prove the token class is
// present, not the resulting rendered color (see file-level NOTE on the jsdom limitation).
describe("App - Task 4 token-converted elements", () => {
  it("gives the header title/subtitle the chrome-ink/chrome-ink-faint token classes", async () => {
    render(<App />);
    await waitForMount();

    expect(screen.getByRole("heading", { name: "ProFolder" })).toHaveClass("text-chrome-ink");
    expect(screen.getByText("Local Scan Console")).toHaveClass("text-chrome-ink-faint");
  });

  it("gives the footer the chrome-ink-faint/border-chrome-border-faint token classes", async () => {
    render(<App />);
    await waitForMount();

    const footer = document.querySelector("footer")!;
    expect(footer.className).toContain("border-chrome-border-faint");
    within(footer).getAllByText(/ProFolder|Score and tag/).forEach((el) => expect(el).toHaveClass("text-chrome-ink-faint"));
  });

  it("gives the metrics unscored-count badge the notice token classes", async () => {
    mockGetStats.mockReset().mockResolvedValue({ total: 5, draftCount: 1, unscoredCount: 2 });
    render(<App />);
    await waitForMount();

    const badge = await screen.findByText("2");
    expect(badge).toHaveClass("bg-notice-surface");
    expect(badge).toHaveClass("text-notice");
  });

  it("gives the create-custom-tab '+' button the border-border/text-ink-muted token classes plus the profolder:bg-surface variant", async () => {
    render(<App />);
    await waitForMount();

    const createButton = screen.getByRole("button", { name: "Create custom tab" });
    expect(createButton.className).toContain("border-border");
    expect(createButton.className).toContain("text-ink-muted");
    expect(createButton.className).toContain("hover:text-ink");
    expect(createButton.className).toContain("hover:bg-surface-hover");
    expect(createButton.className).toContain("profolder:bg-surface");
  });

  it("gives the Files-tab error banner the danger token classes when getFiles rejects", async () => {
    mockGetFiles.mockReset().mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<App />);
    await waitForMount();

    await user.click(screen.getByRole("button", { name: "Audio Files" }));

    const errorBanner = await screen.findByText("boom");
    expect(errorBanner).toHaveClass("bg-danger-surface");
    expect(errorBanner).toHaveClass("text-danger");
  });

  it("gives the production-folder-updated banner the info token classes", async () => {
    mockSetMusicRoot.mockResolvedValue({ musicRoot: "/new/music/root" });
    const user = userEvent.setup();
    render(<App />);
    await waitForMount();

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    const input = screen.getByRole("textbox", { name: "Production folder path" });
    await user.clear(input);
    await user.type(input, "/new/music/root{Enter}");

    const banner = await screen.findByText(/Production folder updated/);
    expect(banner).toHaveClass("bg-info-surface");
    expect(banner).toHaveClass("text-info");
  });
});
