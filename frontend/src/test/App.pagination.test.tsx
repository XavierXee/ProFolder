import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.js";
import type { AudioFile, Project } from "../types.js";
import type { LibraryStats, PagedFiles, PagedProjects } from "../api/client.js";

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
  getPaginationSettings: vi.fn(),
}));

import * as api from "../api/client.js";

const mockGetFiles = vi.mocked(api.getFiles);
const mockGetProjects = vi.mocked(api.getProjects);
const mockGetConfig = vi.mocked(api.getConfig);
const mockGetLastScan = vi.mocked(api.getLastScan);
const mockGetStats = vi.mocked(api.getStats);
const mockGetAllTags = vi.mocked(api.getAllTags);
const mockGetCustomTabs = vi.mocked(api.getCustomTabs);
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
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    contentModifiedAt: null,
    audioFileCount: 3,
    ...overrides,
  };
}

// total/totalPages are set to make pagination genuinely active (page 1 of 3) even though
// only 2 rows are returned per page — these tests are about the CONSEQUENCE of paginating
// (selection clearing), not about browsing real multi-page data.
const FILES_PAGE: PagedFiles = {
  files: [
    makeFile({ id: "file-1", filename: "Kick One.wav", relativePath: "Drums/Kick One.wav" }),
    makeFile({ id: "file-2", filename: "Snare Two.wav", relativePath: "Drums/Snare Two.wav" }),
  ],
  total: 120,
  page: 1,
  pageSize: 50,
  totalPages: 3,
};

const PROJECTS_PAGE: PagedProjects = {
  projects: [
    makeProject({ id: "proj-1", name: "Alpha Sessions" }),
    makeProject({ id: "proj-2", name: "Beta Sessions" }),
  ],
  total: 120,
  page: 1,
  pageSize: 50,
  totalPages: 3,
};

const STATS: LibraryStats = {
  files: { total: 120, byStatus: { unknown: 120, draft: 0, needs_mixing: 0, done: 0, released: 0 } },
  projects: { total: 0, byStatus: { unknown: 0, draft: 0, needs_mixing: 0, done: 0, released: 0 } },
};

beforeEach(() => {
  mockGetFiles.mockReset().mockResolvedValue(FILES_PAGE);
  mockGetProjects.mockReset().mockResolvedValue(PROJECTS_PAGE);
  mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music" });
  mockGetLastScan.mockReset().mockResolvedValue(undefined);
  mockGetStats.mockReset().mockResolvedValue(STATS);
  mockGetAllTags.mockReset().mockResolvedValue([]);
  mockGetCustomTabs.mockReset().mockResolvedValue([]);
  mockGetPaginationSettings.mockReset().mockResolvedValue({ itemsPerPage: 50 });
});

function batchEditButton() {
  return screen.getByRole("button", { name: /Batch Edit/ });
}

async function switchToFilesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Audio Files" }));
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Kick One.wav" })).toBeInTheDocument());
}

describe("App - pagination clears row selection (Files tab)", () => {
  it("clears both the Batch Edit button state and the checked row checkboxes when Next is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    expect(batchEditButton()).toBeDisabled();

    const cb1 = screen.getByRole("checkbox", { name: "Select Kick One.wav" });
    const cb2 = screen.getByRole("checkbox", { name: "Select Snare Two.wav" });
    await user.click(cb1);
    await user.click(cb2);

    expect(cb1).toBeChecked();
    expect(cb2).toBeChecked();
    expect(batchEditButton()).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /^Next/ }));

    await waitFor(() => expect(batchEditButton()).toBeDisabled());
    expect(cb1).not.toBeChecked();
    expect(cb2).not.toBeChecked();
  });
});

describe("App - pagination clears row selection (Projects tab)", () => {
  it("clears both the Batch Edit button state and the checked row checkboxes when Next is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);
    // "Project Folders" is the default active tab, but click it explicitly so this test
    // doesn't silently depend on that default.
    await user.click(screen.getByRole("button", { name: "Project Folders" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Alpha Sessions" })).toBeInTheDocument());

    expect(batchEditButton()).toBeDisabled();

    const cb1 = screen.getByRole("checkbox", { name: "Select Alpha Sessions" });
    const cb2 = screen.getByRole("checkbox", { name: "Select Beta Sessions" });
    await user.click(cb1);
    await user.click(cb2);

    expect(cb1).toBeChecked();
    expect(cb2).toBeChecked();
    expect(batchEditButton()).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /^Next/ }));

    await waitFor(() => expect(batchEditButton()).toBeDisabled());
    expect(cb1).not.toBeChecked();
    expect(cb2).not.toBeChecked();
  });
});

describe("App - pagination clears row selection (Files tab sort)", () => {
  it("clears both the Batch Edit button state and the checked row checkboxes when a FileTable column-header sort is clicked", async () => {
    // FileTable's sortable column headers call handleSortChange, which now routes through
    // handleFilesFilterChange — the same selection-clearing wrapper used by every other
    // filter/page-change handler — so sort-header clicks clear selection consistently with
    // the rest of the app rather than being an exception. (Previously handleSortChange called
    // updateFilters directly, leaving stale/off-screen selection intact after the page reset
    // to 1 that a sort change causes — see docs/TODO.md Task 9 follow-up item 22.)
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    const cb1 = screen.getByRole("checkbox", { name: "Select Kick One.wav" });
    const cb2 = screen.getByRole("checkbox", { name: "Select Snare Two.wav" });
    await user.click(cb1);
    await user.click(cb2);

    expect(batchEditButton()).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Sort by Location" }));

    // Proves this really was a genuine re-render/refetch (sortBy changed, page reset to 1,
    // a fresh getFiles call fired) rather than a no-op click.
    await waitFor(() => expect(screen.getByRole("columnheader", { name: /^Location/ })).toHaveAttribute("aria-sort", "ascending"));
    expect(mockGetFiles.mock.calls.at(-1)?.[0]).toMatchObject({ sortBy: "folder", sortDir: "asc" });

    await waitFor(() => expect(batchEditButton()).toBeDisabled());
    expect(cb1).not.toBeChecked();
    expect(cb2).not.toBeChecked();
  });
});

describe("App - pagination clears row selection (Projects tab sort)", () => {
  it("clears both the Batch Edit button state and the checked row checkboxes when a ProjectsTable column-header sort is clicked", async () => {
    // ProjectsTable's sortable column headers call App's handleProjectSortChange, which routes
    // through handleProjectsFilterChange — the same selection-clearing wrapper used by every
    // other Projects filter/page-change handler — so sort-header clicks clear selection
    // consistently with the rest of the app. This is also the wiring this task's fix restores:
    // before it, `filters`/`onSortChange` weren't passed to ProjectsTable at all and the
    // Projects tab (the default landing tab) crashed on render.
    const user = userEvent.setup();
    render(<App />);
    // "Project Folders" is the default active tab, but click it explicitly so this test
    // doesn't silently depend on that default.
    await user.click(screen.getByRole("button", { name: "Project Folders" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Alpha Sessions" })).toBeInTheDocument());

    const cb1 = screen.getByRole("checkbox", { name: "Select Alpha Sessions" });
    const cb2 = screen.getByRole("checkbox", { name: "Select Beta Sessions" });
    await user.click(cb1);
    await user.click(cb2);

    expect(batchEditButton()).toBeEnabled();

    // ProjectsTable's sort-header buttons now have an explicit "Sort by <label>" aria-label
    // (distinguishing them from FilterToolbar's same-named picker buttons, e.g. "Score"), so
    // this query is unambiguous regardless of which column is used.
    await user.click(screen.getByRole("button", { name: "Sort by Modified" }));

    // Proves this really was a genuine re-render/refetch (sortBy changed, page reset to 1,
    // a fresh getProjects call fired) rather than a no-op click.
    await waitFor(() => expect(screen.getByRole("columnheader", { name: /^Modified/ })).toHaveAttribute("aria-sort", "ascending"));
    expect(mockGetProjects.mock.calls.at(-1)?.[0]).toMatchObject({ sortBy: "modifiedAt", sortDir: "asc" });

    await waitFor(() => expect(batchEditButton()).toBeDisabled());
    expect(cb1).not.toBeChecked();
    expect(cb2).not.toBeChecked();
  });
});

describe("App - filter changes reset the page indicator back to page 1", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets 'Page 2 of 3' back to 'Page 1 of 3' once a debounced search change lands, after having navigated to page 2", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    await user.click(screen.getByRole("button", { name: /^Next/ }));
    await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeInTheDocument());

    // Debounced search input: use fireEvent + fake timers rather than userEvent's
    // advanceTimers integration, which hangs indefinitely in this repo's vitest/jsdom
    // combination.
    vi.useFakeTimers();
    const searchInput = screen.getByRole("searchbox", { name: "Search by filename or path" });
    fireEvent.change(searchInput, { target: { value: "kick" } });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });
});
