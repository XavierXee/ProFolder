import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App.js";
import type { AudioFile } from "../types.js";
import type { LibraryStats, PagedFiles, PagedProjects } from "../api/client.js";

// App.tsx's mount effect fetches getConfig/getLastScan/getStats/getAllTags/getCustomTabs in
// addition to the paged getFiles/getProjects the two hooks fetch — every one of these is
// wrapped in `.catch(() => {})`, so an unmocked/rejected call is silently swallowed and
// produces a confusingly incomplete/empty render rather than a clear test failure. All seven
// must be mocked with resolved values.
// AudioPlayerBar (mounted once a file starts playing) additionally calls getFileAudioUrl to
// build the <audio> element's src — must be mocked too or it throws mid-render.
vi.mock("../api/client.js", () => ({
  getFiles: vi.fn(),
  getProjects: vi.fn(),
  getConfig: vi.fn(),
  getLastScan: vi.fn(),
  getStats: vi.fn(),
  getAllTags: vi.fn(),
  getCustomTabs: vi.fn(),
  getFileAudioUrl: vi.fn((id: string) => `/api/files/${id}/audio`),
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

const FILES_PAGE: PagedFiles = {
  files: [
    makeFile({ id: "file-1", filename: "Kick One.wav", relativePath: "Drums/Kick One.wav" }),
    makeFile({ id: "file-2", filename: "Snare Two.wav", relativePath: "Drums/Snare Two.wav" }),
  ],
  total: 2,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

const PROJECTS_PAGE: PagedProjects = {
  projects: [],
  total: 0,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};

const STATS: LibraryStats = {
  files: { total: 2, byStatus: { unknown: 2, draft: 0, needs_mixing: 0, done: 0, released: 0 } },
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

async function switchToFilesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Audio Files" }));
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Kick One.wav" })).toBeInTheDocument());
}

describe("App - audio player play/pause toggle (same-file second click pauses, doesn't restart)", () => {
  it("pauses (not stops/restarts) on a second click of the same row's play button", async () => {
    const user = userEvent.setup();
    render(<App />);
    await switchToFilesTab(user);

    const rowPlayButton = () => screen.getByRole("button", { name: /^(Play|Pause) Kick One\.wav$/ });

    // 1. First click: row button flips to Pause, bar mounts showing the file and reads Pause.
    expect(rowPlayButton()).toHaveAccessibleName("Play Kick One.wav");
    await user.click(rowPlayButton());

    await waitFor(() => expect(rowPlayButton()).toHaveAccessibleName("Pause Kick One.wav"));
    expect(screen.getByText("Kick One.wav", { selector: "p" })).toBeInTheDocument();
    const barToggleButton = () => screen.getByRole("button", { name: /^(Play|Pause)$/ });
    expect(barToggleButton()).toHaveAccessibleName("Pause");

    // 2. Second click of the SAME row's button: pauses (row flips back to Play, bar flips
    // back to Play) but the bar stays mounted and still shows the same file — it did not
    // close/unmount/restart.
    await user.click(rowPlayButton());

    await waitFor(() => expect(rowPlayButton()).toHaveAccessibleName("Play Kick One.wav"));
    expect(barToggleButton()).toHaveAccessibleName("Play");
    expect(screen.getByText("Kick One.wav", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Drums/Kick One.wav")).toBeInTheDocument();

    // 3. A third click resumes playback (toggles back to Pause), confirming this is a genuine
    // toggle rather than a one-way state change.
    await user.click(rowPlayButton());

    await waitFor(() => expect(rowPlayButton()).toHaveAccessibleName("Pause Kick One.wav"));
    expect(barToggleButton()).toHaveAccessibleName("Pause");
  });
});
