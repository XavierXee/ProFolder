import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  getFileAudioUrl: vi.fn(),
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

// The headline new behavior: rows are keyboard-navigable WITHOUT the detail panel ever being
// open — the panel only opens via click/Enter now, decoupled from which row is highlighted.
describe("App - keyboard browsing with the detail panel closed (Files tab)", () => {
  it("ArrowDown with nothing clicked yet highlights the first row, with no panel opening", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    fireEvent.keyDown(document.body, { key: "ArrowDown" });

    expect(screen.getByText("Kick One.wav").closest("tr")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("dialog", { name: /^File detail:/ })).not.toBeInTheDocument();
  });

  it("further ArrowDown presses keep moving the highlight with the panel still closed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    fireEvent.keyDown(document.body, { key: "ArrowDown" });

    expect(screen.getByText("Snare Two.wav").closest("tr")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("dialog", { name: /^File detail:/ })).not.toBeInTheDocument();
  });

  it("Enter opens the detail panel for the highlighted row", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    fireEvent.keyDown(document.body, { key: "Enter" });

    expect(await screen.findByRole("dialog", { name: "File detail: Kick One.wav" })).toBeInTheDocument();
  });

  it("clicking the already-highlighted row's second time closes the panel but keeps it highlighted, so arrow keys keep working from there", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    // "Kick One.wav" appears twice once the panel is open (the row AND the panel's own <h2>
    // title) — the row is always the first match, since FileTable renders well before
    // FileDetailPanel in App.tsx's own JSX tree.
    const row = () => screen.getAllByText("Kick One.wav")[0]!;
    await user.click(row());
    await screen.findByRole("dialog", { name: "File detail: Kick One.wav" });
    await user.click(row());

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^File detail:/ })).not.toBeInTheDocument());
    expect(row().closest("tr")).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(screen.getByText("Snare Two.wav").closest("tr")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("dialog", { name: /^File detail:/ })).not.toBeInTheDocument();
  });

  it("closing via the panel's own close button also keeps the row highlighted for continued keyboard browsing", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    await user.click(screen.getAllByText("Kick One.wav")[0]!);
    const dialog = await screen.findByRole("dialog", { name: "File detail: Kick One.wav" });
    // Several other always-mounted panels (BatchEditPanel, Settings, etc.) share the exact
    // same "Close panel" aria-label — scope to this dialog specifically, not a bare query.
    await user.click(within(dialog).getByRole("button", { name: "Close panel" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^File detail:/ })).not.toBeInTheDocument());
    expect(screen.getByText("Kick One.wav").closest("tr")).toHaveAttribute("aria-selected", "true");
  });

  it("Space toggles playback for the highlighted file WITHOUT opening the detail panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    fireEvent.keyDown(document.body, { key: " " });

    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /^File detail:/ })).not.toBeInTheDocument();
  });

  // Regression test for a real reported bug: switching to this tab means clicking the "Audio
  // Files" tab button, which leaves DOM focus sitting there (clicking a button doesn't blur it)
  // — unlike the other tests here, which dispatch keydowns directly on document.body regardless
  // of actual focus, this uses userEvent.keyboard() so the event's real target is whatever
  // currently has focus, faithfully reproducing what a real keypress does. Space silently did
  // nothing in this exact situation (the very first highlighted row, right after switching
  // tabs) until the detail panel had been opened and closed at least once — see
  // useRowKeyboardNav.ts's `isProtectedButton` doc comment for the root cause and fix.
  it("Space still works for the first highlighted row even though the tab-switcher button still has focus from switching tabs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Audio Files" }));
    await waitFor(() => expect(screen.getByText("Kick One.wav")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Audio Files" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");

    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /^File detail:/ })).not.toBeInTheDocument();
  });
});

describe("App - keyboard browsing with the detail panel closed (Projects tab)", () => {
  it("ArrowDown with nothing clicked yet highlights the first row", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Project Folders" }));
    await waitFor(() => expect(screen.getByText("Alpha Sessions")).toBeInTheDocument());

    fireEvent.keyDown(document.body, { key: "ArrowDown" });

    expect(screen.getByText("Alpha Sessions").closest("tr")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("dialog", { name: /^Folder detail:/ })).not.toBeInTheDocument();
  });

  it("Enter opens the detail panel for the highlighted project", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Project Folders" }));
    await waitFor(() => expect(screen.getByText("Alpha Sessions")).toBeInTheDocument());

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    fireEvent.keyDown(document.body, { key: "Enter" });

    expect(await screen.findByRole("dialog", { name: "Folder detail: Alpha Sessions" })).toBeInTheDocument();
  });

  it("Space ALSO opens the detail panel for the highlighted project (no playback concept, so it falls back to Enter's behavior)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Project Folders" }));
    await waitFor(() => expect(screen.getByText("Alpha Sessions")).toBeInTheDocument());

    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    fireEvent.keyDown(document.body, { key: " " });

    expect(await screen.findByRole("dialog", { name: "Folder detail: Alpha Sessions" })).toBeInTheDocument();
  });
});
