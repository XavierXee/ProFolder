import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectDetailPanel from "../ProjectDetailPanel.js";
import type { Project } from "../../types.js";
import type { FolderNode, NestedDawProjectFile, ProjectDetail, ProjectDuplicatesResult, StatusDef } from "../../api/client.js";
import { STATUS_BADGE, STATUS_PILL, STATUS_PILL_UNSELECTED } from "../../statusStyles.js";
import { statusPillStyle } from "../../statusColor.js";
import { StatusCatalogProvider } from "../../contexts/StatusCatalogContext.js";

vi.mock("../../api/client.js", () => ({
  getProjectDetail: vi.fn(),
  getProjectDuplicates: vi.fn(),
  getStatuses: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetProjectDetail = vi.mocked(api.getProjectDetail);
const mockGetProjectDuplicates = vi.mocked(api.getProjectDuplicates);
const mockGetStatuses = vi.mocked(api.getStatuses);

// Matches the pre-catalog fixed 5-status list (unknown + these 4), so the existing
// Draft/Done/Released-picking tests keep the same meaning as before Task 4.
const CATALOG_STATUSES: StatusDef[] = [
  { key: "draft", name: "Draft", color: "#a1b2c3", sortOrder: 1, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "needs_mixing", name: "Need Mixing", color: "#b2c3a1", sortOrder: 2, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "done", name: "Done", color: "#c3a1b2", sortOrder: 3, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "released", name: "Released", color: "#a1c3b2", sortOrder: 4, createdAt: "2024-01-01T00:00:00.000Z" },
];

/** jsdom's CSSOM normalizes a plain-hex literal assigned to `borderColor` to its `rgb()`
 * equivalent — see FileDetailPanel.test.tsx's identical helper/note for the empirical basis. */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Wraps ProjectDetailPanel with a StatusCatalogProvider carrying the CATALOG_STATUSES fixture,
 * so both the initial `renderPanel()` mount and any raw `rerender(...)` calls a test performs
 * preserve the same resolved catalog (rerendering the same Provider element/position doesn't
 * remount it or re-trigger its mount-only fetch effect). */
function withCatalog(children: ReactNode) {
  return <StatusCatalogProvider>{children}</StatusCatalogProvider>;
}

type ProjectRow = Project & { audioFileCount: number };

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "p1",
    name: "My Song",
    path: "/music/My Song",
    hasVideo: false,
    hasImage: false,
    status: "draft",
    tags: ["rock"],
    score: 3,
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
    tags: ["rock"],
    score: 3,
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

function makeDawFile(overrides: Partial<NestedDawProjectFile> = {}): NestedDawProjectFile {
  return {
    dawType: "ableton",
    path: "/music/My Song/sub/song.als",
    relativePath: "sub/song.als",
    detectedVia: ".als file",
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof ProjectDetailPanel>[0]> = {}) {
  const props = {
    project: makeProject(),
    allTags: [] as string[],
    onClose: () => {},
    onReveal: () => {},
    onSaveStatus: vi.fn().mockResolvedValue(undefined),
    onSaveTags: vi.fn().mockResolvedValue(undefined),
    onSaveScore: vi.fn().mockResolvedValue(undefined),
    onProjectOperation: vi.fn(),
    ...overrides,
  };
  return { ...render(withCatalog(<ProjectDetailPanel {...props} />)), props };
}

beforeEach(() => {
  mockGetProjectDetail.mockReset().mockResolvedValue(makeDetail());
  mockGetProjectDuplicates.mockReset().mockResolvedValue(makeDuplicatesResult());
  mockGetStatuses.mockReset().mockResolvedValue(CATALOG_STATUSES);
});

describe("ProjectDetailPanel - basic rendering", () => {
  it("renders the folder name, path, audio file count, and calls the api with the project id", async () => {
    renderPanel({ project: makeProject({ id: "p1", name: "My Song", path: "/music/My Song", audioFileCount: 4 }) });

    expect(screen.getByRole("dialog", { name: "Folder detail: My Song" })).toBeInTheDocument();
    expect(screen.getByText("/music/My Song")).toBeInTheDocument();
    expect(screen.getByText("4 audio files")).toBeInTheDocument();

    await waitFor(() => expect(mockGetProjectDetail).toHaveBeenCalledWith("p1"));
    expect(mockGetProjectDuplicates).toHaveBeenCalledWith("p1");
  });

  it("shows 'Folder' as the type label with no 'Detected via' line when there is no dawType", () => {
    renderPanel({ project: makeProject({ dawType: undefined }) });

    // "Folder" also appears as the header's static section label (a <p>); the
    // type-label badge is the <span> rendering.
    expect(screen.getByText("Folder", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText(/Detected via/)).not.toBeInTheDocument();
  });

  it("shows the DAW label and a 'Detected via' line when dawType is set", () => {
    renderPanel({ project: makeProject({ dawType: "ableton", detectedVia: ".als file" }) });

    expect(screen.getByText("Ableton")).toBeInTheDocument();
    expect(screen.getByText("Detected via .als file")).toBeInTheDocument();
  });

  it("falls back to 'unknown marker' when dawType is set but detectedVia is unset", () => {
    renderPanel({ project: makeProject({ dawType: "logic", detectedVia: undefined }) });

    expect(screen.getByText("Detected via unknown marker")).toBeInTheDocument();
  });

  it("calls onReveal with the project path when 'Reveal in Finder' is clicked", async () => {
    const onReveal = vi.fn();
    const user = userEvent.setup();
    renderPanel({ project: makeProject({ path: "/music/My Song" }), onReveal });

    await user.click(screen.getByRole("button", { name: "Reveal in Finder" }));

    expect(onReveal).toHaveBeenCalledWith("/music/My Song");
  });
});

describe("ProjectDetailPanel - Copy/Move/Delete buttons", () => {
  it("calls onProjectOperation with 'copy' and the project when the Copy button is clicked", async () => {
    const onProjectOperation = vi.fn();
    const user = userEvent.setup();
    const project = makeProject({ id: "p1", name: "My Song", path: "/music/My Song" });
    renderPanel({ project, onProjectOperation });

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(onProjectOperation).toHaveBeenCalledTimes(1);
    expect(onProjectOperation).toHaveBeenCalledWith("copy", project);
  });

  it("calls onProjectOperation with 'move' and the project (including its own path, for the caller to exclude in the destination picker) when the Move button is clicked", async () => {
    const onProjectOperation = vi.fn();
    const user = userEvent.setup();
    const project = makeProject({ id: "p1", name: "My Song", path: "/music/My Song" });
    renderPanel({ project, onProjectOperation });

    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(onProjectOperation).toHaveBeenCalledTimes(1);
    expect(onProjectOperation).toHaveBeenCalledWith("move", project);
    expect(onProjectOperation.mock.calls[0][1].path).toBe("/music/My Song");
  });

  it("calls onProjectOperation with 'delete' and the project when the Delete button is clicked", async () => {
    const onProjectOperation = vi.fn();
    const user = userEvent.setup();
    const project = makeProject({ id: "p1", name: "My Song" });
    renderPanel({ project, onProjectOperation });

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onProjectOperation).toHaveBeenCalledTimes(1);
    expect(onProjectOperation).toHaveBeenCalledWith("delete", project);
  });
});

describe("ProjectDetailPanel - Escape to close", () => {
  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectDetailPanel - contents loading/error state", () => {
  it("shows a loading message while getProjectDetail is pending, then 'Empty folder.' once it resolves with no children", async () => {
    let resolveDetail!: (detail: ProjectDetail) => void;
    mockGetProjectDetail.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve;
      })
    );
    renderPanel();

    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveDetail(makeDetail({ subfolderTree: emptyTree }));

    await waitFor(() => expect(screen.getByText("Empty folder.")).toBeInTheDocument());
  });

  it("shows the error message when getProjectDetail rejects", async () => {
    mockGetProjectDetail.mockReset().mockRejectedValue(new Error("network down"));
    renderPanel();

    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
  });

  it("falls back to a generic error message when the rejection is not an Error instance", async () => {
    mockGetProjectDetail.mockReset().mockRejectedValue("nope");
    renderPanel();

    await waitFor(() => expect(screen.getByText("Failed to load folder details")).toBeInTheDocument());
  });
});

describe("ProjectDetailPanel - duplicates banner", () => {
  it("is hidden when there are no duplicate matches", async () => {
    renderPanel();

    await waitFor(() => expect(mockGetProjectDuplicates).toHaveBeenCalled());
    expect(screen.queryByText(/Possible duplicate/)).not.toBeInTheDocument();
  });

  it("shows singular 'folder' wording and rounds the match percentage for a single match", async () => {
    mockGetProjectDuplicates.mockReset().mockResolvedValue(
      makeDuplicatesResult({
        matches: [
          {
            projectId: "p2",
            projectName: "Other Song",
            projectPath: "/music/Other Song",
            matchingSampleCount: 2,
            sampleCount: 3,
            matchRatio: 0.6666,
            matchReasons: ["sampleOverlap"],
          },
        ],
      })
    );
    renderPanel();

    expect(await screen.findByText("Possible duplicate of 1 other folder")).toBeInTheDocument();
    expect(screen.getByText("2 matching samples (67% overlap)")).toBeInTheDocument();
    expect(screen.getByText("Other Song")).toBeInTheDocument();
  });

  it("shows plural 'folders' wording and singular 'sample' text for a 1-sample match, for multiple matches", async () => {
    mockGetProjectDuplicates.mockReset().mockResolvedValue(
      makeDuplicatesResult({
        matches: [
          {
            projectId: "p2",
            projectName: "Other Song",
            projectPath: "/music/Other Song",
            matchingSampleCount: 1,
            sampleCount: 1,
            matchRatio: 1,
            matchReasons: ["sampleOverlap"],
          },
          {
            projectId: "p3",
            projectName: "Third Song",
            projectPath: "/music/Third Song",
            matchingSampleCount: 4,
            sampleCount: 4,
            matchRatio: 1,
            matchReasons: ["sampleOverlap"],
          },
        ],
      })
    );
    renderPanel();

    expect(await screen.findByText("Possible duplicate of 2 other folders")).toBeInTheDocument();
    expect(screen.getByText("1 matching sample (100% overlap)")).toBeInTheDocument();
  });

  it("renders the match's projectPath as visible text and as the row's title attribute", async () => {
    mockGetProjectDuplicates.mockReset().mockResolvedValue(
      makeDuplicatesResult({
        matches: [
          {
            projectId: "p2",
            projectName: "Other Song",
            projectPath: "/music/Other Song",
            matchingSampleCount: 2,
            sampleCount: 3,
            matchRatio: 0.6666,
            matchReasons: ["sampleOverlap"],
          },
        ],
      })
    );
    renderPanel();

    const pathEl = await screen.findByText("/music/Other Song");
    expect(pathEl).toHaveAttribute("title", "/music/Other Song");
  });

  it("clears the banner when the project prop switches to a different project with no duplicate matches", async () => {
    mockGetProjectDuplicates
      .mockReset()
      .mockResolvedValueOnce(
        makeDuplicatesResult({
          matches: [
            {
              projectId: "p2",
              projectName: "Other Song",
              projectPath: "/music/Other Song",
              matchingSampleCount: 2,
              sampleCount: 3,
              matchRatio: 0.6666,
              matchReasons: ["sampleOverlap"],
            },
          ],
        })
      )
      .mockResolvedValueOnce(makeDuplicatesResult({ projectId: "p3", matches: [] }));

    const projectA = makeProject({ id: "p1" });
    const projectB = makeProject({ id: "p3", name: "Third Song" });
    const { rerender } = renderPanel({ project: projectA });

    expect(await screen.findByText(/Possible duplicate/)).toBeInTheDocument();

    rerender(
      withCatalog(
        <ProjectDetailPanel
          project={projectB}
          allTags={[]}
          onClose={() => {}}
          onReveal={() => {}}
          onSaveStatus={vi.fn().mockResolvedValue(undefined)}
          onSaveTags={vi.fn().mockResolvedValue(undefined)}
          onSaveScore={vi.fn().mockResolvedValue(undefined)}
          onProjectOperation={vi.fn()}
        />
      )
    );

    // The banner clears immediately on the id-change effect run, before the
    // new (empty) getProjectDuplicates call even resolves.
    expect(screen.queryByText(/Possible duplicate/)).not.toBeInTheDocument();

    await waitFor(() => expect(mockGetProjectDuplicates).toHaveBeenCalledWith("p3"));
    expect(screen.queryByText(/Possible duplicate/)).not.toBeInTheDocument();
  });

  it("shows the 'Same name' badge on a match whose matchReasons includes sameName", async () => {
    mockGetProjectDuplicates.mockReset().mockResolvedValue(
      makeDuplicatesResult({
        matches: [
          {
            projectId: "p2",
            projectName: "My Song",
            projectPath: "/music/My Song (copy)",
            matchingSampleCount: 0,
            sampleCount: 0,
            matchRatio: 0,
            matchReasons: ["sameName"],
          },
        ],
      })
    );
    renderPanel();

    expect(await screen.findByText("Same name")).toBeInTheDocument();
  });

  it("does not show the 'Same name' badge on a match whose matchReasons is exactly ['sampleOverlap']", async () => {
    mockGetProjectDuplicates.mockReset().mockResolvedValue(
      makeDuplicatesResult({
        matches: [
          {
            projectId: "p2",
            projectName: "Other Song",
            projectPath: "/music/Other Song",
            matchingSampleCount: 2,
            sampleCount: 3,
            matchRatio: 0.6666,
            matchReasons: ["sampleOverlap"],
          },
        ],
      })
    );
    renderPanel();

    await screen.findByText("Other Song");
    expect(screen.queryByText("Same name")).not.toBeInTheDocument();
  });

  it("renders both the 'Same name' badge and the existing overlap/name/path content when matchReasons contains both reasons", async () => {
    mockGetProjectDuplicates.mockReset().mockResolvedValue(
      makeDuplicatesResult({
        matches: [
          {
            projectId: "p2",
            projectName: "My Song (Duplicate)",
            projectPath: "/music/My Song (Duplicate)",
            matchingSampleCount: 2,
            sampleCount: 3,
            matchRatio: 0.6666,
            matchReasons: ["sameName", "sampleOverlap"],
          },
        ],
      })
    );
    renderPanel();

    expect(await screen.findByText("Same name")).toBeInTheDocument();
    expect(screen.getByText("2 matching samples (67% overlap)")).toBeInTheDocument();
    expect(screen.getByText("My Song (Duplicate)")).toBeInTheDocument();
    expect(screen.getByText("/music/My Song (Duplicate)")).toBeInTheDocument();
  });

  it("shows no banner, does not crash, and still renders the rest of the panel when getProjectDuplicates rejects", async () => {
    mockGetProjectDuplicates.mockReset().mockRejectedValue(new Error("network down"));
    renderPanel({ project: makeProject({ id: "p1", name: "My Song", path: "/music/My Song" }) });

    await waitFor(() => expect(mockGetProjectDuplicates).toHaveBeenCalledWith("p1"));
    expect(screen.queryByText(/Possible duplicate/)).not.toBeInTheDocument();

    expect(screen.getByRole("dialog", { name: "Folder detail: My Song" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Empty folder.")).toBeInTheDocument());
  });
});

describe("ProjectDetailPanel - DAW project files list", () => {
  it("does not show the DAW project files section when there are 0 or 1 nested DAW files", async () => {
    mockGetProjectDetail.mockReset().mockResolvedValue(makeDetail({ dawProjectFiles: [makeDawFile()] }));
    renderPanel();

    await waitFor(() => expect(mockGetProjectDetail).toHaveBeenCalled());
    expect(screen.queryByText(/DAW Project Files/)).not.toBeInTheDocument();
  });

  it("shows the DAW project files section, with count and each file's relative path/DAW label, when there is more than 1", async () => {
    mockGetProjectDetail.mockReset().mockResolvedValue(
      makeDetail({
        dawProjectFiles: [
          makeDawFile({ path: "/music/My Song/a/song.als", relativePath: "a/song.als", dawType: "ableton" }),
          makeDawFile({ path: "/music/My Song/b/song.logicx", relativePath: "b/song.logicx", dawType: "logic" }),
        ],
      })
    );
    renderPanel();

    expect(await screen.findByText("DAW Project Files (2)")).toBeInTheDocument();
    expect(screen.getByText("a/song.als")).toBeInTheDocument();
    expect(screen.getByText("b/song.logicx")).toBeInTheDocument();
  });
});

describe("ProjectDetailPanel - status optimistic update", () => {
  it("shows the new status immediately and keeps it once the save resolves", async () => {
    const onSaveStatus = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel({ project: makeProject({ id: "p1", status: "draft" }), onSaveStatus });

    // Status buttons only appear once the catalog fetch resolves, so this is a `findByRole`
    // (not `getByRole`) since it's the first status-picker lookup after mount.
    const doneBtn = await screen.findByRole("button", { name: "Done" });
    await user.click(doneBtn);

    expect(onSaveStatus).toHaveBeenCalledWith("p1", "done");
    await waitFor(() => expect(doneBtn).toHaveAttribute("aria-pressed", "true"));
  });

  it("rolls back to the previous status when the save rejects", async () => {
    const onSaveStatus = vi.fn().mockRejectedValue(new Error("save failed"));
    const user = userEvent.setup();
    renderPanel({ project: makeProject({ id: "p1", status: "draft" }), onSaveStatus });

    const draftBtn = await screen.findByRole("button", { name: "Draft" });
    const doneBtn = screen.getByRole("button", { name: "Done" });
    await user.click(doneBtn);

    expect(onSaveStatus).toHaveBeenCalledWith("p1", "done");
    await waitFor(() => expect(draftBtn).toHaveAttribute("aria-pressed", "true"));
    expect(doneBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("does not call onSaveStatus when clicking the already-selected status (no-op guard)", async () => {
    const onSaveStatus = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel({ project: makeProject({ status: "draft" }), onSaveStatus });

    const draftBtn = await screen.findByRole("button", { name: "Draft" });
    await user.click(draftBtn);

    expect(onSaveStatus).not.toHaveBeenCalled();
  });

  it("renders a custom (non-default) catalog status as a selectable pill, using its own color via statusPillStyle when selected", async () => {
    mockGetStatuses.mockReset().mockResolvedValue([
      ...CATALOG_STATUSES,
      { key: "mastering", name: "Mastering", color: "#123456", sortOrder: 5, createdAt: "2024-01-01T00:00:00.000Z" },
    ]);
    const onSaveStatus = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel({ project: makeProject({ id: "p1", status: "draft" }), onSaveStatus });

    const masteringBtn = await screen.findByRole("button", { name: "Mastering" });
    await user.click(masteringBtn);

    expect(onSaveStatus).toHaveBeenCalledWith("p1", "mastering");
    await waitFor(() => expect(masteringBtn).toHaveAttribute("aria-pressed", "true"));
    expect(masteringBtn.style.borderColor).toBe(`color-mix(in oklch, ${hexToRgb("#123456")} 40%, transparent)`);
  });
});

describe("ProjectDetailPanel - tags optimistic update", () => {
  it("shows the new tag immediately and keeps it once the save resolves", async () => {
    const onSaveTags = vi.fn().mockResolvedValue(undefined);
    // delay: null avoids userEvent's real (macrotask-based) inter-keystroke
    // delay, so the whole "jazz{Enter}" sequence commits within one
    // synchronous/microtask turn instead of racing ProjectDetailPanel's
    // real 50ms setTimeout that auto-focuses the close button on mount.
    const user = userEvent.setup({ delay: null });
    renderPanel({ project: makeProject({ id: "p1", tags: ["rock"] }), onSaveTags });

    const input = screen.getByRole("combobox");
    await user.type(input, "jazz{Enter}");

    expect(onSaveTags).toHaveBeenCalledWith("p1", ["rock", "jazz"]);
    await waitFor(() => expect(screen.getByText("jazz")).toBeInTheDocument());
  });

  it("rolls back to the previous tags when the save rejects", async () => {
    const onSaveTags = vi.fn().mockRejectedValue(new Error("save failed"));
    const user = userEvent.setup({ delay: null });
    renderPanel({ project: makeProject({ id: "p1", tags: ["rock"] }), onSaveTags });

    const input = screen.getByRole("combobox");
    await user.type(input, "jazz{Enter}");

    expect(onSaveTags).toHaveBeenCalledWith("p1", ["rock", "jazz"]);
    await waitFor(() => expect(screen.queryByText("jazz")).not.toBeInTheDocument());
    expect(screen.getByText("rock")).toBeInTheDocument();
  });
});

describe("ProjectDetailPanel - score optimistic update", () => {
  it("shows the new score immediately and keeps it once the save resolves", async () => {
    const onSaveScore = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel({ project: makeProject({ id: "p1", score: 3 }), onSaveScore });

    const fiveDot = screen.getByRole("radio", { name: "5 of 5" });
    await user.click(fiveDot);

    expect(onSaveScore).toHaveBeenCalledWith("p1", 5);
    await waitFor(() => expect(fiveDot).toHaveAttribute("aria-checked", "true"));
  });

  it("rolls back to the previous score when the save rejects", async () => {
    const onSaveScore = vi.fn().mockRejectedValue(new Error("save failed"));
    const user = userEvent.setup();
    renderPanel({ project: makeProject({ id: "p1", score: 3 }), onSaveScore });

    const threeDot = screen.getByRole("radio", { name: "3 of 5" });
    const fiveDot = screen.getByRole("radio", { name: "5 of 5" });
    await user.click(fiveDot);

    expect(onSaveScore).toHaveBeenCalledWith("p1", 5);
    await waitFor(() => expect(threeDot).toHaveAttribute("aria-checked", "true"));
    expect(fiveDot).toHaveAttribute("aria-checked", "false");
  });
});

describe("ProjectDetailPanel - re-sync on project id change", () => {
  it("resets local edited state to the new project's values, discarding an unresolved edit on the previous project", async () => {
    // onSaveStatus never resolves, so the optimistic edit on project A stays "pending"
    // until the project prop swaps to a different id.
    const onSaveStatus = vi.fn().mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const projectA = makeProject({ id: "p1", status: "draft" });
    const projectB = makeProject({ id: "p2", status: "released", tags: ["ambient"], score: 1 });
    const { rerender } = renderPanel({ project: projectA, onSaveStatus });

    const doneBtn = await screen.findByRole("button", { name: "Done" });
    await user.click(doneBtn);
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");

    // Re-wrapping with the same StatusCatalogProvider element (same position in the tree)
    // preserves its already-resolved catalog state instead of remounting/refetching, so the
    // status buttons below are available synchronously.
    rerender(
      withCatalog(
        <ProjectDetailPanel
          project={projectB}
          allTags={[]}
          onClose={() => {}}
          onReveal={() => {}}
          onSaveStatus={onSaveStatus}
          onSaveTags={vi.fn().mockResolvedValue(undefined)}
          onSaveScore={vi.fn().mockResolvedValue(undefined)}
          onProjectOperation={vi.fn()}
        />
      )
    );

    expect(screen.getByRole("button", { name: "Released" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("ambient")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "1 of 5" })).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(mockGetProjectDetail).toHaveBeenCalledWith("p2"));
  });
});

describe("ProjectDetailPanel - backdrop click dismiss", () => {
  it("calls onClose exactly once when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = renderPanel({ onClose });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectDetailPanel - auto-focus on open", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves focus to the close button 50ms after opening", () => {
    renderPanel();

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
  });
});

describe("ProjectDetailPanel - folder content tree", () => {
  // Tree shape (depths as counted by ReadOnlyFolderTreeNode, where the
  // subfolderTree's own root is never rendered and its direct children
  // start at depth 0):
  //   Samples (folder, depth 0)         -> depth < 1 => auto-expanded
  //     OneShots (folder, depth 1)      -> depth < 1 is false => collapsed by default
  //       kick.wav (file, depth 2)      -> only visible once OneShots is expanded
  //   song.als (file, depth 0)
  // This genuinely exercises the collapsed-by-default branch because OneShots
  // sits one level below the auto-expanded depth-0 folder, not at depth 0 itself.
  const kickWav: FolderNode = {
    name: "kick.wav",
    path: "/music/My Song/Samples/OneShots/kick.wav",
    type: "file",
    children: [],
  };
  const oneShots: FolderNode = {
    name: "OneShots",
    path: "/music/My Song/Samples/OneShots",
    type: "folder",
    children: [kickWav],
  };
  const samples: FolderNode = {
    name: "Samples",
    path: "/music/My Song/Samples",
    type: "folder",
    children: [oneShots],
  };
  const songAls: FolderNode = {
    name: "song.als",
    path: "/music/My Song/song.als",
    type: "file",
    children: [],
  };
  const tree: FolderNode = {
    name: "root",
    path: "/music/My Song",
    type: "folder",
    children: [samples, songAls],
  };

  it("renders both depth-0 nodes and the auto-expanded folder's own children", async () => {
    mockGetProjectDetail.mockReset().mockResolvedValue(makeDetail({ subfolderTree: tree }));
    renderPanel();

    expect(await screen.findByText("Samples")).toBeInTheDocument();
    expect(screen.getByText("song.als")).toBeInTheDocument();
    // Samples starts expanded (depth 0), so its direct child OneShots is
    // immediately visible without any interaction.
    expect(screen.getByText("OneShots")).toBeInTheDocument();
  });

  it("keeps a depth-1 folder's children hidden until its toggle is clicked, then shows them", async () => {
    mockGetProjectDetail.mockReset().mockResolvedValue(makeDetail({ subfolderTree: tree }));
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("OneShots");
    expect(screen.queryByText("kick.wav")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand OneShots" }));

    expect(screen.getByText("kick.wav")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse OneShots" })).toBeInTheDocument();
  });

  it("shows 'Collapse <name>' on the already-auto-expanded top-level folder, and toggles its children off/on", async () => {
    mockGetProjectDetail.mockReset().mockResolvedValue(makeDetail({ subfolderTree: tree }));
    const user = userEvent.setup();
    renderPanel();

    const toggle = await screen.findByRole("button", { name: "Collapse Samples" });
    expect(screen.getByText("OneShots")).toBeInTheDocument();

    await user.click(toggle);

    expect(screen.queryByText("OneShots")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Samples" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Samples" }));

    expect(screen.getByText("OneShots")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Samples" })).toBeInTheDocument();
  });

  it("renders leaf file nodes with no expand/collapse toggle button", async () => {
    mockGetProjectDetail.mockReset().mockResolvedValue(makeDetail({ subfolderTree: tree }));
    renderPanel();

    await screen.findByText("song.als");

    expect(screen.queryByRole("button", { name: /Expand song\.als|Collapse song\.als/ })).not.toBeInTheDocument();
  });
});

describe("ProjectDetailPanel - saving indicator", () => {
  it("shows 'Saving…' while a status save is in flight", async () => {
    const onSaveStatus = vi.fn().mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderPanel({ project: makeProject({ status: "draft" }), onSaveStatus });

    const doneBtn = await screen.findByRole("button", { name: "Done" });
    await user.click(doneBtn);

    expect(await screen.findByText("Saving…")).toBeInTheDocument();
  });

  it("shows 'Saving…' while a score save is in flight", async () => {
    const onSaveScore = vi.fn().mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderPanel({ project: makeProject({ score: 3 }), onSaveScore });

    await user.click(screen.getByRole("radio", { name: "5 of 5" }));

    expect(await screen.findByText("Saving…")).toBeInTheDocument();
  });

  it("shows 'Saving…' while a tags save is in flight", async () => {
    const onSaveTags = vi.fn().mockReturnValue(new Promise(() => {}));
    // delay: null avoids userEvent's real inter-keystroke delay racing the
    // component's real 50ms auto-focus setTimeout.
    const user = userEvent.setup({ delay: null });
    renderPanel({ project: makeProject({ tags: ["rock"] }), onSaveTags });

    await user.type(screen.getByRole("combobox"), "jazz{Enter}");

    expect(await screen.findByText("Saving…")).toBeInTheDocument();
  });
});

// Token-class coverage: this panel is no longer isDark/isProFolder-driven (see App.tsx and
// index.css's [data-theme] blocks), so these tests assert the token classes themselves are
// present rather than any isDark-branch selection (removed from this file entirely).
describe("ProjectDetailPanel - token-driven classes", () => {
  it("applies a statusPillStyle-derived inline style to the selected (catalog) status button, and STATUS_PILL_UNSELECTED to the rest", async () => {
    renderPanel({ project: makeProject({ status: "draft" }) });

    const draftBtn = await screen.findByRole("button", { name: "Draft" });
    const doneBtn = screen.getByRole("button", { name: "Done" });

    const draftEntry = CATALOG_STATUSES.find((s) => s.key === "draft")!;
    const expectedStyle = statusPillStyle(draftEntry.color);
    // `color` (mixes in var(--color-ink)) and `boxShadow` (a shorthand) stay literal
    // color-mix() strings, but `borderColor` gets its embedded hex normalized to rgb() by
    // jsdom's CSSOM (verified empirically) — see the `hexToRgb` helper above.
    expect(draftBtn.style.color).toBe(expectedStyle.color);
    expect(draftBtn.style.borderColor).toBe(`color-mix(in oklch, ${hexToRgb(draftEntry.color)} 40%, transparent)`);
    expect(draftBtn.style.boxShadow).toBe(expectedStyle.boxShadow);
    // "unknown" is the only status still styled via the fixed STATUS_PILL Tailwind classes,
    // not statusPillStyle — a catalog status like "draft" must not use those classes.
    expect(draftBtn.className).not.toContain(STATUS_PILL.unknown.split(" ")[0]);

    for (const cls of STATUS_PILL_UNSELECTED.split(" ")) {
      expect(doneBtn.className).toContain(cls);
    }
  });

  it("keeps the 'unknown' status pill on the fixed STATUS_PILL.unknown classes (no inline style) when selected", async () => {
    renderPanel({ project: makeProject({ status: "unknown" }) });

    const unknownBtn = await screen.findByRole("button", { name: "Unknown" });

    for (const cls of STATUS_PILL.unknown.split(" ")) {
      expect(unknownBtn.className).toContain(cls);
    }
    expect(unknownBtn.style.borderColor).toBe("");
    expect(unknownBtn.style.boxShadow).toBe("");
  });

  it("applies the danger-token classes to the Delete button", () => {
    renderPanel();

    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    expect(deleteBtn.className).toContain("border-danger-border");
    expect(deleteBtn.className).toContain("text-danger");
    expect(deleteBtn.className).toContain("hover:bg-danger-surface");
  });

  it("applies the scrim token class to the backdrop", () => {
    const { container } = renderPanel();

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop?.className).toContain("bg-scrim");
  });

  it("applies the info-token classes to the type badge when dawType is set, and the STATUS_BADGE 'unknown' classes when it is not", () => {
    const { rerender, props } = renderPanel({ project: makeProject({ dawType: "ableton" }) });

    const badge = screen.getByText("Ableton", { selector: "span" });
    expect(badge.className).toContain("bg-info-surface");
    expect(badge.className).toContain("text-info");
    expect(badge.className).toContain("ring-info/30");

    rerender(<ProjectDetailPanel {...props} project={makeProject({ dawType: undefined })} />);

    const folderBadge = screen.getByText("Folder", { selector: "span" });
    for (const cls of STATUS_BADGE.unknown.split(" ")) {
      expect(folderBadge.className).toContain(cls);
    }
  });

  it("applies the warning-token classes to the duplicate-warning banner", async () => {
    mockGetProjectDuplicates.mockReset().mockResolvedValue(
      makeDuplicatesResult({
        matches: [
          {
            projectId: "p2",
            projectName: "Other Song",
            projectPath: "/music/Other Song",
            matchingSampleCount: 2,
            sampleCount: 3,
            matchRatio: 0.6666,
            matchReasons: ["sampleOverlap"],
          },
        ],
      })
    );
    renderPanel();

    const banner = (await screen.findByText(/Possible duplicate/)).closest("div");
    expect(banner?.className).toContain("bg-warning-surface");
    // Full-word check (not a substring check): "ring-warning-ring" is the real generated
    // Tailwind utility for the --color-warning-ring token (the utility name is "ring-" +
    // the full registered color name "warning-ring", not just "warning") — a plain
    // `toContain("ring-warning")` substring check would pass even against the wrong class
    // "ring-warning" (no token registered under that shorter name, so it silently renders
    // no ring at all), which is exactly the bug this test caught during development via a
    // compiled-CSS spot-check, not via this assertion as originally written.
    expect(banner?.className.split(" ")).toContain("ring-warning-ring");
    expect((await screen.findByText(/Possible duplicate/)).className).toContain("text-warning-ink");
  });
});
