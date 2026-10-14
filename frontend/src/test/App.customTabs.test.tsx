import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.js";
import type { AudioFile, CustomTab, Project } from "../types.js";
import type { LibraryStats, PagedFiles, PagedProjects } from "../api/client.js";

// App.tsx's mount effect fetches getConfig/getLastScan/getStats/getAllTags/getCustomTabs in
// addition to the paged getFiles/getProjects the two hooks fetch — every one of these is
// wrapped in `.catch(() => {})`, so an unmocked/rejected call is silently swallowed and
// produces a confusingly incomplete/empty render rather than a clear test failure. All seven
// must be mocked with resolved values, plus createCustomTab/deleteCustomTab for this file's
// own interactions.
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
const mockCreateCustomTab = vi.mocked(api.createCustomTab);
const mockDeleteCustomTab = vi.mocked(api.deleteCustomTab);
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

const NEW_TAB: CustomTab = {
  id: 42,
  name: "My Custom",
  type: "files",
  statuses: [],
  scores: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
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
  mockCreateCustomTab.mockReset().mockResolvedValue(NEW_TAB);
  mockDeleteCustomTab.mockReset().mockResolvedValue(undefined);
  // Confirmation off by default — this file's test predates the double-text-confirmation
  // feature and doesn't exercise its typed-confirmation gating (see
  // DeleteTabConfirmDialog.test.tsx for that coverage).
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

describe("App - custom tabs wiring", () => {
  it("opens the create-tab modal from the leftmost '+' button, switches to the new tab on creation, then deletes it via the '×' confirm flow and falls back to Project Folders", async () => {
    // CreateCustomTabModal has a real `setTimeout(() => closeRef.current?.focus(), 50)`
    // mount-effect. A default userEvent.setup()'s
    // real-timer inter-keystroke delays can straddle that window under load (e.g. running
    // as part of the full suite) and steal focus mid-type, dropping characters. Use
    // `delay: null` so the whole interaction commits synchronously instead.
    //
    // This test also chains an unusually long sequence of real interactions (open modal ->
    // type -> select radio -> submit -> wait for close -> switch panel -> open delete dialog
    // -> confirm -> wait for fallback), longer than most other tests in this suite, so it can
    // brush up against vitest's default 5000ms per-test timeout under system load even though
    // each individual step is fast in isolation — bump this test's own timeout rather than the
    // shared config default (observed timing out intermittently at 5000ms under load, never
    // failing on an actual assertion).
    const user = userEvent.setup({ delay: null });
    render(<App />);

    await waitFor(() => expect(mockGetCustomTabs).toHaveBeenCalled());
    // Default "Project Folders" tab is active on mount.
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Alpha Sessions" })).toBeInTheDocument());

    // The "+" button must be the left-most element in the tab row, before "Project Folders"
    // (an explicit requirement of this task) — assert DOM order directly rather than relying
    // only on presence/click-behavior, since jsdom/RTL can verify structural order even though
    // it can't verify visual layout.
    const plusButton = screen.getByRole("button", { name: "Create custom tab" });
    const projectsTabButton = screen.getByRole("button", { name: "Project Folders" });
    expect(plusButton.compareDocumentPosition(projectsTabButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The "+" button must carry a `border` class (matching this app's other bordered buttons,
    // e.g. Settings) — a legitimate DOM-level assertion (class presence), not a claim about
    // visual appearance, which jsdom can't verify.
    expect(plusButton.className.split(/\s+/)).toContain("border");

    // "+" button opens the create-tab modal.
    await user.click(plusButton);
    const dialog = screen.getByRole("dialog", { name: "Create custom tab" });
    await user.type(within(dialog).getByLabelText("Name"), "My Custom");
    await user.click(within(dialog).getByRole("radio", { name: "Audio Files" }));
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(mockCreateCustomTab).toHaveBeenCalledWith({
      name: "My Custom",
      type: "files",
      statuses: [],
      scores: [],
      tags: [],
    });

    // Modal closes and the new tab becomes active, rendering CustomFilesTabPanel. The modal now
    // stays mounted (slide-in/out via transform, matching ScanFolderPanel/SettingsPanel) rather
    // than unmounting, so "closed" is asserted via its off-screen transform class, not absence.
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Create custom tab" }).className).toContain("translate-x-full"));
    await waitFor(() => expect(screen.getByRole("main", { name: "My Custom files" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "My Custom" })).toHaveAttribute("aria-current", "true");

    // "×" opens the delete confirmation dialog.
    await user.click(screen.getByRole("button", { name: "Delete tab My Custom" }));
    const confirmDialog = screen.getByRole("dialog", { name: "Delete tab confirmation" });
    expect(within(confirmDialog).getByText(/Delete the tab "My Custom"\?/)).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    expect(mockDeleteCustomTab).toHaveBeenCalledWith(42);

    // Deleting the active custom tab removes it from the tab bar and falls back to Project Folders.
    await waitFor(() => expect(screen.queryByRole("button", { name: "My Custom" })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Alpha Sessions" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Project Folders" })).toHaveAttribute("aria-current", "true");
  }, 15000);
});
