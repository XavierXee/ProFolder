import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.js";
import type { AudioFile, Project } from "../types.js";
import type { ConfirmationSettings, LibraryStats, PagedFiles, PagedProjects, StatusDef } from "../api/client.js";

// Same rationale as App.pagination.test.tsx: App.tsx's mount effect fires several calls that are
// each wrapped in `.catch(() => {})`, so any unmocked/rejected one is silently swallowed and
// produces a confusingly incomplete render rather than a clear failure. Every one of these plus
// TagsStatusesPanel's own dependencies (status/tag mutation calls, getConfirmationSettings via
// useConfirmationRequired) must be mocked with resolved values.
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
  getConfirmationSettings: vi.fn(),
  createStatus: vi.fn(),
  editStatus: vi.fn(),
  deleteStatus: vi.fn(),
  createTag: vi.fn(),
  renameTag: vi.fn(),
  deleteTag: vi.fn(),
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
const mockGetConfirmationSettings = vi.mocked(api.getConfirmationSettings);
const mockCreateStatus = vi.mocked(api.createStatus);
const mockEditStatus = vi.mocked(api.editStatus);
const mockDeleteStatus = vi.mocked(api.deleteStatus);
const mockCreateTag = vi.mocked(api.createTag);
const mockRenameTag = vi.mocked(api.renameTag);
const mockDeleteTag = vi.mocked(api.deleteTag);

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
    status: "draft",
    tags: ["vocals"],
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
    tags: ["vocals"],
    score: null,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    contentModifiedAt: null,
    audioFileCount: 3,
    ...overrides,
  };
}

const FILES_PAGE: PagedFiles = {
  files: [makeFile()],
  total: 1,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

const PROJECTS_PAGE: PagedProjects = {
  projects: [makeProject()],
  total: 1,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

const STATS: LibraryStats = {
  files: { total: 1, byStatus: { unknown: 0, draft: 1, needs_mixing: 0, done: 0, released: 0 } },
  projects: { total: 1, byStatus: { unknown: 0, draft: 1, needs_mixing: 0, done: 0, released: 0 } },
};

const CATALOG_STATUSES: StatusDef[] = [
  { key: "draft", name: "Draft", color: "#a1b2c3", sortOrder: 1, createdAt: "2024-01-01T00:00:00.000Z" },
];

function makeConfirmSettings(overrides: Partial<ConfirmationSettings> = {}): ConfirmationSettings {
  return {
    confirmTabDeletion: false,
    confirmCopy: false,
    confirmMove: false,
    confirmDelete: false,
    confirmStatusDeletion: false,
    confirmTagDeletion: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetFiles.mockReset().mockResolvedValue(FILES_PAGE);
  mockGetProjects.mockReset().mockResolvedValue(PROJECTS_PAGE);
  mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music" });
  mockGetLastScan.mockReset().mockResolvedValue(undefined);
  mockGetStats.mockReset().mockResolvedValue(STATS);
  mockGetAllTags.mockReset().mockResolvedValue(["vocals"]);
  mockGetStatuses.mockReset().mockResolvedValue(CATALOG_STATUSES);
  mockGetCustomTabs.mockReset().mockResolvedValue([]);
  mockGetPaginationSettings.mockReset().mockResolvedValue({ itemsPerPage: 50 });
  mockGetConfirmationSettings.mockReset().mockResolvedValue(makeConfirmSettings());
  mockCreateStatus.mockReset();
  mockEditStatus.mockReset();
  mockDeleteStatus.mockReset();
  mockCreateTag.mockReset();
  mockRenameTag.mockReset();
  mockDeleteTag.mockReset();
});

async function openTagsStatusesPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Statuses and tags" }));
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Statuses and tags" })).toBeInTheDocument());
  // "Edit status Draft" is unique to the panel's catalog row, unlike the plain "Draft" text,
  // which also appears in the underlying table's own StatusBadge for the seeded project row.
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit status Draft" })).toBeInTheDocument());
}

function callCountsAt(mount: number) {
  return {
    files: mockGetFiles.mock.calls.length,
    projects: mockGetProjects.mock.calls.length,
    stats: mockGetStats.mock.calls.length,
    tags: mockGetAllTags.mock.calls.length,
  };
}

describe("App - status catalog mutations refetch already-loaded row/stat data", () => {
  it("deleting a status via the panel refetches files, projects, and stats (not tags)", async () => {
    mockDeleteStatus.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    await openTagsStatusesPanel(user);
    const before = callCountsAt(0);

    mockGetStatuses.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Delete status Draft" }));
    // Scoped to the confirm dialog: App.tsx also keeps both Files/Projects BatchEditPanel
    // instances permanently mounted (CSS-transition-hidden, not conditionally rendered), each
    // with its own same-named "Delete" danger button, so an unscoped query is ambiguous.
    const confirmDialog = screen.getByRole("dialog", { name: "Delete status confirmation" });
    await waitFor(() => expect(within(confirmDialog).getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await user.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteStatus).toHaveBeenCalledWith("draft"));

    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBeGreaterThan(before.files));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBeGreaterThan(before.projects));
    await waitFor(() => expect(mockGetStats.mock.calls.length).toBeGreaterThan(before.stats));
    // Status delete is unrelated to tags, so getAllTags must not be refetched by this mutation.
    expect(mockGetAllTags.mock.calls.length).toBe(before.tags);
  });

  it("renaming a tag via the panel refetches files, projects, and tags", async () => {
    mockRenameTag.mockResolvedValue({ name: "vocal-fx" });
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    await openTagsStatusesPanel(user);
    const before = callCountsAt(0);

    await user.click(screen.getByRole("button", { name: "Edit tag vocals" }));
    await user.clear(screen.getByLabelText("Rename tag vocals"));
    await user.type(screen.getByLabelText("Rename tag vocals"), "vocal-fx");
    mockGetAllTags.mockResolvedValue(["vocal-fx"]);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockRenameTag).toHaveBeenCalledWith("vocals", "vocal-fx"));

    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBeGreaterThan(before.files));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBeGreaterThan(before.projects));
    await waitFor(() => expect(mockGetAllTags.mock.calls.length).toBeGreaterThan(before.tags));
  });

  it("deleting a tag via the panel refetches files, projects, and tags", async () => {
    mockDeleteTag.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    await openTagsStatusesPanel(user);
    const before = callCountsAt(0);

    mockGetAllTags.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Delete tag vocals" }));
    const confirmDialog = screen.getByRole("dialog", { name: "Delete tag confirmation" });
    await waitFor(() => expect(within(confirmDialog).getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await user.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteTag).toHaveBeenCalledWith("vocals"));

    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBeGreaterThan(before.files));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBeGreaterThan(before.projects));
    await waitFor(() => expect(mockGetAllTags.mock.calls.length).toBeGreaterThan(before.tags));
  });

  // Status/tag create is a harmless extra fetch under the "just refetch everything plausibly
  // affected" convention this file already applies elsewhere, so proving a
  // strict *absence* of any files/projects refetch on create isn't a meaningful negative
  // assertion here — App.tsx's own handleTagCatalogChanged always bundles refetch()/
  // refetchProjects() regardless of which tag mutation triggered it (by design, not a bug to
  // guard against). The component-level test in TagsStatusesPanel.test.tsx already proves
  // status *create*/*edit* specifically don't call onStatusDeleted (the one signal that's
  // actually gated), which is the real behavior worth asserting.
});
