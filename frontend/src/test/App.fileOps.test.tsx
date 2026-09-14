import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.js";
import type { AudioFile, Project } from "../types.js";
import type { FolderNode, LibraryStats, PagedFiles, PagedProjects, ProjectDetail, ProjectDuplicatesResult } from "../api/client.js";

// App.tsx's mount effect fetches getConfig/getLastScan/getStats/getAllTags/getCustomTabs in
// addition to the paged getFiles/getProjects the two hooks fetch — every one of these is
// wrapped in `.catch(() => {})`, so an unmocked/rejected call is silently swallowed and
// produces a confusingly incomplete/empty render rather than a clear test failure. All seven
// must be mocked with resolved values. ProjectDetailPanel additionally fetches
// getProjectDetail/getProjectDuplicates on mount, and CopyMoveDeleteDialog fetches
// getFolderTree for any copy/move destination picker — both must be mocked too.
vi.mock("../api/client.js", () => ({
  getFiles: vi.fn(),
  getProjects: vi.fn(),
  getConfig: vi.fn(),
  getLastScan: vi.fn(),
  getStats: vi.fn(),
  getAllTags: vi.fn(),
  getCustomTabs: vi.fn(),
  getProjectDetail: vi.fn(),
  getProjectDuplicates: vi.fn(),
  getFolderTree: vi.fn(),
  copyFile: vi.fn(),
  moveFile: vi.fn(),
  deleteFile: vi.fn(),
  copyProject: vi.fn(),
  moveProject: vi.fn(),
  deleteProject: vi.fn(),
}));

import * as api from "../api/client.js";

const mockGetFiles = vi.mocked(api.getFiles);
const mockGetProjects = vi.mocked(api.getProjects);
const mockGetConfig = vi.mocked(api.getConfig);
const mockGetLastScan = vi.mocked(api.getLastScan);
const mockGetStats = vi.mocked(api.getStats);
const mockGetAllTags = vi.mocked(api.getAllTags);
const mockGetCustomTabs = vi.mocked(api.getCustomTabs);
const mockGetProjectDetail = vi.mocked(api.getProjectDetail);
const mockGetProjectDuplicates = vi.mocked(api.getProjectDuplicates);
const mockGetFolderTree = vi.mocked(api.getFolderTree);
const mockCopyFile = vi.mocked(api.copyFile);
const mockMoveFile = vi.mocked(api.moveFile);
const mockDeleteFile = vi.mocked(api.deleteFile);
const mockCopyProject = vi.mocked(api.copyProject);
const mockMoveProject = vi.mocked(api.moveProject);
const mockDeleteProject = vi.mocked(api.deleteProject);

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

function makeDetail(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
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
    audioFiles: [],
    subfolderTree: { name: "root", path: "/music/Alpha Sessions", type: "folder", children: [] },
    dawProjectFiles: [],
    ...overrides,
  };
}

function makeDuplicatesResult(overrides: Partial<ProjectDuplicatesResult> = {}): ProjectDuplicatesResult {
  return { projectId: "proj-1", sampleCount: 0, matches: [], ...overrides };
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

const STATS: LibraryStats = { total: 1, draftCount: 0, unscoredCount: 0 };

// Folder tree fixture for the destination picker used by copy/move.
const otherFolder: FolderNode = { name: "Other", path: "/music/Other", type: "folder", children: [] };
const tree: FolderNode = { name: "music", path: "/music", type: "folder", children: [otherFolder] };

beforeEach(() => {
  mockGetFiles.mockReset().mockResolvedValue(FILES_PAGE);
  mockGetProjects.mockReset().mockResolvedValue(PROJECTS_PAGE);
  mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music" });
  mockGetLastScan.mockReset().mockResolvedValue(undefined);
  mockGetStats.mockReset().mockResolvedValue(STATS);
  mockGetAllTags.mockReset().mockResolvedValue([]);
  mockGetCustomTabs.mockReset().mockResolvedValue([]);
  mockGetProjectDetail.mockReset().mockResolvedValue(makeDetail());
  mockGetProjectDuplicates.mockReset().mockResolvedValue(makeDuplicatesResult());
  mockGetFolderTree.mockReset().mockResolvedValue(tree);
  mockCopyFile.mockReset().mockResolvedValue(makeFile());
  mockMoveFile.mockReset().mockResolvedValue(makeFile());
  mockDeleteFile.mockReset().mockResolvedValue(undefined);
  mockCopyProject.mockReset().mockResolvedValue({} as any);
  mockMoveProject.mockReset().mockResolvedValue({} as any);
  mockDeleteProject.mockReset().mockResolvedValue({} as any);
});

async function switchToFilesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Audio Files" }));
  await waitFor(() => expect(screen.getByText("Kick One.wav")).toBeInTheDocument());
}

async function selectDestination(user: ReturnType<typeof userEvent.setup>, name = "Other") {
  await waitFor(() => expect(screen.getByRole("radio", { name })).toBeInTheDocument());
  await user.click(screen.getByRole("radio", { name }));
}

describe("App - file operations (Copy/Move/Delete) wiring, Files tab", () => {
  it("on a successful Delete: calls api.deleteFile, refetches files/stats/projects, sets the banner, and closes the detail panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    await user.click(screen.getByText("Kick One.wav"));
    const detailDialog = screen.getByRole("dialog", { name: "File detail: Kick One.wav" });
    await user.click(within(detailDialog).getByRole("button", { name: "Delete" }));

    const opDialog = screen.getByRole("dialog", { name: 'Move to Trash "Kick One.wav"' });
    const filesCallsBefore = mockGetFiles.mock.calls.length;
    const statsCallsBefore = mockGetStats.mock.calls.length;
    const projectsCallsBefore = mockGetProjects.mock.calls.length;
    await user.click(within(opDialog).getByRole("button", { name: "Move to Trash" }));

    await waitFor(() => expect(mockDeleteFile).toHaveBeenCalledWith("file-1"));
    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBe(filesCallsBefore + 1));
    await waitFor(() => expect(mockGetStats.mock.calls.length).toBe(statsCallsBefore + 1));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBe(projectsCallsBefore + 1));
    expect(screen.getByText("File moved to Trash.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "File detail: Kick One.wav" })).not.toBeInTheDocument();
  });

  it("on a successful Move: calls api.moveFile with the chosen destination, sets the banner, and closes the detail panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    await user.click(screen.getByText("Kick One.wav"));
    const detailDialog = screen.getByRole("dialog", { name: "File detail: Kick One.wav" });
    await user.click(within(detailDialog).getByRole("button", { name: "Move" }));

    const opDialog = screen.getByRole("dialog", { name: 'Move "Kick One.wav"' });
    await selectDestination(user);
    await user.click(within(opDialog).getByRole("button", { name: "Move" }));

    await waitFor(() => expect(mockMoveFile).toHaveBeenCalledWith("file-1", "/music/Other"));
    expect(screen.getByText("File moved.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "File detail: Kick One.wav" })).not.toBeInTheDocument());
  });

  it("on a successful Copy: calls api.copyFile with the chosen destination, sets the banner, refetches, and leaves the detail panel open (same id)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    await user.click(screen.getByText("Kick One.wav"));
    const detailDialog = screen.getByRole("dialog", { name: "File detail: Kick One.wav" });
    await user.click(within(detailDialog).getByRole("button", { name: "Copy" }));

    const opDialog = screen.getByRole("dialog", { name: 'Copy "Kick One.wav"' });
    await selectDestination(user);
    const filesCallsBefore = mockGetFiles.mock.calls.length;
    await user.click(within(opDialog).getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(mockCopyFile).toHaveBeenCalledWith("file-1", "/music/Other"));
    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBe(filesCallsBefore + 1));
    expect(screen.getByText("File copied.")).toBeInTheDocument();
    // The original file's id is untouched by a copy, so the still-open panel stays open.
    expect(screen.getByRole("dialog", { name: "File detail: Kick One.wav" })).toBeInTheDocument();
  });

  it("Cancelling the Move dialog does not close the still-open detail panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    await user.click(screen.getByText("Kick One.wav"));
    const detailDialog = screen.getByRole("dialog", { name: "File detail: Kick One.wav" });
    await user.click(within(detailDialog).getByRole("button", { name: "Move" }));

    const opDialog = screen.getByRole("dialog", { name: 'Move "Kick One.wav"' });
    await user.click(within(opDialog).getByRole("button", { name: "Cancel" }));

    expect(mockMoveFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: 'Move "Kick One.wav"' })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "File detail: Kick One.wav" })).toBeInTheDocument();
  });
});

describe("App - file operations (Copy/Move/Delete) wiring, Projects tab", () => {
  it("on a successful Delete: calls api.deleteProject, refetches projects/files/stats, sets the banner, and closes the detail panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    // "Project Folders" is the default active tab.
    await waitFor(() => expect(screen.getByText("Alpha Sessions")).toBeInTheDocument());

    await user.click(screen.getByText("Alpha Sessions"));
    const detailDialog = await screen.findByRole("dialog", { name: "Folder detail: Alpha Sessions" });
    await user.click(within(detailDialog).getByRole("button", { name: "Delete" }));

    const opDialog = screen.getByRole("dialog", { name: 'Move to Trash "Alpha Sessions"' });
    const projectsCallsBefore = mockGetProjects.mock.calls.length;
    const filesCallsBefore = mockGetFiles.mock.calls.length;
    const statsCallsBefore = mockGetStats.mock.calls.length;
    await user.click(within(opDialog).getByRole("button", { name: "Move to Trash" }));

    await waitFor(() => expect(mockDeleteProject).toHaveBeenCalledWith("proj-1"));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBe(projectsCallsBefore + 1));
    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBe(filesCallsBefore + 1));
    await waitFor(() => expect(mockGetStats.mock.calls.length).toBe(statsCallsBefore + 1));
    expect(screen.getByText("Folder moved to Trash.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Folder detail: Alpha Sessions" })).not.toBeInTheDocument();
  });

  it("passes the project's own path as excludedPath when Move is clicked (destination picker excludes it)", async () => {
    // A project with a child folder that itself contains a subfolder: the excludedPath
    // wiring is proven by asserting getFolderTree resolves and the project's own path is
    // never offered as a selectable destination row once the tree renders.
    const nestedTree: FolderNode = {
      name: "music",
      path: "/music",
      type: "folder",
      children: [
        { name: "Alpha Sessions", path: "/music/Alpha Sessions", type: "folder", children: [] },
        otherFolder,
      ],
    };
    mockGetFolderTree.mockResolvedValue(nestedTree);
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByText("Alpha Sessions")).toBeInTheDocument());

    await user.click(screen.getByText("Alpha Sessions"));
    const detailDialog = await screen.findByRole("dialog", { name: "Folder detail: Alpha Sessions" });
    await user.click(within(detailDialog).getByRole("button", { name: "Move" }));

    const opDialog = screen.getByRole("dialog", { name: 'Move "Alpha Sessions"' });
    await waitFor(() => expect(within(opDialog).getByRole("radio", { name: "Other" })).toBeInTheDocument());
    expect(within(opDialog).getByRole("radio", { name: "Other" })).toBeEnabled();
    // The project's own folder ("Alpha Sessions") is rendered but disabled as a destination
    // option, since App.tsx passes excludedPath={project.path} for a project move.
    expect(within(opDialog).getByRole("radio", { name: "Alpha Sessions" })).toBeDisabled();
  });
});
