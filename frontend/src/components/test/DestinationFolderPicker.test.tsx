import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DestinationFolderPicker from "../DestinationFolderPicker.js";
import type { FolderNode } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getFolderTree: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetFolderTree = vi.mocked(api.getFolderTree);

// Same three-level fixture shape as ScanFolderPanel.test.tsx: root > Grandparent > Parent > Child, plus a flat Sibling.
// Paths match `buildFolderTree`'s REAL root-relative shape (src/scanner/folderTree.ts): the
// root's own path is "", and every other node's path is a "/"-joined path relative to that
// root — never an absolute filesystem path. This component never sees or produces an absolute
// path itself; that conversion is the caller's (CopyMoveDeleteDialog's) responsibility.
const childNode: FolderNode = { name: "Child", path: "Grandparent/Parent/Child", type: "folder", children: [] };
const parentNode: FolderNode = { name: "Parent", path: "Grandparent/Parent", type: "folder", children: [childNode] };
const grandparentNode: FolderNode = { name: "Grandparent", path: "Grandparent", type: "folder", children: [parentNode] };
const siblingNode: FolderNode = { name: "Sibling", path: "Sibling", type: "folder", children: [] };
const tree: FolderNode = { name: "music", path: "", type: "folder", children: [grandparentNode, siblingNode] };

function Harness({
  excludedPath,
  initialSelected = null,
}: {
  excludedPath?: string;
  initialSelected?: string | null;
}) {
  const [selectedPath, setSelectedPath] = useState<string | null>(initialSelected);
  return (
    <>
      <DestinationFolderPicker isDark={true} excludedPath={excludedPath} selectedPath={selectedPath} onSelect={setSelectedPath} />
      <span data-testid="selected-value">{selectedPath ?? "none"}</span>
    </>
  );
}

beforeEach(() => {
  mockGetFolderTree.mockReset().mockResolvedValue(tree);
});

describe("DestinationFolderPicker - rendering", () => {
  it("shows a loading message, then the tree", async () => {
    let resolveTree!: (t: FolderNode) => void;
    mockGetFolderTree.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveTree = resolve;
      })
    );
    render(<Harness />);

    expect(screen.getByText("Loading folders…")).toBeInTheDocument();

    resolveTree(tree);

    await waitFor(() => expect(screen.getByRole("radio", { name: "music" })).toBeInTheDocument());
    // Root expands by default (depth 0), so its direct children are visible too.
    expect(screen.getByRole("radio", { name: "Grandparent" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sibling" })).toBeInTheDocument();
    // Grandparent (depth 1) is collapsed by default, so its own child isn't rendered yet.
    expect(screen.queryByRole("radio", { name: "Parent" })).not.toBeInTheDocument();
  });

  it("shows the error message when getFolderTree rejects", async () => {
    mockGetFolderTree.mockReset().mockRejectedValue(new Error("disk unavailable"));
    render(<Harness />);

    await waitFor(() => expect(screen.getByText("disk unavailable")).toBeInTheDocument());
  });

  it("expands a collapsed node on click, revealing its child", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await waitFor(() => expect(screen.getByRole("radio", { name: "Grandparent" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Expand Grandparent" }));

    expect(screen.getByRole("radio", { name: "Parent" })).toBeInTheDocument();
  });
});

describe("DestinationFolderPicker - single-select behavior", () => {
  it("selects a folder on click and reports it via onSelect", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await waitFor(() => expect(screen.getByRole("radio", { name: "Grandparent" })).toBeInTheDocument());
    await user.click(screen.getByRole("radio", { name: "Grandparent" }));

    expect(screen.getByRole("radio", { name: "Grandparent" })).toBeChecked();
    expect(screen.getByTestId("selected-value")).toHaveTextContent(grandparentNode.path);
  });

  it("selecting a different folder deselects the previous one (single-select, not independent toggles)", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await waitFor(() => expect(screen.getByRole("radio", { name: "Grandparent" })).toBeInTheDocument());
    await user.click(screen.getByRole("radio", { name: "Grandparent" }));
    expect(screen.getByRole("radio", { name: "Grandparent" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Sibling" }));

    expect(screen.getByRole("radio", { name: "Sibling" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Grandparent" })).not.toBeChecked();
    expect(screen.getByTestId("selected-value")).toHaveTextContent(siblingNode.path);
  });
});

describe("DestinationFolderPicker - excludedPath disabling", () => {
  it("disables the excluded folder itself and does not select it on click", async () => {
    const user = userEvent.setup();
    render(<Harness excludedPath={grandparentNode.path} />);

    await waitFor(() => expect(screen.getByRole("radio", { name: "Grandparent" })).toBeInTheDocument());
    const grandparentRadio = screen.getByRole("radio", { name: "Grandparent" });
    expect(grandparentRadio).toBeDisabled();

    await user.click(grandparentRadio);

    expect(grandparentRadio).not.toBeChecked();
    expect(screen.getByTestId("selected-value")).toHaveTextContent("none");
  });

  it("disables every descendant of the excluded folder too, but leaves unrelated folders selectable", async () => {
    const user = userEvent.setup();
    render(<Harness excludedPath={grandparentNode.path} />);

    await waitFor(() => expect(screen.getByRole("radio", { name: "Grandparent" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Expand Grandparent" }));

    const parentRadio = screen.getByRole("radio", { name: "Parent" });
    expect(parentRadio).toBeDisabled();
    await user.click(parentRadio);
    expect(parentRadio).not.toBeChecked();
    expect(screen.getByTestId("selected-value")).toHaveTextContent("none");

    // Sibling is unrelated to the excluded subtree and remains fully selectable.
    const siblingRadio = screen.getByRole("radio", { name: "Sibling" });
    expect(siblingRadio).not.toBeDisabled();
    await user.click(siblingRadio);
    expect(siblingRadio).toBeChecked();
    expect(screen.getByTestId("selected-value")).toHaveTextContent(siblingNode.path);
  });

  it("does not disable anything when excludedPath is omitted", async () => {
    render(<Harness />);

    await waitFor(() => expect(screen.getByRole("radio", { name: "Grandparent" })).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "Grandparent" })).not.toBeDisabled();
    expect(screen.getByRole("radio", { name: "Sibling" })).not.toBeDisabled();
  });
});
