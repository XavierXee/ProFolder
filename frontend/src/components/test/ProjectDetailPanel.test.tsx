import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectDetailPanel from "../ProjectDetailPanel.js";
import type { Project } from "../../types.js";
import type { FolderNode, NestedDawProjectFile, ProjectDetail, ProjectDuplicatesResult } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getProjectDetail: vi.fn(),
  getProjectDuplicates: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetProjectDetail = vi.mocked(api.getProjectDetail);
const mockGetProjectDuplicates = vi.mocked(api.getProjectDuplicates);

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
    isDark: true,
    allTags: [] as string[],
    onClose: () => {},
    onReveal: () => {},
    onSaveStatus: vi.fn().mockResolvedValue(undefined),
    onSaveTags: vi.fn().mockResolvedValue(undefined),
    onSaveScore: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { ...render(<ProjectDetailPanel {...props} />), props };
}

beforeEach(() => {
  mockGetProjectDetail.mockReset().mockResolvedValue(makeDetail());
  mockGetProjectDuplicates.mockReset().mockResolvedValue(makeDuplicatesResult());
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
          },
          {
            projectId: "p3",
            projectName: "Third Song",
            projectPath: "/music/Third Song",
            matchingSampleCount: 4,
            sampleCount: 4,
            matchRatio: 1,
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
      <ProjectDetailPanel
        project={projectB}
        isDark={true}
        allTags={[]}
        onClose={() => {}}
        onReveal={() => {}}
        onSaveStatus={vi.fn().mockResolvedValue(undefined)}
        onSaveTags={vi.fn().mockResolvedValue(undefined)}
        onSaveScore={vi.fn().mockResolvedValue(undefined)}
      />
    );

    // The banner clears immediately on the id-change effect run, before the
    // new (empty) getProjectDuplicates call even resolves.
    expect(screen.queryByText(/Possible duplicate/)).not.toBeInTheDocument();

    await waitFor(() => expect(mockGetProjectDuplicates).toHaveBeenCalledWith("p3"));
    expect(screen.queryByText(/Possible duplicate/)).not.toBeInTheDocument();
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

    const doneBtn = screen.getByRole("button", { name: "Done" });
    await user.click(doneBtn);

    expect(onSaveStatus).toHaveBeenCalledWith("p1", "done");
    await waitFor(() => expect(doneBtn).toHaveAttribute("aria-pressed", "true"));
  });

  it("rolls back to the previous status when the save rejects", async () => {
    const onSaveStatus = vi.fn().mockRejectedValue(new Error("save failed"));
    const user = userEvent.setup();
    renderPanel({ project: makeProject({ id: "p1", status: "draft" }), onSaveStatus });

    const draftBtn = screen.getByRole("button", { name: "Draft" });
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

    await user.click(screen.getByRole("button", { name: "Draft" }));

    expect(onSaveStatus).not.toHaveBeenCalled();
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

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");

    rerender(
      <ProjectDetailPanel
        project={projectB}
        isDark={true}
        allTags={[]}
        onClose={() => {}}
        onReveal={() => {}}
        onSaveStatus={onSaveStatus}
        onSaveTags={vi.fn().mockResolvedValue(undefined)}
        onSaveScore={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByRole("button", { name: "Released" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("ambient")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "1 of 5" })).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(mockGetProjectDetail).toHaveBeenCalledWith("p2"));
  });
});
