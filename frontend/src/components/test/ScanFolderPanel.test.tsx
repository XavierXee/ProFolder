import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScanFolderPanel, { FolderTreeNode, isDescendantOrSelf } from "../ScanFolderPanel.js";
import type { FolderNode, ScanStats } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getFolderTree: vi.fn(),
  getExclusions: vi.fn(),
  setExclusions: vi.fn(),
  triggerScan: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetFolderTree = vi.mocked(api.getFolderTree);
const mockGetExclusions = vi.mocked(api.getExclusions);
const mockSetExclusions = vi.mocked(api.setExclusions);
const mockTriggerScan = vi.mocked(api.triggerScan);

function makeScanStats(overrides: Partial<ScanStats> = {}): ScanStats {
  return {
    rootPath: "/music",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    foldersScanned: 3,
    audioFilesFound: 10,
    dawProjectsFound: 1,
    newFiles: 1,
    modifiedFiles: 0,
    removedFiles: 0,
    errors: [],
    ...overrides,
  };
}

// Three-level fixture: Grandparent > Parent > Child, plus a flat Sibling.
const childNode: FolderNode = { name: "Child", path: "/music/Grandparent/Parent/Child", type: "folder", children: [] };
const parentNode: FolderNode = { name: "Parent", path: "/music/Grandparent/Parent", type: "folder", children: [childNode] };
const grandparentNode: FolderNode = { name: "Grandparent", path: "/music/Grandparent", type: "folder", children: [parentNode] };
const siblingNode: FolderNode = { name: "Sibling", path: "/music/Sibling", type: "folder", children: [] };
const tree: FolderNode = { name: "root", path: "/music", type: "folder", children: [grandparentNode, siblingNode] };

function renderPanel(overrides: Partial<Parameters<typeof ScanFolderPanel>[0]> = {}) {
  const props = {
    open: true,
    isDark: true,
    musicRoot: "/music",
    onClose: () => {},
    onScanComplete: vi.fn(),
    ...overrides,
  };
  return { ...render(<ScanFolderPanel {...props} />), props };
}

beforeEach(() => {
  mockGetFolderTree.mockReset().mockResolvedValue(tree);
  mockGetExclusions.mockReset().mockResolvedValue({ excludedPaths: [] });
  mockSetExclusions.mockReset().mockResolvedValue({ excludedPaths: [] });
  mockTriggerScan.mockReset().mockResolvedValue(makeScanStats());
});

describe("isDescendantOrSelf", () => {
  it("returns true for the same path (self)", () => {
    expect(isDescendantOrSelf("/music/A", "/music/A")).toBe(true);
  });

  it("returns true for a direct child path", () => {
    expect(isDescendantOrSelf("/music/A/B", "/music/A")).toBe(true);
  });

  it("returns true for a multi-level-deep descendant path", () => {
    expect(isDescendantOrSelf("/music/A/B/C", "/music/A")).toBe(true);
  });

  it("returns false for an unrelated path", () => {
    expect(isDescendantOrSelf("/music/X", "/music/A")).toBe(false);
  });

  it("returns false for a sibling whose name merely shares a string prefix (no separator boundary)", () => {
    expect(isDescendantOrSelf("/music/AB", "/music/A")).toBe(false);
  });
});

describe("FolderTreeNode - direct rendering", () => {
  function renderNode(overrides: Partial<Parameters<typeof FolderTreeNode>[0]> = {}) {
    const onToggle = vi.fn();
    const props = {
      node: parentNode,
      excluded: new Set<string>(),
      onToggle,
      parentExcluded: false,
      isDark: true,
      depth: 0,
      ...overrides,
    };
    return { ...render(<FolderTreeNode {...props} />), onToggle };
  }

  it("renders a checked, enabled checkbox when the node is not excluded and has no excluded ancestor", () => {
    renderNode();

    const checkbox = screen.getByRole("checkbox", { name: "Parent" });
    expect(checkbox).toBeChecked();
    expect(checkbox).not.toBeDisabled();
  });

  it("renders an unchecked checkbox when the node itself is excluded", () => {
    renderNode({ excluded: new Set([parentNode.path]) });

    expect(screen.getByRole("checkbox", { name: "Parent" })).not.toBeChecked();
  });

  it("renders a disabled, unchecked checkbox when parentExcluded is true (ancestor already excluded)", () => {
    renderNode({ parentExcluded: true });

    const checkbox = screen.getByRole("checkbox", { name: "Parent" });
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
  });

  it("calls onToggle with the node's path and its current exclusion state when clicked", async () => {
    const user = userEvent.setup();
    const { onToggle } = renderNode({ excluded: new Set([parentNode.path]) });

    await user.click(screen.getByRole("checkbox", { name: "Parent" }));

    expect(onToggle).toHaveBeenCalledWith(parentNode.path, true);
  });

  it("expands by default at depth 0 and shows the child node", () => {
    renderNode({ node: grandparentNode, depth: 0 });

    expect(screen.getByRole("checkbox", { name: "Parent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Grandparent" })).toBeInTheDocument();
  });

  it("collapses by default at depth 1+ and hides descendants", () => {
    renderNode({ node: grandparentNode, depth: 1 });

    expect(screen.queryByRole("checkbox", { name: "Parent" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Grandparent" })).toBeInTheDocument();
  });

  it("toggles expand/collapse on click, hiding and re-showing descendants", async () => {
    const user = userEvent.setup();
    renderNode({ node: grandparentNode, depth: 0 });

    const toggle = screen.getByRole("button", { name: "Collapse Grandparent" });
    await user.click(toggle);

    expect(screen.queryByRole("checkbox", { name: "Parent" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Grandparent" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Grandparent" }));

    expect(screen.getByRole("checkbox", { name: "Parent" })).toBeInTheDocument();
  });

  it("renders no expand/collapse button for a leaf node", () => {
    renderNode({ node: childNode });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ScanFolderPanel - load-on-open", () => {
  it("shows a loading message, then the tree, calling both getFolderTree and getExclusions", async () => {
    let resolveTree!: (t: FolderNode) => void;
    mockGetFolderTree.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveTree = resolve;
      })
    );
    renderPanel();

    expect(screen.getByRole("dialog", { name: "Production folder scan settings" })).toBeInTheDocument();
    expect(screen.getByText("Loading folders…")).toBeInTheDocument();

    resolveTree(tree);

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Grandparent" })).toBeInTheDocument());
    expect(mockGetExclusions).toHaveBeenCalled();
  });

  it("shows the error message when getFolderTree rejects", async () => {
    mockGetFolderTree.mockReset().mockRejectedValue(new Error("disk unavailable"));
    renderPanel();

    await waitFor(() => expect(screen.getByText("disk unavailable")).toBeInTheDocument());
  });
});

describe("ScanFolderPanel - Escape to close", () => {
  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });

    await waitFor(() => expect(mockGetFolderTree).toHaveBeenCalled());
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ScanFolderPanel - toggleFolder descendant pruning", () => {
  it("removes multi-level-deep descendant exclusions (Parent AND Child) when the Grandparent is excluded", async () => {
    mockGetExclusions.mockResolvedValue({ excludedPaths: [parentNode.path, childNode.path] });
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("2 folders excluded")).toBeInTheDocument());

    const grandparentBox = screen.getByRole("checkbox", { name: "Grandparent" });
    expect(grandparentBox).toBeChecked();
    await user.click(grandparentBox);

    await waitFor(() => expect(screen.getByText("1 folder excluded")).toBeInTheDocument());
    await waitFor(() =>
      expect(mockSetExclusions).toHaveBeenLastCalledWith(
        expect.arrayContaining([grandparentNode.path])
      )
    );
    const lastCallArg = mockSetExclusions.mock.calls[mockSetExclusions.mock.calls.length - 1][0];
    expect(lastCallArg).toEqual([grandparentNode.path]);
  });

  it("adds a leaf exclusion without touching unrelated exclusions", async () => {
    mockGetExclusions.mockResolvedValue({ excludedPaths: [siblingNode.path] });
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("1 folder excluded")).toBeInTheDocument());

    const grandparentBox = screen.getByRole("checkbox", { name: "Grandparent" });
    await user.click(grandparentBox);

    await waitFor(() => expect(screen.getByText("2 folders excluded")).toBeInTheDocument());
    const lastCallArg = mockSetExclusions.mock.calls[mockSetExclusions.mock.calls.length - 1][0];
    expect(new Set(lastCallArg)).toEqual(new Set([siblingNode.path, grandparentNode.path]));
  });
});

describe("ScanFolderPanel - select all / unselect all", () => {
  it("handleSelectAll clears all exclusions", async () => {
    mockGetExclusions.mockResolvedValue({ excludedPaths: [grandparentNode.path, siblingNode.path] });
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByText("2 folders excluded")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Select All" }));

    await waitFor(() => expect(screen.getByText("All folders included")).toBeInTheDocument());
    expect(mockSetExclusions).toHaveBeenLastCalledWith([]);
  });

  it("'Select All' is disabled when nothing is excluded", async () => {
    renderPanel();

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Grandparent" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Select All" })).toBeDisabled();
  });

  it("handleUnselectAll excludes every top-level folder", async () => {
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Grandparent" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Unselect All" }));

    await waitFor(() => expect(screen.getByText("2 folders excluded")).toBeInTheDocument());
    const lastCallArg = mockSetExclusions.mock.calls[mockSetExclusions.mock.calls.length - 1][0];
    expect(new Set(lastCallArg)).toEqual(new Set([grandparentNode.path, siblingNode.path]));
  });

  it("'Unselect All' is disabled once every top-level folder is already excluded", async () => {
    mockGetExclusions.mockResolvedValue({ excludedPaths: [grandparentNode.path, siblingNode.path] });
    renderPanel();

    await waitFor(() => expect(screen.getByText("2 folders excluded")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Unselect All" })).toBeDisabled();
  });
});

describe("ScanFolderPanel - save state machine", () => {
  it("shows 'Saving…' then 'Saved' around a toggle's persist call", async () => {
    let resolveSave!: (r: { excludedPaths: string[] }) => void;
    mockSetExclusions.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    const user = userEvent.setup();
    renderPanel();

    const grandparentBox = await screen.findByRole("checkbox", { name: "Grandparent" });
    await user.click(grandparentBox);

    expect(screen.getByText("Saving…")).toBeInTheDocument();

    resolveSave({ excludedPaths: [grandparentNode.path] });

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("shows the failure message when persistExclusions rejects", async () => {
    mockSetExclusions.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderPanel();

    const grandparentBox = await screen.findByRole("checkbox", { name: "Grandparent" });
    await user.click(grandparentBox);

    await waitFor(() => expect(screen.getByText("Failed to save — will retry on next change")).toBeInTheDocument());
  });
});

describe("ScanFolderPanel - handleStartScan", () => {
  it("saves exclusions before triggering the scan, then reports stats and closes", async () => {
    const callOrder: string[] = [];
    mockSetExclusions.mockImplementation(async (paths) => {
      callOrder.push("setExclusions");
      return { excludedPaths: paths };
    });
    mockTriggerScan.mockImplementation(async () => {
      callOrder.push("triggerScan");
      return makeScanStats();
    });
    const onScanComplete = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onScanComplete, onClose });

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Grandparent" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Scan" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(callOrder).toEqual(["setExclusions", "triggerScan"]);
    expect(onScanComplete).toHaveBeenCalledWith(expect.objectContaining({ rootPath: "/music" }));
  });

  it("shows 'Scanning…' while the scan is in flight", async () => {
    let resolveScan!: (s: ScanStats) => void;
    mockTriggerScan.mockReturnValue(
      new Promise((resolve) => {
        resolveScan = resolve;
      })
    );
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Grandparent" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Scan" }));

    expect(screen.getByRole("button", { name: "Scanning…" })).toBeInTheDocument();

    resolveScan(makeScanStats());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Scanning…" })).not.toBeInTheDocument());
  });

  it("does not trigger the scan and shows an error when the defensive save fails", async () => {
    mockSetExclusions.mockRejectedValue(new Error("save failed before scan"));
    const onScanComplete = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onScanComplete, onClose });

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Grandparent" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Scan" }));

    await waitFor(() => expect(screen.getByText("save failed before scan")).toBeInTheDocument());
    expect(mockTriggerScan).not.toHaveBeenCalled();
    expect(onScanComplete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Scan" })).toBeInTheDocument();
  });
});
