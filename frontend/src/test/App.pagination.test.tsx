import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.js";
import type { AudioFile, Project } from "../types.js";
import type { LibraryStats, PagedFiles, PagedProjects } from "../api/client.js";

// App.tsx's mount effect fetches getConfig/getLastScan/getStats/getAllTags in addition to
// the paged getFiles/getProjects the two hooks fetch — every one of these is wrapped in
// `.catch(() => {})`, so an unmocked/rejected call is silently swallowed and produces a
// confusingly incomplete/empty render rather than a clear test failure. All six must be
// mocked with resolved values.
vi.mock("../api/client.js", () => ({
  getFiles: vi.fn(),
  getProjects: vi.fn(),
  getConfig: vi.fn(),
  getLastScan: vi.fn(),
  getStats: vi.fn(),
  getAllTags: vi.fn(),
}));

import * as api from "../api/client.js";

const mockGetFiles = vi.mocked(api.getFiles);
const mockGetProjects = vi.mocked(api.getProjects);
const mockGetConfig = vi.mocked(api.getConfig);
const mockGetLastScan = vi.mocked(api.getLastScan);
const mockGetStats = vi.mocked(api.getStats);
const mockGetAllTags = vi.mocked(api.getAllTags);

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

const STATS: LibraryStats = { total: 120, draftCount: 0, unscoredCount: 0 };

beforeEach(() => {
  mockGetFiles.mockReset().mockResolvedValue(FILES_PAGE);
  mockGetProjects.mockReset().mockResolvedValue(PROJECTS_PAGE);
  mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music" });
  mockGetLastScan.mockReset().mockResolvedValue(undefined);
  mockGetStats.mockReset().mockResolvedValue(STATS);
  mockGetAllTags.mockReset().mockResolvedValue([]);
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

describe("App - negative control: an unrelated re-render must NOT clear selection", () => {
  it("keeps the row selection intact after a FileTable column-header sort click (a real re-render/refetch that isn't a page change)", async () => {
    // FileTable's own sortable column headers call handleSortChange, which goes straight
    // to the useAudioFiles hook's updateFilters — a different code path from
    // handleFilesFilterChange/handleFilesPageChange, both of which deliberately clear
    // selection. This click causes a genuine re-render and refetch (sortBy changes, page
    // resets to 1) but must NOT clear selection, ruling out "any re-render clears
    // selection" as a false-positive explanation for the pagination tests above.
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    const cb1 = screen.getByRole("checkbox", { name: "Select Kick One.wav" });
    const cb2 = screen.getByRole("checkbox", { name: "Select Snare Two.wav" });
    await user.click(cb1);
    await user.click(cb2);

    expect(batchEditButton()).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Location" }));

    // Proves this really was a genuine re-render/refetch (sortBy changed, page reset to 1,
    // a fresh getFiles call fired) rather than a no-op click.
    await waitFor(() => expect(screen.getByRole("columnheader", { name: /^Location/ })).toHaveAttribute("aria-sort", "ascending"));
    expect(mockGetFiles.mock.calls.at(-1)?.[0]).toMatchObject({ sortBy: "folder", sortDir: "asc" });

    expect(batchEditButton()).toBeEnabled();
    expect(cb1).toBeChecked();
    expect(cb2).toBeChecked();
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
