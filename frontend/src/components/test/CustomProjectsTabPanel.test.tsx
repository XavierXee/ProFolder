import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomProjectsTabPanel from "../CustomProjectsTabPanel.js";
import type { CustomTab, Project } from "../../types.js";
import type { FolderNode, PagedProjects, ProjectDetail, ProjectDuplicatesResult } from "../../api/client.js";
import { PAGE_SIZE } from "../../constants.js";

vi.mock("../../api/client.js", () => ({
  getProjects: vi.fn(),
  getProjectDetail: vi.fn(),
  getProjectDuplicates: vi.fn(),
  updateProjectStatus: vi.fn(),
  updateProjectTags: vi.fn(),
  updateProjectScore: vi.fn(),
  batchUpdateProjectScore: vi.fn(),
  batchAddProjectTags: vi.fn(),
  reveal: vi.fn(),
  getFolderTree: vi.fn(),
  copyProject: vi.fn(),
  moveProject: vi.fn(),
  deleteProject: vi.fn(),
  batchCopyProjects: vi.fn(),
  batchMoveProjects: vi.fn(),
  batchDeleteProjects: vi.fn(),
  getConfirmationSettings: vi.fn(),
  getPaginationSettings: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetProjects = vi.mocked(api.getProjects);
const mockGetProjectDetail = vi.mocked(api.getProjectDetail);
const mockGetProjectDuplicates = vi.mocked(api.getProjectDuplicates);
const mockUpdateProjectStatus = vi.mocked(api.updateProjectStatus);
const mockUpdateProjectTags = vi.mocked(api.updateProjectTags);
const mockUpdateProjectScore = vi.mocked(api.updateProjectScore);
const mockBatchUpdateProjectScore = vi.mocked(api.batchUpdateProjectScore);
const mockBatchAddProjectTags = vi.mocked(api.batchAddProjectTags);
const mockReveal = vi.mocked(api.reveal);
const mockGetFolderTree = vi.mocked(api.getFolderTree);
const mockCopyProject = vi.mocked(api.copyProject);
const mockMoveProject = vi.mocked(api.moveProject);
const mockDeleteProject = vi.mocked(api.deleteProject);
const mockBatchCopyProjects = vi.mocked(api.batchCopyProjects);
const mockBatchMoveProjects = vi.mocked(api.batchMoveProjects);
const mockBatchDeleteProjects = vi.mocked(api.batchDeleteProjects);
const mockGetConfirmationSettings = vi.mocked(api.getConfirmationSettings);
const mockGetPaginationSettings = vi.mocked(api.getPaginationSettings);

type ProjectRow = Project & { audioFileCount: number };

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "p1",
    name: "My Song",
    path: "/music/My Song",
    hasVideo: false,
    hasImage: false,
    status: "draft",
    tags: [],
    score: null,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    contentModifiedAt: null,
    audioFileCount: 4,
    ...overrides,
  };
}

const emptyTree: FolderNode = { name: "root", path: "/music/My Song", type: "folder", children: [] };

function makeDetail(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "p1",
    name: "My Song",
    path: "/music/My Song",
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
    subfolderTree: emptyTree,
    dawProjectFiles: [],
    ...overrides,
  };
}

function makeDuplicatesResult(overrides: Partial<ProjectDuplicatesResult> = {}): ProjectDuplicatesResult {
  return {
    projectId: "p1",
    sampleCount: 10,
    matches: [],
    ...overrides,
  };
}

function makeTab(overrides: Partial<CustomTab> = {}): CustomTab {
  return {
    id: 2,
    name: "Ready to Mix",
    type: "projects",
    statuses: ["draft", "done"],
    scores: [3, "unscored"],
    tags: ["kick", "mix"],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePaged(overrides: Partial<PagedProjects> = {}): PagedProjects {
  return {
    projects: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 1,
    ...overrides,
  };
}

const LOCKED_PARAMS = { statuses: ["draft", "done"], scores: [3, "unscored"], tags: ["kick", "mix"] };

function renderPanel(overrides: Partial<Parameters<typeof CustomProjectsTabPanel>[0]> = {}) {
  const props = {
    tab: makeTab(),
    allTags: ["kick", "mix", "rock"],
    refreshStats: vi.fn(),
    refreshTags: vi.fn(),
    refetchFiles: vi.fn(),
    scanCompletionSignal: null as number | null,
    setBanner: vi.fn(),
    musicRoot: "/music",
    ...overrides,
  };
  return { ...render(<CustomProjectsTabPanel {...props} />), props };
}

beforeEach(() => {
  mockGetProjects.mockReset().mockResolvedValue(makePaged());
  mockGetProjectDetail.mockReset().mockResolvedValue(makeDetail());
  mockGetProjectDuplicates.mockReset().mockResolvedValue(makeDuplicatesResult());
  mockUpdateProjectStatus.mockReset().mockResolvedValue(makeProject());
  mockUpdateProjectTags.mockReset().mockResolvedValue(makeProject());
  mockUpdateProjectScore.mockReset().mockResolvedValue(makeProject());
  mockBatchUpdateProjectScore.mockReset().mockResolvedValue({ updated: 2 });
  mockBatchAddProjectTags.mockReset().mockResolvedValue({ updated: 2 });
  mockReveal.mockReset().mockResolvedValue(undefined);
  // Root-relative shape (see src/scanner/folderTree.ts): the root's own path is "", never
  // an absolute filesystem path — musicRoot ("/music" above) is what CopyMoveDeleteDialog
  // joins it onto before calling any copy/move API function.
  mockGetFolderTree.mockReset().mockResolvedValue({ name: "music", path: "", type: "folder", children: [] });
  mockCopyProject.mockReset().mockResolvedValue({} as any);
  mockMoveProject.mockReset().mockResolvedValue({} as any);
  mockDeleteProject.mockReset().mockResolvedValue({} as any);
  mockBatchCopyProjects.mockReset().mockResolvedValue({ succeeded: ["p1", "p2"], failed: [] });
  mockBatchMoveProjects.mockReset().mockResolvedValue({ succeeded: ["p1", "p2"], failed: [] });
  mockBatchDeleteProjects.mockReset().mockResolvedValue({ succeeded: ["p1", "p2"], failed: [] });
  // Confirmation off by default — this file's tests predate the double-text-confirmation
  // feature and don't exercise its typed-confirmation gating (see CopyMoveDeleteDialog.test.tsx
  // for that coverage).
  mockGetConfirmationSettings.mockReset().mockResolvedValue({
    confirmTabDeletion: false,
    confirmCopy: false,
    confirmMove: false,
    confirmDelete: false,
    confirmStatusDeletion: false,
    confirmTagDeletion: false,
  });
  mockGetPaginationSettings.mockReset().mockResolvedValue({ itemsPerPage: PAGE_SIZE });
});

describe("CustomProjectsTabPanel - locked filters seed the initial fetch", () => {
  it("passes the tab's statuses/scores/tags into the INITIAL getProjects call", async () => {
    renderPanel();

    await waitFor(() =>
      expect(mockGetProjects).toHaveBeenCalledWith({ ...LOCKED_PARAMS, page: 1, pageSize: PAGE_SIZE })
    );
  });
});

describe("CustomProjectsTabPanel - locked pickers are hidden, search/sort stay live", () => {
  it("passes locked to FilterToolbar: no Status/Score/Tags pickers render", async () => {
    renderPanel();
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("button", { name: "Status" })).not.toBeInTheDocument();
    // ProjectsTable's Score column header is now also a sortable button named "Score" (see
    // ProjectsTable.tsx's SortTh), so an unscoped name query would match both it and the
    // FilterToolbar's Score picker. The picker is a MultiSelectDropdown trigger, uniquely
    // identified by aria-haspopup="listbox" (the sort header has no such attribute). Matching
    // on the exact name "Score" alone is NOT sufficient to find it though (docs/TODO.md item
    // 126): LOCKED_PARAMS pre-selects 2 scores, so the picker's real accessible name (if it
    // leaked through despite being locked) would be "Score (2)", never plain "Score" — an
    // exact-match query here would vacuously find nothing whether or not the underlying bug
    // this test exists to catch were reintroduced. Match the "Score"-prefix instead.
    const scoreButtons = screen.queryAllByRole("button", { name: /^Score/ });
    expect(scoreButtons.find((b) => b.getAttribute("aria-haspopup") === "listbox")).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Tags" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search project folders" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort by Modified" })).toBeInTheDocument();
  });
});

describe("CustomProjectsTabPanel - live search", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a subsequent getProjects call includes both the locked params AND the new search term", async () => {
    renderPanel();
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    const input = screen.getByRole("searchbox", { name: "Search project folders" });
    act(() => {
      fireEvent.change(input, { target: { value: "amen" } });
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(mockGetProjects).toHaveBeenLastCalledWith({ ...LOCKED_PARAMS, search: "amen", page: 1, pageSize: PAGE_SIZE });
  });
});

describe("CustomProjectsTabPanel - live sort", () => {
  it("a subsequent getProjects call includes both the locked params AND the new sort", async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Sort by Modified" }));

    await waitFor(() =>
      expect(mockGetProjects).toHaveBeenLastCalledWith({
        ...LOCKED_PARAMS,
        sortBy: "modifiedAt",
        sortDir: "asc",
        page: 1,
        pageSize: PAGE_SIZE,
      })
    );
  });
});

describe("CustomProjectsTabPanel - live sort via ProjectsTable column headers", () => {
  it("clicking the Score column header reaches getProjects with the locked params AND the new sort", async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(1));

    // ProjectsTable's sort-header buttons have an explicit "Sort by <label>" aria-label,
    // distinguishing them from FilterToolbar's same-named "Score" picker button.
    await user.click(screen.getByRole("button", { name: "Sort by Score" }));

    await waitFor(() =>
      expect(mockGetProjects).toHaveBeenLastCalledWith({
        ...LOCKED_PARAMS,
        sortBy: "score",
        sortDir: "asc",
        page: 1,
        pageSize: PAGE_SIZE,
      })
    );
  });
});

describe("CustomProjectsTabPanel - row click opens the detail panel", () => {
  it("opens ProjectDetailPanel with the clicked project", async () => {
    const project = makeProject({ id: "p1", name: "Amen Break" });
    mockGetProjects.mockResolvedValue(makePaged({ projects: [project], total: 1 }));
    mockGetProjectDetail.mockResolvedValue(makeDetail({ id: "p1", name: "Amen Break" }));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByText("Amen Break"));

    expect(screen.getByRole("dialog", { name: "Folder detail: Amen Break" })).toBeInTheDocument();
  });
});

describe("CustomProjectsTabPanel - editing status inside the panel", () => {
  it("refetches locally, and calls NEITHER refetchFiles NOR refreshTags (status is not cross-type linked)", async () => {
    const project = makeProject({ id: "p1", name: "Amen Break", status: "draft" });
    mockGetProjects.mockResolvedValue(makePaged({ projects: [project], total: 1 }));
    mockGetProjectDetail.mockResolvedValue(makeDetail({ id: "p1", name: "Amen Break" }));
    const user = userEvent.setup();
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByText("Amen Break"));

    const dialog = await screen.findByRole("dialog", { name: "Folder detail: Amen Break" });
    const callsBefore = mockGetProjects.mock.calls.length;
    // "Unknown" is the one status option always present regardless of the (dynamic, catalog-
    // sourced) rest of the list — see StatusCatalogContext.tsx — so this doesn't need a
    // StatusCatalogProvider/mocked catalog just to exercise an actual status change here.
    await user.click(within(dialog).getByRole("button", { name: "Unknown" }));

    await waitFor(() => expect(mockUpdateProjectStatus).toHaveBeenCalledWith("p1", "unknown"));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refetchFiles).not.toHaveBeenCalled();
    expect(props.refreshTags).not.toHaveBeenCalled();
  });
});

describe("CustomProjectsTabPanel - editing tags inside the panel", () => {
  it("refetches locally and calls refetchFiles + refreshTags (tags cascade onto member files)", async () => {
    const project = makeProject({ id: "p1", name: "Amen Break", tags: ["rock"] });
    mockGetProjects.mockResolvedValue(makePaged({ projects: [project], total: 1 }));
    mockGetProjectDetail.mockResolvedValue(makeDetail({ id: "p1", name: "Amen Break", tags: ["rock"] }));
    // delay: null avoids userEvent's real inter-keystroke delay racing the panel's
    // real 50ms auto-focus effect.
    const user = userEvent.setup({ delay: null });
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByText("Amen Break"));

    const dialog = await screen.findByRole("dialog", { name: "Folder detail: Amen Break" });
    const callsBefore = mockGetProjects.mock.calls.length;
    const input = within(dialog).getByRole("combobox");
    await user.type(input, "jazz{Enter}");

    await waitFor(() => expect(mockUpdateProjectTags).toHaveBeenCalledWith("p1", ["rock", "jazz"]));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refetchFiles).toHaveBeenCalledTimes(1);
    expect(props.refreshTags).toHaveBeenCalledTimes(1);
  });
});

describe("CustomProjectsTabPanel - editing score inside the panel", () => {
  it("refetches locally and calls refetchFiles (score cascades onto member files)", async () => {
    const project = makeProject({ id: "p1", name: "Amen Break", score: null });
    mockGetProjects.mockResolvedValue(makePaged({ projects: [project], total: 1 }));
    mockGetProjectDetail.mockResolvedValue(makeDetail({ id: "p1", name: "Amen Break" }));
    const user = userEvent.setup();
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByText("Amen Break"));

    const dialog = await screen.findByRole("dialog", { name: "Folder detail: Amen Break" });
    const callsBefore = mockGetProjects.mock.calls.length;
    await user.click(within(dialog).getByRole("radio", { name: "4 of 5" }));

    await waitFor(() => expect(mockUpdateProjectScore).toHaveBeenCalledWith("p1", 4));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refetchFiles).toHaveBeenCalledTimes(1);
    // docs/TODO.md item 26: the cascade can turn a previously-unscored file into a scored
    // one, so the header stats (unscoredCount) must be refreshed too.
    expect(props.refreshStats).toHaveBeenCalledTimes(1);
  });
});

describe("CustomProjectsTabPanel - batch edit", () => {
  it("applies a batch score and triggers the same cascade (local refetch + refetchFiles)", async () => {
    const projects = [makeProject({ id: "p1", name: "Amen Break" }), makeProject({ id: "p2", name: "Break Beat" })];
    mockGetProjects.mockResolvedValue(makePaged({ projects, total: 2 }));
    const user = userEvent.setup();
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "Select Amen Break" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Break Beat" }));

    const batchBtn = screen.getByRole("button", { name: /Batch Edit/ });
    expect(batchBtn).toBeEnabled();
    await user.click(batchBtn);

    const callsBefore = mockGetProjects.mock.calls.length;
    await user.click(within(screen.getByRole("dialog", { name: "Batch edit project folders" })).getByRole("radio", { name: "3 of 5" }));

    await waitFor(() => expect(mockBatchUpdateProjectScore).toHaveBeenCalledWith(["p1", "p2"], 3));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refetchFiles).toHaveBeenCalledTimes(1);
    // docs/TODO.md item 26: the cascade can turn a previously-unscored file into a scored
    // one, so the header stats (unscoredCount) must be refreshed too.
    expect(props.refreshStats).toHaveBeenCalledTimes(1);
  });

  it("applies a batch tag and triggers the same cascade (local refetch + refetchFiles + refreshTags)", async () => {
    const projects = [makeProject({ id: "p1", name: "Amen Break" }), makeProject({ id: "p2", name: "Break Beat" })];
    mockGetProjects.mockResolvedValue(makePaged({ projects, total: 2 }));
    const user = userEvent.setup({ delay: null });
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "Select Amen Break" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Break Beat" }));
    await user.click(screen.getByRole("button", { name: /Batch Edit/ }));

    const callsBefore = mockGetProjects.mock.calls.length;
    const tagInput = screen.getByPlaceholderText("Add tag, press Enter…");
    await user.type(tagInput, "kick{Enter}");

    await waitFor(() => expect(mockBatchAddProjectTags).toHaveBeenCalledWith(["p1", "p2"], ["kick"]));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refetchFiles).toHaveBeenCalledTimes(1);
    expect(props.refreshTags).toHaveBeenCalledTimes(1);
  });
});

describe("CustomProjectsTabPanel - selection resets on filter/page change", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears selection when the search filter changes", async () => {
    const projects = [makeProject({ id: "p1", name: "Amen Break" }), makeProject({ id: "p2", name: "Break Beat" })];
    mockGetProjects.mockResolvedValue(makePaged({ projects, total: 2 }));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "Select Amen Break" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Break Beat" }));
    expect(screen.getByRole("button", { name: "Batch Edit (2)" })).toBeInTheDocument();

    vi.useFakeTimers();
    act(() => {
      fireEvent.change(screen.getByRole("searchbox", { name: "Search project folders" }), { target: { value: "x" } });
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByRole("button", { name: "Batch Edit" })).toBeInTheDocument();
  });

  it("clears selection when the page changes", async () => {
    const projects = [makeProject({ id: "p1", name: "Amen Break" }), makeProject({ id: "p2", name: "Break Beat" })];
    mockGetProjects.mockResolvedValue(makePaged({ projects, total: 100, totalPages: 3, page: 1 }));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "Select Amen Break" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Break Beat" }));
    expect(screen.getByRole("button", { name: "Batch Edit (2)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next ›" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Batch Edit" })).toBeInTheDocument());
  });
});

describe("CustomProjectsTabPanel - scanCompletionSignal", () => {
  it("triggers exactly one refetch when the signal changes, and does not double-fetch on initial mount", async () => {
    const { rerender } = render(
      <CustomProjectsTabPanel
        tab={makeTab()}
        allTags={[]}
        refreshStats={() => {}}
        refreshTags={() => {}}
        refetchFiles={() => {}}
        setBanner={() => {}}
        musicRoot="/music"
        scanCompletionSignal={null}
      />
    );

    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(1));

    rerender(
      <CustomProjectsTabPanel
        tab={makeTab()}
        allTags={[]}
        refreshStats={() => {}}
        refreshTags={() => {}}
        refetchFiles={() => {}}
        setBanner={() => {}}
        musicRoot="/music"
        scanCompletionSignal={3}
      />
    );

    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(2));
    // No further, unexpected fetch beyond the single scan-triggered one.
    expect(mockGetProjects).toHaveBeenCalledTimes(2);
  });

  it("treats a non-null INITIAL value as the baseline (no extra fetch on mount), and still refetches once on a subsequent change", async () => {
    // Covers the case where a custom tab is created/mounted after a scan already happened
    // elsewhere in the session, so scanCompletionSignal is non-null on first mount. A
    // buggy guard that checks `scanCompletionSignal === null` (instead of a ref tracking
    // "have I seen the first render yet") would incorrectly treat this as "already past
    // the initial scan" and fire an extra fetch immediately on mount.
    const { rerender } = render(
      <CustomProjectsTabPanel
        tab={makeTab()}
        allTags={[]}
        refreshStats={() => {}}
        refreshTags={() => {}}
        refetchFiles={() => {}}
        setBanner={() => {}}
        musicRoot="/music"
        scanCompletionSignal={5}
      />
    );

    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(1));
    // No extra fetch just because the mount-time signal happened to be non-null.
    expect(mockGetProjects).toHaveBeenCalledTimes(1);

    rerender(
      <CustomProjectsTabPanel
        tab={makeTab()}
        allTags={[]}
        refreshStats={() => {}}
        refreshTags={() => {}}
        refetchFiles={() => {}}
        setBanner={() => {}}
        musicRoot="/music"
        scanCompletionSignal={6}
      />
    );

    await waitFor(() => expect(mockGetProjects).toHaveBeenCalledTimes(2));
    expect(mockGetProjects).toHaveBeenCalledTimes(2);
  });
});

describe("CustomProjectsTabPanel - reveal", () => {
  // Reveal in Finder is only reachable through ProjectDetailPanel (opened via a row click) now
  // that ProjectsTable no longer renders its own Reveal button/column.
  it("calls api.reveal with the project's path", async () => {
    const project = makeProject({ id: "p1", name: "Amen Break", path: "/music/Amen Break" });
    mockGetProjects.mockResolvedValue(makePaged({ projects: [project], total: 1 }));
    mockGetProjectDetail.mockResolvedValue(makeDetail({ id: "p1", name: "Amen Break", path: "/music/Amen Break" }));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByText("Amen Break"));

    const dialog = await screen.findByRole("dialog", { name: "Folder detail: Amen Break" });
    await user.click(within(dialog).getByRole("button", { name: "Reveal in Finder" }));

    expect(mockReveal).toHaveBeenCalledWith("/music/Amen Break");
  });

  it("calls setBanner with the error message when the reveal rejects, mirroring App.tsx's handleReveal", async () => {
    const project = makeProject({ id: "p1", name: "Amen Break", path: "/music/Amen Break" });
    mockGetProjects.mockResolvedValue(makePaged({ projects: [project], total: 1 }));
    mockGetProjectDetail.mockResolvedValue(makeDetail({ id: "p1", name: "Amen Break", path: "/music/Amen Break" }));
    mockReveal.mockRejectedValue(new Error("Path is outside the music root"));
    const setBanner = vi.fn();
    const user = userEvent.setup();
    renderPanel({ setBanner });

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByText("Amen Break"));

    const dialog = await screen.findByRole("dialog", { name: "Folder detail: Amen Break" });
    await user.click(within(dialog).getByRole("button", { name: "Reveal in Finder" }));

    await waitFor(() => expect(setBanner).toHaveBeenCalledWith("Path is outside the music root"));
  });
});

describe("CustomProjectsTabPanel - Copy/Move/Delete wiring", () => {
  it("opens the CopyMoveDeleteDialog with the correct operation/title when Move is clicked from the detail panel", async () => {
    const project = makeProject({ id: "p1", name: "Amen Break", path: "/music/Amen Break" });
    mockGetProjects.mockResolvedValue(makePaged({ projects: [project], total: 1 }));
    mockGetProjectDetail.mockResolvedValue(makeDetail({ id: "p1", name: "Amen Break", path: "/music/Amen Break" }));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByText("Amen Break"));
    const detailDialog = await screen.findByRole("dialog", { name: "Folder detail: Amen Break" });
    await user.click(within(detailDialog).getByRole("button", { name: "Move" }));

    expect(screen.getByRole("dialog", { name: 'Move "Amen Break"' })).toBeInTheDocument();
  });

  it("on a successful Delete: calls api.deleteProject, refetches locally, calls refetchFiles + refreshStats, sets the banner, and closes the detail panel", async () => {
    const project = makeProject({ id: "p1", name: "Amen Break", path: "/music/Amen Break" });
    mockGetProjects.mockResolvedValue(makePaged({ projects: [project], total: 1 }));
    mockGetProjectDetail.mockResolvedValue(makeDetail({ id: "p1", name: "Amen Break", path: "/music/Amen Break" }));
    const user = userEvent.setup();
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByText("Amen Break"));
    const detailDialog = await screen.findByRole("dialog", { name: "Folder detail: Amen Break" });
    await user.click(within(detailDialog).getByRole("button", { name: "Delete" }));

    const opDialog = screen.getByRole("dialog", { name: 'Move to Trash "Amen Break"' });
    const callsBefore = mockGetProjects.mock.calls.length;
    await user.click(within(opDialog).getByRole("button", { name: "Move to Trash" }));

    await waitFor(() => expect(mockDeleteProject).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refetchFiles).toHaveBeenCalledTimes(1);
    expect(props.refreshStats).toHaveBeenCalledTimes(1);
    expect(props.setBanner).toHaveBeenCalledWith("Folder moved to Trash.");
    expect(screen.queryByRole("dialog", { name: "Folder detail: Amen Break" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: 'Move to Trash "Amen Break"' })).not.toBeInTheDocument();
  });
});

describe("CustomProjectsTabPanel - batch Copy/Move/Delete wiring", () => {
  it("opens the CopyMoveDeleteDialog for the selected batch when Move is clicked from the batch panel", async () => {
    // Distinct, non-nested paths: the two projects are siblings, so the ancestor/descendant
    // dedup should leave both ids in the batch.
    const projects = [
      makeProject({ id: "p1", name: "Amen Break", path: "/music/Amen Break" }),
      makeProject({ id: "p2", name: "Break Beat", path: "/music/Break Beat" }),
    ];
    mockGetProjects.mockResolvedValue(makePaged({ projects, total: 2 }));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "Select Amen Break" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Break Beat" }));
    await user.click(screen.getByRole("button", { name: /Batch Edit/ }));

    const batchDialog = screen.getByRole("dialog", { name: "Batch edit project folders" });
    await user.click(within(batchDialog).getByRole("button", { name: "Move" }));

    expect(screen.getByRole("dialog", { name: "Move 2 projects" })).toBeInTheDocument();
  });

  it("on a successful batch Delete: calls api.batchDeleteProjects with both ids, refetches locally, calls refetchFiles + refreshStats, and sets the banner", async () => {
    const projects = [
      makeProject({ id: "p1", name: "Amen Break", path: "/music/Amen Break" }),
      makeProject({ id: "p2", name: "Break Beat", path: "/music/Break Beat" }),
    ];
    mockGetProjects.mockResolvedValue(makePaged({ projects, total: 2 }));
    const user = userEvent.setup();
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("Amen Break")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "Select Amen Break" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Break Beat" }));
    await user.click(screen.getByRole("button", { name: /Batch Edit/ }));

    const batchDialog = screen.getByRole("dialog", { name: "Batch edit project folders" });
    await user.click(within(batchDialog).getByRole("button", { name: "Delete" }));

    const opDialog = screen.getByRole("dialog", { name: "Move to Trash 2 projects" });
    const callsBefore = mockGetProjects.mock.calls.length;
    await user.click(within(opDialog).getByRole("button", { name: "Move to Trash" }));

    await waitFor(() => expect(mockBatchDeleteProjects).toHaveBeenCalledWith(["p1", "p2"]));
    await waitFor(() => expect(mockGetProjects.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refetchFiles).toHaveBeenCalledTimes(1);
    expect(props.refreshStats).toHaveBeenCalledTimes(1);
    expect(props.setBanner).toHaveBeenCalledWith("2 folders moved to Trash.");
    // The batch panel itself stays open (mirrors the existing batch score/tag behavior).
    // BatchEditPanel is permanently mounted (CSS transform toggles visibility rather than
    // unmounting), so its dialog role/name is in the DOM regardless of open/closed state —
    // the open/closed state has to be checked via the translate-x-0/translate-x-full class.
    expect(screen.getByRole("dialog", { name: "Batch edit project folders" })).toHaveClass("translate-x-0");
  });

  it("excludes a selected nested sub-project from a batch Move, sending only the parent's id", async () => {
    // "Break Beat" is selected alongside its own nested sub-project "Break Beat/Stems" — the
    // ancestor/descendant dedup (BatchEditPanel's excludeNestedProjectIds, driven by the
    // projectPaths this panel passes down from its own currently-visible `projects` list)
    // should drop the descendant before the batch request is ever sent.
    const parent = makeProject({ id: "p1", name: "Break Beat", path: "/music/Break Beat" });
    const child = makeProject({ id: "p2", name: "Stems", path: "/music/Break Beat/Stems" });
    mockGetProjects.mockResolvedValue(makePaged({ projects: [parent, child], total: 2 }));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("Break Beat")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "Select Break Beat" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Stems" }));
    await user.click(screen.getByRole("button", { name: /Batch Edit/ }));

    const batchDialog = screen.getByRole("dialog", { name: "Batch edit project folders" });
    await user.click(within(batchDialog).getByRole("button", { name: "Move" }));

    // Only 1 project (the parent) reaches the dialog's target, not the 2 originally selected —
    // still a "batch" target (kind isn't downgraded to "single" by the dedup), so the title is
    // count-based, not name-based.
    expect(screen.getByRole("dialog", { name: "Move 1 project" })).toBeInTheDocument();
  });
});

