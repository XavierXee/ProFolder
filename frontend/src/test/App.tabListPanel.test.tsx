import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.js";
import type { AudioFile, CustomTab, Project } from "../types.js";
import type { LibraryStats, PagedFiles, PagedProjects } from "../api/client.js";

// Same mock-everything-the-mount-effect-fetches rationale as App.customTabs.test.tsx (see that
// file's own top comment) — every one of these is wrapped in `.catch(() => {})` in App.tsx, so
// an unmocked/rejected call silently produces a confusingly incomplete render instead of a clear
// test failure.
vi.mock("../api/client.js", () => ({
  getFiles: vi.fn(),
  getProjects: vi.fn(),
  getConfig: vi.fn(),
  getLastScan: vi.fn(),
  getStats: vi.fn(),
  getAllTags: vi.fn(),
  getStatuses: vi.fn(),
  getCustomTabs: vi.fn(),
  createCustomTab: vi.fn(),
  deleteCustomTab: vi.fn(),
  reorderCustomTabs: vi.fn(),
  getConfirmationSettings: vi.fn(),
  getPaginationSettings: vi.fn(),
}));

import * as api from "../api/client.js";

const mockGetFiles = vi.mocked(api.getFiles);
const mockGetProjects = vi.mocked(api.getProjects);
const mockGetConfig = vi.mocked(api.getConfig);
const mockGetLastScan = vi.mocked(api.getLastScan);
const mockGetStats = vi.mocked(api.getStats);
const mockGetAllTags = vi.mocked(api.getAllTags);
const mockGetStatuses = vi.mocked(api.getStatuses);
const mockGetCustomTabs = vi.mocked(api.getCustomTabs);
const mockGetConfirmationSettings = vi.mocked(api.getConfirmationSettings);
const mockGetPaginationSettings = vi.mocked(api.getPaginationSettings);

function makeFile(overrides: Partial<AudioFile> = {}): AudioFile {
  return {
    id: "file-1",
    path: "/music/Drums/Kick One.wav",
    relativePath: "Drums/Kick One.wav",
    filename: "Kick One.wav",
    extension: ".wav",
    size: 1000,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    containingFolder: "Drums",
    status: "unknown",
    tags: [],
    score: null,
    notes: "",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    ...overrides,
  };
}

type ProjectRow = Project & { audioFileCount: number };

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "proj-1",
    name: "Alpha Sessions",
    path: "/music/Alpha Sessions",
    hasVideo: false,
    hasImage: false,
    status: "draft",
    tags: [],
    score: null,
    notes: "",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    contentModifiedAt: null,
    audioFileCount: 3,
    ...overrides,
  };
}

function makeCustomTab(overrides: Partial<CustomTab> = {}): CustomTab {
  return {
    id: 1,
    name: "Tab Bar List A",
    type: "files",
    statuses: [],
    scores: [],
    tags: [],
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const FILES_PAGE: PagedFiles = {
  files: [makeFile({ id: "file-1", filename: "Kick One.wav", relativePath: "Drums/Kick One.wav" })],
  total: 1,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

const PROJECTS_PAGE: PagedProjects = {
  projects: [makeProject({ id: "proj-1", name: "Alpha Sessions" })],
  total: 1,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

const STATS: LibraryStats = {
  files: { total: 1, byStatus: { unknown: 1, draft: 0, needs_mixing: 0, done: 0, released: 0 } },
  projects: { total: 0, byStatus: { unknown: 0, draft: 0, needs_mixing: 0, done: 0, released: 0 } },
};

beforeEach(() => {
  mockGetFiles.mockReset().mockResolvedValue(FILES_PAGE);
  mockGetProjects.mockReset().mockResolvedValue(PROJECTS_PAGE);
  mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music", runtimeMode: "web" });
  mockGetLastScan.mockReset().mockResolvedValue(undefined);
  mockGetStats.mockReset().mockResolvedValue(STATS);
  mockGetAllTags.mockReset().mockResolvedValue([]);
  mockGetStatuses.mockReset().mockResolvedValue([]);
  mockGetCustomTabs.mockReset().mockResolvedValue([
    makeCustomTab({ id: 1, name: "Tab Bar List A" }),
    makeCustomTab({ id: 2, name: "Tab Bar List B" }),
  ]);
  mockGetConfirmationSettings.mockReset().mockResolvedValue({
    confirmTabDeletion: false,
    confirmCopy: false,
    confirmMove: false,
    confirmDelete: false,
    confirmStatusDeletion: false,
    confirmTagDeletion: false,
  });
  mockGetPaginationSettings.mockReset().mockResolvedValue({ itemsPerPage: 50 });
});

describe("App - 'All tabs' burger button and list panel", () => {
  it("opens the panel listing Project Folders, Audio Files, and every custom tab, in that order", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetCustomTabs).toHaveBeenCalled());
    await screen.findByRole("button", { name: "Tab Bar List A" });

    await user.click(screen.getByRole("button", { name: "Show all tabs" }));

    const dialog = screen.getByRole("dialog", { name: "All tabs" });
    const buttons = within(dialog)
      .getAllByRole("button")
      .filter((b) => b !== within(dialog).getByRole("button", { name: "Close panel" }));
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Project Folders",
      "Audio Files",
      "Tab Bar List A",
      "Tab Bar List B",
    ]);
  });

  it("clicking a custom tab in the panel navigates to it and closes the panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetCustomTabs).toHaveBeenCalled());
    await screen.findByRole("button", { name: "Tab Bar List B" });

    await user.click(screen.getByRole("button", { name: "Show all tabs" }));
    const dialog = screen.getByRole("dialog", { name: "All tabs" });
    await user.click(within(dialog).getByRole("button", { name: "Go to tab Tab Bar List B" }));

    await waitFor(() => expect(dialog).toHaveClass(/translate-x-full/));
    expect(screen.getByRole("main", { name: "Tab Bar List B files" })).toBeInTheDocument();
    // The tab bar's own button for the now-active tab reflects it too, not just the panel.
    expect(screen.getByRole("button", { name: "Tab Bar List B" })).toHaveAttribute("aria-current", "true");
  });

  it("clicking 'Audio Files' in the panel switches the active tab from Project Folders", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Alpha Sessions" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Show all tabs" }));
    const dialog = screen.getByRole("dialog", { name: "All tabs" });
    await user.click(within(dialog).getByRole("button", { name: "Go to tab Audio Files" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Audio Files" })).toHaveAttribute("aria-current", "true"));
  });

  it("the panel's active-tab marker reflects the currently active tab when opened", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Alpha Sessions" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Show all tabs" }));
    const dialog = screen.getByRole("dialog", { name: "All tabs" });

    expect(within(dialog).getByRole("button", { name: "Go to tab Project Folders" })).toHaveAttribute("aria-current", "true");
    expect(within(dialog).getByRole("button", { name: "Go to tab Audio Files" })).toHaveAttribute("aria-current", "false");
  });
});
