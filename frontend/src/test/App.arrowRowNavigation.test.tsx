import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.js";
import type { AudioFile, Project } from "../types.js";
import type { LibraryStats, PagedFiles, PagedProjects } from "../api/client.js";

// Same full mock set as App.pagination.test.tsx — App.tsx's mount effect fetches all of these,
// every one `.catch(() => {})`-wrapped, so an unmocked call silently produces an incomplete render.
vi.mock("../api/client.js", () => ({
  getFiles: vi.fn(),
  getProjects: vi.fn(),
  getConfig: vi.fn(),
  getLastScan: vi.fn(),
  getStats: vi.fn(),
  getAllTags: vi.fn(),
  getStatuses: vi.fn(),
  getCustomTabs: vi.fn(),
  getPaginationSettings: vi.fn(),
  getMetricsSettings: vi.fn(),
  getTagCounts: vi.fn(),
  getProjectDetail: vi.fn(),
  getProjectDuplicates: vi.fn(),
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
const mockGetPaginationSettings = vi.mocked(api.getPaginationSettings);
const mockGetMetricsSettings = vi.mocked(api.getMetricsSettings);
const mockGetProjectDetail = vi.mocked(api.getProjectDetail);
const mockGetProjectDuplicates = vi.mocked(api.getProjectDuplicates);

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

const FILES_PAGE: PagedFiles = {
  files: [
    makeFile({ id: "file-1", filename: "Kick One.wav", relativePath: "Drums/Kick One.wav" }),
    makeFile({ id: "file-2", filename: "Snare Two.wav", relativePath: "Drums/Snare Two.wav" }),
    makeFile({ id: "file-3", filename: "Hat Three.wav", relativePath: "Drums/Hat Three.wav" }),
  ],
  total: 3,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

const PROJECTS_PAGE: PagedProjects = {
  projects: [
    makeProject({ id: "proj-1", name: "Alpha Sessions" }),
    makeProject({ id: "proj-2", name: "Beta Sessions" }),
  ],
  total: 2,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

const STATS: LibraryStats = {
  files: { total: 3, byStatus: { unknown: 3, draft: 0, needs_mixing: 0, done: 0, released: 0 } },
  projects: { total: 2, byStatus: { unknown: 0, draft: 2, needs_mixing: 0, done: 0, released: 0 } },
};

beforeEach(() => {
  mockGetFiles.mockReset().mockResolvedValue(FILES_PAGE);
  mockGetProjects.mockReset().mockResolvedValue(PROJECTS_PAGE);
  mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music", runtimeMode: "web" });
  mockGetLastScan.mockReset().mockResolvedValue(undefined);
  mockGetStats.mockReset().mockResolvedValue(STATS);
  mockGetAllTags.mockReset().mockResolvedValue([]);
  mockGetStatuses.mockReset().mockResolvedValue([]);
  mockGetCustomTabs.mockReset().mockResolvedValue([]);
  mockGetMetricsSettings.mockReset().mockResolvedValue({
    projectsMetrics: [{ type: "total" }, { type: "status", key: "unknown" }],
    filesMetrics: [{ type: "total" }, { type: "status", key: "unknown" }],
  });
  mockGetPaginationSettings.mockReset().mockResolvedValue({ itemsPerPage: 50 });
  mockGetProjectDetail.mockReset().mockImplementation((id: string) =>
    Promise.resolve({
      ...makeProject({ id }),
      audioFiles: [],
      subfolderTree: { name: "root", path: "/music", type: "folder" as const, children: [] },
      dawProjectFiles: [],
    })
  );
  mockGetProjectDuplicates.mockReset().mockResolvedValue({ projectId: "proj-1", sampleCount: 0, matches: [] });
});

async function switchToFilesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Audio Files" }));
  await waitFor(() => expect(screen.getByText("Kick One.wav")).toBeInTheDocument());
}

describe("App - arrow-key row navigation (Files tab)", () => {
  it("ArrowDown moves the open detail panel to the next file, even with focus on the panel's own close button", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    await user.click(screen.getByText("Kick One.wav"));
    const dialog = screen.getByRole("dialog", { name: "File detail: Kick One.wav" });
    // The panel auto-focuses its own close button 50ms after opening (this codebase's standing
    // pattern) — confirms navigation isn't dependent on focus being inside the table.
    await waitFor(() => expect(dialog.querySelector('[aria-label="Close panel"]')).toHaveFocus());

    fireEvent.keyDown(document.body, { key: "ArrowDown" });

    expect(screen.getByRole("dialog", { name: "File detail: Snare Two.wav" })).toBeInTheDocument();
  });

  it("ArrowUp moves the open detail panel to the previous file", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    await user.click(screen.getByText("Snare Two.wav"));
    await screen.findByRole("dialog", { name: "File detail: Snare Two.wav" });

    fireEvent.keyDown(document.body, { key: "ArrowUp" });

    expect(screen.getByRole("dialog", { name: "File detail: Kick One.wav" })).toBeInTheDocument();
  });

  it("does not navigate while focus is in the detail panel's Notes field, so typing keeps its normal cursor behavior", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    await user.click(screen.getByText("Kick One.wav"));
    const notes = await screen.findByRole("textbox", { name: "Notes" });
    notes.focus();

    fireEvent.keyDown(notes, { key: "ArrowDown" });

    expect(screen.getByRole("dialog", { name: "File detail: Kick One.wav" })).toBeInTheDocument();
  });

  it("clamps at the last row — ArrowDown while the last file is open is a no-op", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    await user.click(screen.getByText("Hat Three.wav"));
    await screen.findByRole("dialog", { name: "File detail: Hat Three.wav" });

    fireEvent.keyDown(document.body, { key: "ArrowDown" });

    expect(screen.getByRole("dialog", { name: "File detail: Hat Three.wav" })).toBeInTheDocument();
  });
});

describe("App - arrow-key row navigation (Projects tab)", () => {
  it("ArrowDown moves the open detail panel to the next project", async () => {
    const user = userEvent.setup();
    render(<App />);
    // "Project Folders" is the default active tab, but click it explicitly so this test
    // doesn't silently depend on that default.
    await user.click(screen.getByRole("button", { name: "Project Folders" }));
    await waitFor(() => expect(screen.getByText("Alpha Sessions")).toBeInTheDocument());

    await user.click(screen.getByText("Alpha Sessions"));
    await screen.findByRole("dialog", { name: "Folder detail: Alpha Sessions" });

    fireEvent.keyDown(document.body, { key: "ArrowDown" });

    expect(screen.getByRole("dialog", { name: "Folder detail: Beta Sessions" })).toBeInTheDocument();
  });
});
