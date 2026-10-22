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
    tags: ["vocals"],
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
  mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music", runtimeMode: "web" });
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

async function switchToFilesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Audio Files" }));
  await waitFor(() => expect(screen.getByRole("toolbar", { name: "Filters" })).toBeInTheDocument());
}

// Scoped to the active tab's own filter toolbar: App.tsx also keeps CreateCustomTabModal.tsx
// permanently mounted (CSS-transition-hidden, not conditionally rendered, for its slide
// animation), which has its own same-labeled Status/Tags dropdown triggers in its
// create-tab form, so an unscoped query is ambiguous.
function filterToolbar() {
  return screen.getByRole("toolbar", { name: "Filters" });
}

async function selectStatusFilter(user: ReturnType<typeof userEvent.setup>, statusLabel: string) {
  await user.click(within(filterToolbar()).getByRole("button", { name: "Status" }));
  const checkbox = await screen.findByRole("checkbox", { name: statusLabel });
  await user.click(checkbox);
  // MultiSelectDropdown closes itself on any outside mousedown (see its own listener), so the
  // subsequent click to open the Tags/Statuses panel closes this dropdown as a side effect —
  // no explicit close step needed here.
}

async function selectTagFilter(user: ReturnType<typeof userEvent.setup>, tag: string) {
  await user.click(within(filterToolbar()).getByRole("button", { name: "Tags" }));
  const checkbox = await screen.findByRole("checkbox", { name: tag });
  await user.click(checkbox);
}

// These prove the actual bug fix (see catalogFilterEvents.ts's doc comment): deleting/renaming a status or tag that's currently an active filter on a default
// Files/Projects tab must prune/update that filter, not leave it pointing at a now-nonexistent
// catalog entry.
describe("App - catalog delete/rename prunes an active Files/Projects filter (bug fix)", () => {
  it("deleting an active status filter on the Files tab removes it from the files filter", async () => {
    mockDeleteStatus.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    await switchToFilesTab(user);
    await selectStatusFilter(user, "Draft");
    await waitFor(() => expect(mockGetFiles.mock.calls.at(-1)?.[0]?.statuses).toContain("draft"));

    await openTagsStatusesPanel(user);
    mockGetStatuses.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Delete status Draft" }));
    const confirmDialog = screen.getByRole("dialog", { name: "Delete status confirmation" });
    await waitFor(() => expect(within(confirmDialog).getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await user.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteStatus).toHaveBeenCalledWith("draft"));
    await waitFor(() => expect(mockGetFiles.mock.calls.at(-1)?.[0]?.statuses).not.toContain("draft"));
  });

  it("deleting a status filter active on the Files tab does not touch an unrelated, independently-active Projects tab filter (Reviewer finding: Files/Projects independence gap)", async () => {
    mockDeleteStatus.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(1));

    // Projects tab is the default active tab: set its own, unrelated tag filter first.
    await selectTagFilter(user, "vocals");
    await waitFor(() => expect(mockGetProjects.mock.calls.at(-1)?.[0]?.tags).toContain("vocals"));

    // Now set an independent status filter on the Files tab.
    await switchToFilesTab(user);
    await selectStatusFilter(user, "Draft");
    await waitFor(() => expect(mockGetFiles.mock.calls.at(-1)?.[0]?.statuses).toContain("draft"));

    await openTagsStatusesPanel(user);
    mockGetStatuses.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Delete status Draft" }));
    const confirmDialog = screen.getByRole("dialog", { name: "Delete status confirmation" });
    await waitFor(() => expect(within(confirmDialog).getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await user.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteStatus).toHaveBeenCalledWith("draft"));
    await waitFor(() => expect(mockGetFiles.mock.calls.at(-1)?.[0]?.statuses).not.toContain("draft"));

    // A Files-only status deletion must not touch the Projects tab's OWN filter state: its
    // deliberate unconditional refetchProjects() call (existing, pre-Task-2 behavior, unrelated
    // to filter pruning) still fires once more — that's expected — but the refetched filter args
    // must still be exactly the tag filter set above, with no statuses field contaminated in.
    await waitFor(() => {
      const lastProjectsCall = mockGetProjects.mock.calls.at(-1)?.[0];
      expect(lastProjectsCall?.tags).toContain("vocals");
      expect(lastProjectsCall?.statuses).toBeUndefined();
    });
  });

  it("deleting an active status filter on the Projects tab removes it from the projects filter", async () => {
    mockDeleteStatus.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(1));

    await selectStatusFilter(user, "Draft");
    await waitFor(() => expect(mockGetProjects.mock.calls.at(-1)?.[0]?.statuses).toContain("draft"));

    await openTagsStatusesPanel(user);
    mockGetStatuses.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Delete status Draft" }));
    const confirmDialog = screen.getByRole("dialog", { name: "Delete status confirmation" });
    await waitFor(() => expect(within(confirmDialog).getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await user.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteStatus).toHaveBeenCalledWith("draft"));
    await waitFor(() => expect(mockGetProjects.mock.calls.at(-1)?.[0]?.statuses).not.toContain("draft"));
  });

  it("deleting an active tag filter on the Files tab removes it from the files filter", async () => {
    mockDeleteTag.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    await switchToFilesTab(user);
    await selectTagFilter(user, "vocals");
    await waitFor(() => expect(mockGetFiles.mock.calls.at(-1)?.[0]?.tags).toContain("vocals"));

    await openTagsStatusesPanel(user);
    mockGetAllTags.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Delete tag vocals" }));
    const confirmDialog = screen.getByRole("dialog", { name: "Delete tag confirmation" });
    await waitFor(() => expect(within(confirmDialog).getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await user.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteTag).toHaveBeenCalledWith("vocals"));
    await waitFor(() => expect(mockGetFiles.mock.calls.at(-1)?.[0]?.tags).not.toContain("vocals"));
  });

  it("deleting an active tag filter on the Projects tab removes it from the projects filter", async () => {
    mockDeleteTag.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(1));

    await selectTagFilter(user, "vocals");
    await waitFor(() => expect(mockGetProjects.mock.calls.at(-1)?.[0]?.tags).toContain("vocals"));

    await openTagsStatusesPanel(user);
    mockGetAllTags.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Delete tag vocals" }));
    const confirmDialog = screen.getByRole("dialog", { name: "Delete tag confirmation" });
    await waitFor(() => expect(within(confirmDialog).getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await user.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteTag).toHaveBeenCalledWith("vocals"));
    await waitFor(() => expect(mockGetProjects.mock.calls.at(-1)?.[0]?.tags).not.toContain("vocals"));
  });

  it("renaming an active tag filter on the Files tab updates the files filter to the new name", async () => {
    mockRenameTag.mockResolvedValue({ name: "vocal-fx" });
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    await switchToFilesTab(user);
    await selectTagFilter(user, "vocals");
    await waitFor(() => expect(mockGetFiles.mock.calls.at(-1)?.[0]?.tags).toContain("vocals"));

    await openTagsStatusesPanel(user);
    await user.click(screen.getByRole("button", { name: "Edit tag vocals" }));
    await user.clear(screen.getByLabelText("Rename tag vocals"));
    await user.type(screen.getByLabelText("Rename tag vocals"), "vocal-fx");
    mockGetAllTags.mockResolvedValue(["vocal-fx"]);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockRenameTag).toHaveBeenCalledWith("vocals", "vocal-fx"));
    await waitFor(() => {
      const lastTags = mockGetFiles.mock.calls.at(-1)?.[0]?.tags;
      expect(lastTags).toContain("vocal-fx");
      expect(lastTags).not.toContain("vocals");
    });
  });

  it("renaming an active tag filter on the Projects tab updates the projects filter to the new name", async () => {
    mockRenameTag.mockResolvedValue({ name: "vocal-fx" });
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(1));

    await selectTagFilter(user, "vocals");
    await waitFor(() => expect(mockGetProjects.mock.calls.at(-1)?.[0]?.tags).toContain("vocals"));

    await openTagsStatusesPanel(user);
    await user.click(screen.getByRole("button", { name: "Edit tag vocals" }));
    await user.clear(screen.getByLabelText("Rename tag vocals"));
    await user.type(screen.getByLabelText("Rename tag vocals"), "vocal-fx");
    mockGetAllTags.mockResolvedValue(["vocal-fx"]);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockRenameTag).toHaveBeenCalledWith("vocals", "vocal-fx"));
    await waitFor(() => {
      const lastTags = mockGetProjects.mock.calls.at(-1)?.[0]?.tags;
      expect(lastTags).toContain("vocal-fx");
      expect(lastTags).not.toContain("vocals");
    });
  });

  // Negative control: deleting a catalog entry that ISN'T currently an active filter must not
  // touch filter state at all (guards against an overly-broad implementation that unconditionally
  // clears/resets filters on any catalog delete). Here the Files tab has an active *tag* filter
  // ("vocals") while a *status* ("draft", unrelated) gets deleted — applyCatalogFilterEvent should
  // return null for this mismatched event, so updateFilters must never be called and the only new
  // getFiles call after the delete should be the pre-existing, unconditional refetch() already
  // fired by handleStatusDeleted regardless of any filter match.
  it("deleting a status that is not an active filter leaves the (unrelated) active tag filter untouched, with no extra refetch", async () => {
    mockDeleteStatus.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    await switchToFilesTab(user);
    await selectTagFilter(user, "vocals");
    await waitFor(() => expect(mockGetFiles.mock.calls.at(-1)?.[0]?.tags).toContain("vocals"));

    const callsBefore = mockGetFiles.mock.calls.length;

    await openTagsStatusesPanel(user);
    mockGetStatuses.mockResolvedValue([]);
    await user.click(screen.getByRole("button", { name: "Delete status Draft" }));
    const confirmDialog = screen.getByRole("dialog", { name: "Delete status confirmation" });
    await waitFor(() => expect(within(confirmDialog).getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await user.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteStatus).toHaveBeenCalledWith("draft"));
    // Only handleStatusDeleted's own unconditional refetch() should have fired — no second call
    // from an (incorrectly triggered) updateFilters-driven refetch.
    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBe(callsBefore + 1));
    const lastCall = mockGetFiles.mock.calls.at(-1)?.[0];
    expect(lastCall?.tags).toContain("vocals");
    expect(lastCall?.statuses ?? []).not.toContain("draft");
  });
});
