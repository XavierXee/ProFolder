import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CopyMoveDeleteDialog, {
  buildExplanationText,
  resolveAbsoluteDestination,
  toRelativePath,
  type CopyMoveDeleteTarget,
} from "../CopyMoveDeleteDialog.js";
import type { ConfirmationSettings, FolderNode } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getFolderTree: vi.fn(),
  copyFile: vi.fn(),
  moveFile: vi.fn(),
  deleteFile: vi.fn(),
  batchCopyFiles: vi.fn(),
  batchMoveFiles: vi.fn(),
  batchDeleteFiles: vi.fn(),
  copyProject: vi.fn(),
  moveProject: vi.fn(),
  deleteProject: vi.fn(),
  batchCopyProjects: vi.fn(),
  batchMoveProjects: vi.fn(),
  batchDeleteProjects: vi.fn(),
  getConfirmationSettings: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetFolderTree = vi.mocked(api.getFolderTree);
const mockCopyFile = vi.mocked(api.copyFile);
const mockMoveFile = vi.mocked(api.moveFile);
const mockDeleteFile = vi.mocked(api.deleteFile);
const mockBatchCopyFiles = vi.mocked(api.batchCopyFiles);
const mockBatchMoveFiles = vi.mocked(api.batchMoveFiles);
const mockBatchDeleteFiles = vi.mocked(api.batchDeleteFiles);
const mockCopyProject = vi.mocked(api.copyProject);
const mockMoveProject = vi.mocked(api.moveProject);
const mockDeleteProject = vi.mocked(api.deleteProject);
const mockBatchCopyProjects = vi.mocked(api.batchCopyProjects);
const mockBatchMoveProjects = vi.mocked(api.batchMoveProjects);
const mockBatchDeleteProjects = vi.mocked(api.batchDeleteProjects);
const mockGetConfirmationSettings = vi.mocked(api.getConfirmationSettings);

function makeConfirmationSettings(overrides: Partial<ConfirmationSettings> = {}): ConfirmationSettings {
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

// Two-level fixture matching `buildFolderTree`'s REAL root-relative shape (see
// src/scanner/folderTree.ts): the root's own path is "", and every other node's path is a
// "/"-joined path relative to that root — never an absolute filesystem path. The mock music
// root below ("/music") is what the dialog joins these relative paths onto before calling the
// API, exactly like the real backend/frontend boundary.
const subNode: FolderNode = { name: "Sub", path: "Artist/Sub", type: "folder", children: [] };
const artistNode: FolderNode = { name: "Artist", path: "Artist", type: "folder", children: [subNode] };
const otherNode: FolderNode = { name: "Other", path: "Other", type: "folder", children: [] };
const tree: FolderNode = { name: "music", path: "", type: "folder", children: [artistNode, otherNode] };

function renderDialog(overrides: Partial<Parameters<typeof CopyMoveDeleteDialog>[0]> = {}) {
  const props = {
    open: true,
    operation: "copy" as const,
    itemType: "files" as const,
    target: { kind: "single", id: "file-1", name: "track.mp3" } as CopyMoveDeleteTarget,
    excludedPath: undefined,
    // The music root is an ABSOLUTE filesystem path (matching api.getConfig()'s musicRoot) —
    // distinct from the tree's own relative path convention above.
    musicRoot: "/music",
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  return { ...render(<CopyMoveDeleteDialog {...props} />), props };
}

async function selectDestination(user: ReturnType<typeof userEvent.setup>, name = "Artist") {
  await waitFor(() => expect(screen.getByRole("radio", { name })).toBeInTheDocument());
  await user.click(screen.getByRole("radio", { name }));
}

beforeEach(() => {
  mockGetFolderTree.mockReset().mockResolvedValue(tree);
  mockCopyFile.mockReset().mockResolvedValue({} as any);
  mockMoveFile.mockReset().mockResolvedValue({} as any);
  mockDeleteFile.mockReset().mockResolvedValue(undefined);
  mockBatchCopyFiles.mockReset().mockResolvedValue({ succeeded: ["file-1", "file-2"], failed: [] });
  mockBatchMoveFiles.mockReset().mockResolvedValue({ succeeded: ["file-1", "file-2"], failed: [] });
  mockBatchDeleteFiles.mockReset().mockResolvedValue({ succeeded: ["file-1", "file-2"], failed: [] });
  mockCopyProject.mockReset().mockResolvedValue({} as any);
  mockMoveProject.mockReset().mockResolvedValue({} as any);
  mockDeleteProject.mockReset().mockResolvedValue({} as any);
  mockBatchCopyProjects.mockReset().mockResolvedValue({ succeeded: ["p-1", "p-2"], failed: [] });
  mockBatchMoveProjects.mockReset().mockResolvedValue({ succeeded: ["p-1", "p-2"], failed: [] });
  mockBatchDeleteProjects.mockReset().mockResolvedValue({ succeeded: ["p-1", "p-2"], failed: [] });
  // Default: all confirmation settings off, matching this file's pre-existing tests, which
  // predate the double-text-confirmation feature and assert today's un-gated enablement.
  mockGetConfirmationSettings.mockReset().mockResolvedValue(makeConfirmationSettings());
});

describe("buildExplanationText", () => {
  const single: CopyMoveDeleteTarget = { kind: "single", id: "a", name: "track.mp3" };
  const batch: CopyMoveDeleteTarget = { kind: "batch", ids: ["a", "b", "c"], count: 3 };

  it("copy, single file, no destination chosen yet", () => {
    expect(buildExplanationText("copy", "files", single, null)).toBe("This file will be copied (duplicated) in the folder you choose below.");
  });

  it("copy, single file, with a selected destination", () => {
    expect(buildExplanationText("copy", "files", single, "/music/Artist")).toBe("This file will be copied (duplicated) in /music/Artist.");
  });

  it("copy, batch of files, plural wording", () => {
    expect(buildExplanationText("copy", "files", batch, "/music/Artist")).toBe("These 3 files will be copied (duplicated) in /music/Artist.");
  });

  it("move, single project, uses 'moved ... to' wording", () => {
    expect(buildExplanationText("move", "projects", single, "/music/Artist")).toBe("This project will be moved to /music/Artist.");
  });

  it("move, batch of projects, plural wording", () => {
    expect(buildExplanationText("move", "projects", batch, "/music/Artist")).toBe("These 3 projects will be moved to /music/Artist.");
  });

  it("delete, single file, states Trash (not permanent deletion), and ignores destination", () => {
    expect(buildExplanationText("delete", "files", single, "/music/Artist")).toBe("This file will be moved to the Trash.");
  });

  it("delete, batch of projects, plural wording, Trash phrasing", () => {
    expect(buildExplanationText("delete", "projects", batch, null)).toBe("These 3 projects will be moved to the Trash.");
  });
});

describe("resolveAbsoluteDestination", () => {
  it("joins a non-empty relative path onto the music root", () => {
    expect(resolveAbsoluteDestination("/music", "Artist")).toBe("/music/Artist");
    expect(resolveAbsoluteDestination("/music", "Artist/Sub")).toBe("/music/Artist/Sub");
  });

  it("resolves the tree root's own relative path (\"\") to the music root itself, not the music root plus a trailing slash", () => {
    expect(resolveAbsoluteDestination("/music", "")).toBe("/music");
  });

  it("does not double up a slash when the music root already ends with one", () => {
    expect(resolveAbsoluteDestination("/music/", "Artist")).toBe("/music/Artist");
  });
});

describe("toRelativePath", () => {
  it("strips the music root prefix from an absolute path inside it", () => {
    expect(toRelativePath("/music", "/music/Artist")).toBe("Artist");
    expect(toRelativePath("/music", "/music/Artist/Sub")).toBe("Artist/Sub");
  });

  it("resolves the music root itself to the empty string (the tree root's own path)", () => {
    expect(toRelativePath("/music", "/music")).toBe("");
  });

  it("does not double up a slash when the music root already ends with one", () => {
    expect(toRelativePath("/music/", "/music/Artist")).toBe("Artist");
  });

  it("falls back to returning the input unchanged if it isn't actually inside the music root (defensive only)", () => {
    expect(toRelativePath("/music", "/elsewhere/Artist")).toBe("/elsewhere/Artist");
  });
});

describe("CopyMoveDeleteDialog - rendering / explanatory text wiring", () => {
  it("renders the copy explanation for a single file and reflects it in the title", async () => {
    renderDialog({ operation: "copy", itemType: "files", target: { kind: "single", id: "f1", name: "kick.wav" } });

    expect(screen.getByRole("dialog", { name: 'Copy "kick.wav"' })).toBeInTheDocument();
    expect(screen.getByText("This file will be copied (duplicated) in the folder you choose below.")).toBeInTheDocument();
  });

  it("renders the move explanation for a batch of projects", async () => {
    renderDialog({ operation: "move", itemType: "projects", target: { kind: "batch", ids: ["p1", "p2"], count: 2 } });

    expect(screen.getByRole("dialog", { name: "Move 2 projects" })).toBeInTheDocument();
    expect(screen.getByText("These 2 projects will be moved to the folder you choose below.")).toBeInTheDocument();
  });

  it("renders the delete/Trash explanation and title, with no destination picker", async () => {
    renderDialog({ operation: "delete", itemType: "files", target: { kind: "single", id: "f1", name: "kick.wav" } });

    expect(screen.getByRole("dialog", { name: 'Move to Trash "kick.wav"' })).toBeInTheDocument();
    expect(screen.getByText("This file will be moved to the Trash.")).toBeInTheDocument();
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
  });

  it("renders nothing when open is false", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("CopyMoveDeleteDialog - Apply enablement", () => {
  it("Apply is disabled for copy until a destination is selected", async () => {
    const user = userEvent.setup();
    renderDialog({ operation: "copy" });

    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();

    await selectDestination(user);

    expect(screen.getByRole("button", { name: "Copy" })).not.toBeDisabled();
  });

  it("Apply is disabled for move until a destination is selected", async () => {
    const user = userEvent.setup();
    renderDialog({ operation: "move" });

    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();

    await selectDestination(user);

    expect(screen.getByRole("button", { name: "Move" })).not.toBeDisabled();
  });

  it("Apply (Move to Trash) is enabled for delete once settings load, with no destination step required", async () => {
    renderDialog({ operation: "delete" });

    // confirmDelete defaults to false in this file's mock, but settings load asynchronously —
    // wait for the fail-safe-required window to clear.
    await waitFor(() => expect(screen.getByRole("button", { name: "Move to Trash" })).not.toBeDisabled());
  });

  it("Apply (Move to Trash) stays disabled for an empty batch", () => {
    const emptyBatch: CopyMoveDeleteTarget = { kind: "batch", ids: [], count: 0 };
    renderDialog({ operation: "delete", target: emptyBatch });

    expect(screen.getByRole("button", { name: "Move to Trash" })).toBeDisabled();
  });

  it("Apply (Copy) stays disabled for an empty batch, even after a destination is selected", async () => {
    const user = userEvent.setup();
    const emptyBatch: CopyMoveDeleteTarget = { kind: "batch", ids: [], count: 0 };
    renderDialog({ operation: "copy", target: emptyBatch });

    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();

    await selectDestination(user);

    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
  });

  it("Apply (Move) stays disabled for an empty batch, even after a destination is selected", async () => {
    const user = userEvent.setup();
    const emptyBatch: CopyMoveDeleteTarget = { kind: "batch", ids: [], count: 0 };
    renderDialog({ operation: "move", target: emptyBatch });

    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();

    await selectDestination(user);

    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();
  });
});

describe("CopyMoveDeleteDialog - correct client function per operation/type/target", () => {
  it("copy + files + single calls copyFile with the destination", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderDialog({ operation: "copy", itemType: "files", target: { kind: "single", id: "f1", name: "a.wav" }, onSuccess });

    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(mockCopyFile).toHaveBeenCalledWith("f1", "/music/Artist"));
    expect(onSuccess).toHaveBeenCalledWith({ succeededCount: 1, failedCount: 0 });
  });

  it("move + files + batch calls batchMoveFiles with ids and destination", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderDialog({ operation: "move", itemType: "files", target: { kind: "batch", ids: ["f1", "f2"], count: 2 }, onSuccess });

    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => expect(mockBatchMoveFiles).toHaveBeenCalledWith(["f1", "f2"], "/music/Artist"));
    expect(onSuccess).toHaveBeenCalledWith({ succeededCount: 2, failedCount: 0 });
  });

  it("delete + files + single calls deleteFile", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderDialog({ operation: "delete", itemType: "files", target: { kind: "single", id: "f1", name: "a.wav" }, onSuccess });

    await waitFor(() => expect(screen.getByRole("button", { name: "Move to Trash" })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Move to Trash" }));

    await waitFor(() => expect(mockDeleteFile).toHaveBeenCalledWith("f1"));
    expect(onSuccess).toHaveBeenCalledWith({ succeededCount: 1, failedCount: 0 });
  });

  it("delete + files + batch calls batchDeleteFiles with ids", async () => {
    const user = userEvent.setup();
    renderDialog({ operation: "delete", itemType: "files", target: { kind: "batch", ids: ["f1", "f2"], count: 2 } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Move to Trash" })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Move to Trash" }));

    await waitFor(() => expect(mockBatchDeleteFiles).toHaveBeenCalledWith(["f1", "f2"]));
  });

  it("copy + projects + single calls copyProject with the destination", async () => {
    const user = userEvent.setup();
    renderDialog({ operation: "copy", itemType: "projects", target: { kind: "single", id: "p1", name: "Song Idea" } });

    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(mockCopyProject).toHaveBeenCalledWith("p1", "/music/Artist"));
  });

  it("copy + projects + batch calls batchCopyProjects with ids and destination", async () => {
    const user = userEvent.setup();
    renderDialog({ operation: "copy", itemType: "projects", target: { kind: "batch", ids: ["p1", "p2"], count: 2 } });

    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(mockBatchCopyProjects).toHaveBeenCalledWith(["p1", "p2"], "/music/Artist"));
  });

  it("move + projects + single calls moveProject with the destination", async () => {
    const user = userEvent.setup();
    renderDialog({ operation: "move", itemType: "projects", target: { kind: "single", id: "p1", name: "Song Idea" } });

    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => expect(mockMoveProject).toHaveBeenCalledWith("p1", "/music/Artist"));
  });

  it("move + projects + batch calls batchMoveProjects with ids and destination", async () => {
    const user = userEvent.setup();
    renderDialog({ operation: "move", itemType: "projects", target: { kind: "batch", ids: ["p1", "p2"], count: 2 } });

    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => expect(mockBatchMoveProjects).toHaveBeenCalledWith(["p1", "p2"], "/music/Artist"));
  });

  it("delete + projects + single calls deleteProject", async () => {
    const user = userEvent.setup();
    renderDialog({ operation: "delete", itemType: "projects", target: { kind: "single", id: "p1", name: "Song Idea" } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Move to Trash" })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Move to Trash" }));

    await waitFor(() => expect(mockDeleteProject).toHaveBeenCalledWith("p1"));
  });

  it("delete + projects + batch calls batchDeleteProjects with ids", async () => {
    const user = userEvent.setup();
    renderDialog({ operation: "delete", itemType: "projects", target: { kind: "batch", ids: ["p1", "p2"], count: 2 } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Move to Trash" })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Move to Trash" }));

    await waitFor(() => expect(mockBatchDeleteProjects).toHaveBeenCalledWith(["p1", "p2"]));
  });

  it("move + files + single calls moveFile, and the picker has nothing excluded for a file", async () => {
    const user = userEvent.setup();
    renderDialog({
      operation: "move",
      itemType: "files",
      target: { kind: "single", id: "f1", name: "a.wav" },
      excludedPath: "/music/Artist",
    });

    // Unlike the project case below, a file's own containing folder is not excluded —
    // it remains selectable.
    await waitFor(() => expect(screen.getByRole("radio", { name: "Artist" })).not.toBeDisabled());
    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => expect(mockMoveFile).toHaveBeenCalledWith("f1", "/music/Artist"));
  });

  it("selecting the tree's own root node (relative path \"\") resolves to the music root itself, not the music root plus a trailing slash", async () => {
    const user = userEvent.setup();
    renderDialog({ operation: "copy", itemType: "files", target: { kind: "single", id: "f1", name: "a.wav" } });

    await waitFor(() => expect(screen.getByRole("radio", { name: "music" })).toBeInTheDocument());
    await user.click(screen.getByRole("radio", { name: "music" }));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(mockCopyFile).toHaveBeenCalledWith("f1", "/music"));
  });

  it("surfaces an error via onError (without calling the API) if Apply is somehow clicked before musicRoot has loaded", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    renderDialog({
      operation: "copy",
      itemType: "files",
      target: { kind: "single", id: "f1", name: "a.wav" },
      musicRoot: undefined,
      onSuccess,
      onError,
    });

    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Music root not loaded yet"));
    expect(mockCopyFile).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("CopyMoveDeleteDialog - excludedPath forwarding", () => {
  it("forwards excludedPath to the picker for a single-project move, disabling that folder and its descendants", async () => {
    renderDialog({
      operation: "move",
      itemType: "projects",
      target: { kind: "single", id: "p1", name: "Song Idea" },
      excludedPath: "/music/Artist",
    });

    await waitFor(() => expect(screen.getByRole("radio", { name: "Artist" })).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "Artist" })).toBeDisabled();
  });

  it("does not forward excludedPath for a batch of projects", async () => {
    renderDialog({
      operation: "move",
      itemType: "projects",
      target: { kind: "batch", ids: ["p1", "p2"], count: 2 },
      excludedPath: "/music/Artist",
    });

    await waitFor(() => expect(screen.getByRole("radio", { name: "Artist" })).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "Artist" })).not.toBeDisabled();
  });

  it("does not forward excludedPath for a copy (only move needs it)", async () => {
    renderDialog({
      operation: "copy",
      itemType: "projects",
      target: { kind: "single", id: "p1", name: "Song Idea" },
      excludedPath: "/music/Artist",
    });

    await waitFor(() => expect(screen.getByRole("radio", { name: "Artist" })).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "Artist" })).not.toBeDisabled();
  });
});

describe("CopyMoveDeleteDialog - success / error callbacks", () => {
  it("calls onSuccess and onClose on a fully successful batch, without calling onError", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onClose = vi.fn();
    renderDialog({
      operation: "copy",
      itemType: "files",
      target: { kind: "batch", ids: ["f1", "f2"], count: 2 },
      onSuccess,
      onError,
      onClose,
    });

    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ succeededCount: 2, failedCount: 0 }));
    expect(onError).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("still calls onSuccess (with failedCount > 0) and closes on a partially-failed batch, matching best-effort batch semantics", async () => {
    mockBatchCopyFiles.mockResolvedValue({ succeeded: ["f1"], failed: [{ id: "f2", error: "disk full" }] });
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    renderDialog({
      operation: "copy",
      itemType: "files",
      target: { kind: "batch", ids: ["f1", "f2"], count: 2 },
      onSuccess,
      onClose,
    });

    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ succeededCount: 1, failedCount: 1 }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onError and keeps the dialog open (not onSuccess) when a single-item request rejects", async () => {
    mockCopyFile.mockRejectedValue(new Error("destination not writable"));
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onClose = vi.fn();
    renderDialog({
      operation: "copy",
      itemType: "files",
      target: { kind: "single", id: "f1", name: "a.wav" },
      onSuccess,
      onError,
      onClose,
    });

    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("destination not writable"));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("destination not writable")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("CopyMoveDeleteDialog - busy state prevents double submission", () => {
  it("disables Apply and shows a busy label while the request is in flight, and only calls the client function once", async () => {
    let resolveCopy!: (v: any) => void;
    mockCopyFile.mockReturnValue(
      new Promise((resolve) => {
        resolveCopy = resolve;
      })
    );
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ operation: "copy", itemType: "files", target: { kind: "single", id: "f1", name: "a.wav" }, onClose });

    await selectDestination(user);
    const applyButton = screen.getByRole("button", { name: "Copy" });
    await user.click(applyButton);

    const busyButton = screen.getByRole("button", { name: "Copying…" });
    expect(busyButton).toBeDisabled();

    // A second click attempt while busy must not fire a second request.
    await user.click(busyButton);
    expect(mockCopyFile).toHaveBeenCalledTimes(1);

    resolveCopy({});
    // onClose is the observable "operation completed" signal here — the component only
    // unmounts when its *parent* reacts to onClose by flipping the open prop, which this
    // isolated render harness doesn't do.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("Cancel and the close button are disabled while busy", async () => {
    let resolveCopy!: (v: any) => void;
    mockCopyFile.mockReturnValue(
      new Promise((resolve) => {
        resolveCopy = resolve;
      })
    );
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ operation: "copy", itemType: "files", target: { kind: "single", id: "f1", name: "a.wav" }, onClose });

    await selectDestination(user);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled();

    resolveCopy({});
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("CopyMoveDeleteDialog - dismissal", () => {
  it("calls onClose on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on backdrop click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = renderDialog({ onClose });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on close-button click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ onClose });

    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Cancel-button click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ onClose });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CopyMoveDeleteDialog - double confirmation gating", () => {
  it.each([
    ["copy", "confirmCopy", "COPY", "Copy"],
    ["move", "confirmMove", "MOVE", "Move"],
    ["delete", "confirmDelete", "DELETE", "Move to Trash"],
  ] as const)(
    "operation=%s: Apply stays disabled until the exact uppercase keyword is typed when %s is true",
    async (operation, settingField, keyword, buttonLabel) => {
      mockGetConfirmationSettings.mockReset().mockResolvedValue(makeConfirmationSettings({ [settingField]: true }));
      // delay: null — this dialog has its own real setTimeout(..., 50) mount-effect that
      // auto-focuses its close button 50ms after open; real-timer inter-keystroke
      // delays can straddle that window and drop characters typed here.
      const user = userEvent.setup({ delay: null });
      renderDialog({
        operation,
        itemType: "files",
        target: { kind: "single", id: "f1", name: "a.wav" },
      });

      const input = await screen.findByLabelText(`Type "${keyword}" to confirm`);
      if (operation !== "delete") {
        await selectDestination(user);
      }

      expect(screen.getByRole("button", { name: buttonLabel })).toBeDisabled();

      await user.type(input, keyword);

      expect(screen.getByRole("button", { name: buttonLabel })).not.toBeDisabled();
    }
  );

  it("keeps Apply disabled if the typed text doesn't exactly match the uppercase keyword (case-sensitive)", async () => {
    mockGetConfirmationSettings.mockReset().mockResolvedValue(makeConfirmationSettings({ confirmDelete: true }));
    const user = userEvent.setup({ delay: null });
    renderDialog({ operation: "delete", itemType: "files", target: { kind: "single", id: "f1", name: "a.wav" } });

    const input = await screen.findByLabelText('Type "DELETE" to confirm');
    await user.type(input, "delete");

    expect(screen.getByRole("button", { name: "Move to Trash" })).toBeDisabled();
  });

  it("renders no confirmation input, and Apply's enablement is governed only by the pre-existing conditions, when the setting is false", async () => {
    renderDialog({ operation: "copy", itemType: "files", target: { kind: "single", id: "f1", name: "a.wav" } });

    await waitFor(() => expect(mockGetConfirmationSettings).toHaveBeenCalled());
    expect(screen.queryByLabelText(/to confirm/)).not.toBeInTheDocument();
  });

  it("treats confirmation as required (renders the input) before settings have loaded yet, fail-safe", async () => {
    mockGetConfirmationSettings.mockReset().mockReturnValue(new Promise(() => {}));
    renderDialog({ operation: "delete", itemType: "files", target: { kind: "single", id: "f1", name: "a.wav" } });

    expect(await screen.findByLabelText('Type "DELETE" to confirm')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to Trash" })).toBeDisabled();
  });

  it("resets typed confirmation text on a fresh open (operation change while the dialog stays mounted)", async () => {
    mockGetConfirmationSettings.mockReset().mockResolvedValue(makeConfirmationSettings({ confirmCopy: true, confirmMove: true }));
    const user = userEvent.setup({ delay: null });
    const baseProps = {
      itemType: "files" as const,
      target: { kind: "single", id: "f1", name: "a.wav" } as CopyMoveDeleteTarget,
      musicRoot: "/music",
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
    };
    const { rerender } = render(<CopyMoveDeleteDialog open={true} operation="copy" {...baseProps} />);

    const copyInput = await screen.findByLabelText('Type "COPY" to confirm');
    await user.type(copyInput, "COPY");
    expect(copyInput).toHaveValue("COPY");

    // Close, then reopen the same mounted dialog instance for a different operation.
    rerender(<CopyMoveDeleteDialog open={false} operation="copy" {...baseProps} />);
    rerender(<CopyMoveDeleteDialog open={true} operation="move" {...baseProps} />);

    const moveInput = await screen.findByLabelText('Type "MOVE" to confirm');
    expect(moveInput).toHaveValue("");
    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();
  });
});
