import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomFilesTabPanel from "../CustomFilesTabPanel.js";
import type { AudioFile, CustomTab } from "../../types.js";
import type { PagedFiles } from "../../api/client.js";
import { PAGE_SIZE } from "../../constants.js";

vi.mock("../../api/client.js", () => ({
  getFiles: vi.fn(),
  updateStatus: vi.fn(),
  updateTags: vi.fn(),
  updateFileScore: vi.fn(),
  batchUpdateFileScore: vi.fn(),
  batchAddFileTags: vi.fn(),
  reveal: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetFiles = vi.mocked(api.getFiles);
const mockUpdateStatus = vi.mocked(api.updateStatus);
const mockUpdateTags = vi.mocked(api.updateTags);
const mockUpdateFileScore = vi.mocked(api.updateFileScore);
const mockBatchUpdateFileScore = vi.mocked(api.batchUpdateFileScore);
const mockBatchAddFileTags = vi.mocked(api.batchAddFileTags);
const mockReveal = vi.mocked(api.reveal);

function makeFile(overrides: Partial<AudioFile> = {}): AudioFile {
  return {
    id: "f1",
    path: "/music/Song/track.wav",
    relativePath: "Song/track.wav",
    filename: "track.wav",
    extension: ".wav",
    size: 1024,
    modifiedAt: "2026-01-15T10:30:00.000Z",
    containingFolder: "Song",
    status: "draft",
    tags: [],
    score: null,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    ...overrides,
  };
}

function makeTab(overrides: Partial<CustomTab> = {}): CustomTab {
  return {
    id: 1,
    name: "My Drafts",
    type: "files",
    statuses: ["draft", "done"],
    scores: [3, "unscored"],
    tags: ["kick", "mix"],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePaged(overrides: Partial<PagedFiles> = {}): PagedFiles {
  return {
    files: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 1,
    ...overrides,
  };
}

const LOCKED_PARAMS = { statuses: ["draft", "done"], scores: [3, "unscored"], tags: ["kick", "mix"] };

function renderPanel(overrides: Partial<Parameters<typeof CustomFilesTabPanel>[0]> = {}) {
  const props = {
    tab: makeTab(),
    allTags: ["kick", "mix", "rock"],
    isDark: true,
    refreshStats: vi.fn(),
    refreshTags: vi.fn(),
    refetchProjects: vi.fn(),
    scanCompletionSignal: null as number | null,
    playingFileId: null as string | null,
    isPlaying: false,
    onPlayClick: vi.fn(),
    setBanner: vi.fn(),
    ...overrides,
  };
  return { ...render(<CustomFilesTabPanel {...props} />), props };
}

beforeEach(() => {
  mockGetFiles.mockReset().mockResolvedValue(makePaged());
  mockUpdateStatus.mockReset().mockResolvedValue(makeFile());
  mockUpdateTags.mockReset().mockResolvedValue(makeFile());
  mockUpdateFileScore.mockReset().mockResolvedValue(makeFile());
  mockBatchUpdateFileScore.mockReset().mockResolvedValue({ updated: 2 });
  mockBatchAddFileTags.mockReset().mockResolvedValue({ updated: 2 });
  mockReveal.mockReset().mockResolvedValue(undefined);
});

describe("CustomFilesTabPanel - locked filters seed the initial fetch", () => {
  it("passes the tab's statuses/scores/tags into the INITIAL getFiles call", async () => {
    renderPanel();

    await waitFor(() =>
      expect(mockGetFiles).toHaveBeenCalledWith({ ...LOCKED_PARAMS, page: 1, pageSize: PAGE_SIZE })
    );
  });
});

describe("CustomFilesTabPanel - locked pickers are hidden, search/sort stay live", () => {
  it("passes locked to FilterToolbar: no Status/Score/Tags pickers render", async () => {
    renderPanel();
    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("button", { name: "Status" })).not.toBeInTheDocument();
    // FileTable's Score column header is now also a sortable button named "Score" (see
    // FileTable.tsx's SortTh), so an unscoped name query would match both it and the
    // FilterToolbar's Score picker. The picker is a MultiSelectDropdown trigger, uniquely
    // identified by aria-haspopup="listbox" (the sort header has no such attribute).
    const scoreButtons = screen.queryAllByRole("button", { name: "Score" });
    expect(scoreButtons.find((b) => b.getAttribute("aria-haspopup") === "listbox")).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Tags" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search by filename or path" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sort: Modified/ })).toBeInTheDocument();
  });
});

describe("CustomFilesTabPanel - live search", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a subsequent getFiles call includes both the locked params AND the new search term", async () => {
    renderPanel();
    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    const input = screen.getByRole("searchbox", { name: "Search by filename or path" });
    act(() => {
      fireEvent.change(input, { target: { value: "amen" } });
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(mockGetFiles).toHaveBeenLastCalledWith({ ...LOCKED_PARAMS, search: "amen", page: 1, pageSize: PAGE_SIZE });
  });
});

describe("CustomFilesTabPanel - live sort", () => {
  it("a subsequent getFiles call includes both the locked params AND the new sort", async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /Sort: Modified/ }));

    await waitFor(() =>
      expect(mockGetFiles).toHaveBeenLastCalledWith({
        ...LOCKED_PARAMS,
        sortBy: "modifiedAt",
        sortDir: "asc",
        page: 1,
        pageSize: PAGE_SIZE,
      })
    );
  });
});

describe("CustomFilesTabPanel - row click opens the detail panel", () => {
  it("opens FileDetailPanel with the clicked file", async () => {
    const file = makeFile({ id: "f1", filename: "kick_amen.wav" });
    mockGetFiles.mockResolvedValue(makePaged({ files: [file], total: 1 }));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("kick_amen.wav")).toBeInTheDocument());
    await user.click(screen.getByText("kick_amen.wav"));

    expect(screen.getByRole("dialog", { name: "File detail: kick_amen.wav" })).toBeInTheDocument();
  });
});

describe("CustomFilesTabPanel - editing status inside the panel", () => {
  it("refetches locally and calls refreshStats, but NOT refetchProjects/refreshTags (status is not cross-type linked)", async () => {
    const file = makeFile({ id: "f1", filename: "kick.wav", status: "draft" });
    mockGetFiles.mockResolvedValue(makePaged({ files: [file], total: 1 }));
    const user = userEvent.setup();
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("kick.wav")).toBeInTheDocument());
    await user.click(screen.getByText("kick.wav"));

    const dialog = screen.getByRole("dialog", { name: "File detail: kick.wav" });
    const callsBefore = mockGetFiles.mock.calls.length;
    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith("f1", "done"));
    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refreshStats).toHaveBeenCalledTimes(1);
    expect(props.refetchProjects).not.toHaveBeenCalled();
    expect(props.refreshTags).not.toHaveBeenCalled();
  });
});

describe("CustomFilesTabPanel - editing tags inside the panel", () => {
  it("refetches locally and calls refetchProjects + refreshTags, but NOT refreshStats", async () => {
    const file = makeFile({ id: "f1", filename: "kick.wav", tags: ["rock"] });
    mockGetFiles.mockResolvedValue(makePaged({ files: [file], total: 1 }));
    // delay: null avoids userEvent's real inter-keystroke delay racing the panel's
    // real 50ms auto-focus effect.
    const user = userEvent.setup({ delay: null });
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("kick.wav")).toBeInTheDocument());
    await user.click(screen.getByText("kick.wav"));

    const dialog = screen.getByRole("dialog", { name: "File detail: kick.wav" });
    const callsBefore = mockGetFiles.mock.calls.length;
    const input = within(dialog).getByRole("combobox");
    await user.type(input, "jazz{Enter}");

    await waitFor(() => expect(mockUpdateTags).toHaveBeenCalledWith("f1", ["rock", "jazz"]));
    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refetchProjects).toHaveBeenCalledTimes(1);
    expect(props.refreshTags).toHaveBeenCalledTimes(1);
    expect(props.refreshStats).not.toHaveBeenCalled();
  });
});

describe("CustomFilesTabPanel - editing score inside the panel", () => {
  it("refetches locally and calls refreshStats + refetchProjects", async () => {
    const file = makeFile({ id: "f1", filename: "kick.wav", score: null });
    mockGetFiles.mockResolvedValue(makePaged({ files: [file], total: 1 }));
    const user = userEvent.setup();
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("kick.wav")).toBeInTheDocument());
    await user.click(screen.getByText("kick.wav"));

    const dialog = screen.getByRole("dialog", { name: "File detail: kick.wav" });
    const callsBefore = mockGetFiles.mock.calls.length;
    await user.click(within(dialog).getByRole("radio", { name: "4 of 5" }));

    await waitFor(() => expect(mockUpdateFileScore).toHaveBeenCalledWith("f1", 4));
    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refreshStats).toHaveBeenCalledTimes(1);
    expect(props.refetchProjects).toHaveBeenCalledTimes(1);
  });
});

describe("CustomFilesTabPanel - batch edit", () => {
  it("applies a batch score and triggers the same cascade (local refetch + refreshStats + refetchProjects)", async () => {
    const files = [makeFile({ id: "f1", filename: "a.wav" }), makeFile({ id: "f2", filename: "b.wav" })];
    mockGetFiles.mockResolvedValue(makePaged({ files, total: 2 }));
    const user = userEvent.setup();
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("a.wav")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "Select a.wav" }));
    await user.click(screen.getByRole("checkbox", { name: "Select b.wav" }));

    const batchBtn = screen.getByRole("button", { name: /Batch Edit/ });
    expect(batchBtn).toBeEnabled();
    await user.click(batchBtn);

    const callsBefore = mockGetFiles.mock.calls.length;
    await user.click(within(screen.getByRole("dialog", { name: "Batch edit audio files" })).getByRole("radio", { name: "3 of 5" }));

    await waitFor(() => expect(mockBatchUpdateFileScore).toHaveBeenCalledWith(["f1", "f2"], 3));
    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refreshStats).toHaveBeenCalledTimes(1);
    expect(props.refetchProjects).toHaveBeenCalledTimes(1);
  });

  it("applies a batch tag and triggers the same cascade (local refetch + refetchProjects + refreshTags)", async () => {
    const files = [makeFile({ id: "f1", filename: "a.wav" }), makeFile({ id: "f2", filename: "b.wav" })];
    mockGetFiles.mockResolvedValue(makePaged({ files, total: 2 }));
    const user = userEvent.setup({ delay: null });
    const { props } = renderPanel();

    await waitFor(() => expect(screen.getByText("a.wav")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "Select a.wav" }));
    await user.click(screen.getByRole("checkbox", { name: "Select b.wav" }));
    await user.click(screen.getByRole("button", { name: /Batch Edit/ }));

    const callsBefore = mockGetFiles.mock.calls.length;
    const tagInput = screen.getByPlaceholderText("Add tag, press Enter…");
    await user.type(tagInput, "kick{Enter}");

    await waitFor(() => expect(mockBatchAddFileTags).toHaveBeenCalledWith(["f1", "f2"], ["kick"]));
    await waitFor(() => expect(mockGetFiles.mock.calls.length).toBe(callsBefore + 1));
    expect(props.refetchProjects).toHaveBeenCalledTimes(1);
    expect(props.refreshTags).toHaveBeenCalledTimes(1);
  });
});

describe("CustomFilesTabPanel - selection resets on filter/page change", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears selection when the search filter changes", async () => {
    const files = [makeFile({ id: "f1", filename: "a.wav" }), makeFile({ id: "f2", filename: "b.wav" })];
    mockGetFiles.mockResolvedValue(makePaged({ files, total: 2 }));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("a.wav")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "Select a.wav" }));
    await user.click(screen.getByRole("checkbox", { name: "Select b.wav" }));
    expect(screen.getByRole("button", { name: "Batch Edit (2)" })).toBeInTheDocument();

    vi.useFakeTimers();
    act(() => {
      fireEvent.change(screen.getByRole("searchbox", { name: "Search by filename or path" }), { target: { value: "x" } });
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByRole("button", { name: "Batch Edit" })).toBeInTheDocument();
  });

  it("clears selection when the page changes", async () => {
    const files = [makeFile({ id: "f1", filename: "a.wav" }), makeFile({ id: "f2", filename: "b.wav" })];
    mockGetFiles.mockResolvedValue(makePaged({ files, total: 100, totalPages: 3, page: 1 }));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("a.wav")).toBeInTheDocument());
    await user.click(screen.getByRole("checkbox", { name: "Select a.wav" }));
    await user.click(screen.getByRole("checkbox", { name: "Select b.wav" }));
    expect(screen.getByRole("button", { name: "Batch Edit (2)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next ›" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Batch Edit" })).toBeInTheDocument());
  });
});

describe("CustomFilesTabPanel - scanCompletionSignal", () => {
  it("triggers exactly one refetch when the signal changes, and does not double-fetch on initial mount", async () => {
    const { rerender } = render(
      <CustomFilesTabPanel
        tab={makeTab()}
        allTags={[]}
        isDark
        refreshStats={() => {}}
        refreshTags={() => {}}
        refetchProjects={() => {}}
        scanCompletionSignal={null}
        playingFileId={null}
        isPlaying={false}
        onPlayClick={() => {}}
        setBanner={() => {}}
      />
    );

    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    rerender(
      <CustomFilesTabPanel
        tab={makeTab()}
        allTags={[]}
        isDark
        refreshStats={() => {}}
        refreshTags={() => {}}
        refetchProjects={() => {}}
        scanCompletionSignal={3}
        playingFileId={null}
        isPlaying={false}
        onPlayClick={() => {}}
        setBanner={() => {}}
      />
    );

    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(2));
    // No further, unexpected fetch beyond the single scan-triggered one.
    expect(mockGetFiles).toHaveBeenCalledTimes(2);
  });

  it("treats a non-null INITIAL value as the baseline (no extra fetch on mount), and still refetches once on a subsequent change", async () => {
    // Covers the case where a custom tab is created/mounted after a scan already happened
    // elsewhere in the session, so scanCompletionSignal is non-null on first mount. A
    // buggy guard that checks `scanCompletionSignal === null` (instead of a ref tracking
    // "have I seen the first render yet") would incorrectly treat this as "already past
    // the initial scan" and fire an extra fetch immediately on mount.
    const { rerender } = render(
      <CustomFilesTabPanel
        tab={makeTab()}
        allTags={[]}
        isDark
        refreshStats={() => {}}
        refreshTags={() => {}}
        refetchProjects={() => {}}
        scanCompletionSignal={5}
        playingFileId={null}
        isPlaying={false}
        onPlayClick={() => {}}
        setBanner={() => {}}
      />
    );

    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));
    // No extra fetch just because the mount-time signal happened to be non-null.
    expect(mockGetFiles).toHaveBeenCalledTimes(1);

    rerender(
      <CustomFilesTabPanel
        tab={makeTab()}
        allTags={[]}
        isDark
        refreshStats={() => {}}
        refreshTags={() => {}}
        refetchProjects={() => {}}
        scanCompletionSignal={6}
        playingFileId={null}
        isPlaying={false}
        onPlayClick={() => {}}
        setBanner={() => {}}
      />
    );

    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(2));
    expect(mockGetFiles).toHaveBeenCalledTimes(2);
  });
});

describe("CustomFilesTabPanel - reveal", () => {
  it("calls api.reveal with the file's path", async () => {
    const file = makeFile({ id: "f1", filename: "kick.wav", path: "/music/Song/kick.wav" });
    mockGetFiles.mockResolvedValue(makePaged({ files: [file], total: 1 }));
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("kick.wav")).toBeInTheDocument());
    await user.click(screen.getByText("kick.wav"));
    await user.click(screen.getByRole("button", { name: "Reveal file in Finder" }));

    expect(mockReveal).toHaveBeenCalledWith("/music/Song/kick.wav");
  });

  it("calls setBanner with the error message when the reveal rejects, mirroring App.tsx's handleReveal", async () => {
    const file = makeFile({ id: "f1", filename: "kick.wav", path: "/music/Song/kick.wav" });
    mockGetFiles.mockResolvedValue(makePaged({ files: [file], total: 1 }));
    mockReveal.mockRejectedValue(new Error("Path is outside the music root"));
    const setBanner = vi.fn();
    const user = userEvent.setup();
    renderPanel({ setBanner });

    await waitFor(() => expect(screen.getByText("kick.wav")).toBeInTheDocument());
    await user.click(screen.getByText("kick.wav"));
    await user.click(screen.getByRole("button", { name: "Reveal file in Finder" }));

    await waitFor(() => expect(setBanner).toHaveBeenCalledWith("Path is outside the music root"));
  });
});

describe("CustomFilesTabPanel - bottom padding while the player bar is visible (§11.4)", () => {
  it("adds pb-20 to the main content area when a file is loaded into the player (playingFileId set)", async () => {
    renderPanel({ playingFileId: "f1", isPlaying: false });

    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    const main = screen.getByRole("main");
    expect(main.className).toContain("pb-20");
  });

  it("does not add pb-20 when no file is loaded into the player", async () => {
    renderPanel({ playingFileId: null });

    await waitFor(() => expect(mockGetFiles).toHaveBeenCalledTimes(1));

    const main = screen.getByRole("main");
    expect(main.className).not.toContain("pb-20");
  });
});

describe("CustomFilesTabPanel - playback pass-through (App-level/global, not local state)", () => {
  it("renders the matching row as playing (Pause) only when playingFileId matches AND isPlaying is true", async () => {
    const file = makeFile({ id: "f1", filename: "kick.wav" });
    mockGetFiles.mockResolvedValue(makePaged({ files: [file], total: 1 }));
    renderPanel({ playingFileId: "f1", isPlaying: true });

    await waitFor(() => expect(screen.getByRole("button", { name: "Pause kick.wav" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Play kick.wav" })).not.toBeInTheDocument();
  });

  it("renders the row as not-playing (Play) when playingFileId matches but isPlaying is false", async () => {
    const file = makeFile({ id: "f1", filename: "kick.wav" });
    mockGetFiles.mockResolvedValue(makePaged({ files: [file], total: 1 }));
    renderPanel({ playingFileId: "f1", isPlaying: false });

    await waitFor(() => expect(screen.getByRole("button", { name: "Play kick.wav" })).toBeInTheDocument());
  });

  it("calls onPlayClick with the clicked file object, and does not open the detail panel", async () => {
    const file = makeFile({ id: "f1", filename: "kick.wav" });
    mockGetFiles.mockResolvedValue(makePaged({ files: [file], total: 1 }));
    const onPlayClick = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onPlayClick });

    await waitFor(() => expect(screen.getByRole("button", { name: "Play kick.wav" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Play kick.wav" }));

    expect(onPlayClick).toHaveBeenCalledWith(file);
    expect(screen.queryByRole("dialog", { name: "File detail: kick.wav" })).not.toBeInTheDocument();
  });
});
