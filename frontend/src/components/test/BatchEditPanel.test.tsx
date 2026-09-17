import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BatchEditPanel from "../BatchEditPanel.js";

function renderPanel(overrides: Partial<Parameters<typeof BatchEditPanel>[0]> = {}) {
  const props = {
    open: true,
    count: 3,
    itemLabel: "audio file",
    allTags: [] as string[],
    itemType: "files" as const,
    selectedIds: ["file-1", "file-2", "file-3"],
    onClose: () => {},
    onApplyScore: vi.fn().mockResolvedValue(undefined),
    onApplyTag: vi.fn().mockResolvedValue(undefined),
    onBatchOperation: vi.fn(),
    ...overrides,
  };
  return { ...render(<BatchEditPanel {...props} />), props };
}

describe("BatchEditPanel - basic rendering / count wording", () => {
  it("uses plural wording ('files selected') for count > 1", () => {
    renderPanel({ count: 3, itemLabel: "audio file" });

    expect(screen.getByRole("dialog", { name: "Batch edit audio files" })).toBeInTheDocument();
    expect(screen.getByText("3 audio files selected")).toBeInTheDocument();
  });

  it("uses singular wording ('file selected') for count === 1", () => {
    renderPanel({ count: 1, itemLabel: "audio file" });

    expect(screen.getByText("1 audio file selected")).toBeInTheDocument();
  });

  it("reflects count and itemLabel in the score/tag helper copy too", () => {
    renderPanel({ count: 1, itemLabel: "project folder" });

    expect(screen.getByText(/Applies immediately to all 1 selected project folder,/)).toBeInTheDocument();
    expect(screen.getByText(/Each tag is added to all 1 selected project folder,/)).toBeInTheDocument();
  });
});

describe("BatchEditPanel - Escape to close", () => {
  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("BatchEditPanel - handleScoreChange", () => {
  it("calls onApplyScore with the clicked score and reflects it once the save resolves", async () => {
    const onApplyScore = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel({ onApplyScore });

    await user.click(screen.getByRole("radio", { name: "4 of 5" }));

    expect(onApplyScore).toHaveBeenCalledWith(4);
    await waitFor(() => expect(screen.getByRole("radio", { name: "4 of 5" })).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("4/5")).toBeInTheDocument();
  });

  it("shows 'Applying…' and disables the score editor while the save is in flight", async () => {
    let resolveScore!: () => void;
    const onApplyScore = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveScore = resolve;
      })
    );
    const user = userEvent.setup();
    renderPanel({ onApplyScore });

    await user.click(screen.getByRole("radio", { name: "4 of 5" }));

    expect(screen.getByText("Applying…")).toBeInTheDocument();
    screen.getAllByRole("radio").forEach((radio) => expect(radio).toBeDisabled());

    resolveScore();
    await waitFor(() => expect(screen.queryByText("Applying…")).not.toBeInTheDocument());
  });

  it("shows a static error and leaves the displayed score unchanged when onApplyScore rejects", async () => {
    const onApplyScore = vi.fn().mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderPanel({ onApplyScore });

    await user.click(screen.getByRole("radio", { name: "4 of 5" }));

    await waitFor(() => expect(screen.queryByText("Applying…")).not.toBeInTheDocument());
    expect(screen.getByText("Failed to apply score")).toBeInTheDocument();
    expect(screen.queryByText("4/5")).not.toBeInTheDocument();
  });

  it("clears a stale score error once a subsequent save succeeds", async () => {
    const onApplyScore = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPanel({ onApplyScore });

    await user.click(screen.getByRole("radio", { name: "4 of 5" }));
    await waitFor(() => expect(screen.getByText("Failed to apply score")).toBeInTheDocument());

    await user.click(screen.getByRole("radio", { name: "3 of 5" }));

    await waitFor(() => expect(screen.getByText("3/5")).toBeInTheDocument());
    expect(screen.queryByText("Failed to apply score")).not.toBeInTheDocument();
  });
});

describe("BatchEditPanel - handleAddTag", () => {
  it("calls onApplyTag with the trimmed tag and shows it as an applied chip once resolved", async () => {
    const onApplyTag = vi.fn().mockResolvedValue(undefined);
    // delay: null avoids userEvent's real inter-keystroke delay racing the
    // panel's real 50ms setTimeout auto-focus-on-mount effect.
    const user = userEvent.setup({ delay: null });
    renderPanel({ onApplyTag });

    const input = screen.getByRole("combobox");
    await user.type(input, "  jazz  {Enter}");

    expect(onApplyTag).toHaveBeenCalledWith("jazz");
    await waitFor(() => expect(screen.getByText("jazz")).toBeInTheDocument());
    expect(input).toHaveValue("");
  });

  it("does not call onApplyTag for a whitespace-only tag", async () => {
    const onApplyTag = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderPanel({ onApplyTag });

    const input = screen.getByRole("combobox");
    await user.type(input, "   {Enter}");

    expect(onApplyTag).not.toHaveBeenCalled();
  });

  it("calls onApplyTag again for a repeat submission of an already-applied tag, but does not duplicate the displayed chip", async () => {
    const onApplyTag = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderPanel({ onApplyTag });

    const input = screen.getByRole("combobox");
    await user.type(input, "jazz{Enter}");
    await waitFor(() => expect(screen.getByText("jazz")).toBeInTheDocument());

    await user.type(input, "jazz{Enter}");

    await waitFor(() => expect(onApplyTag).toHaveBeenCalledTimes(2));
    expect(onApplyTag).toHaveBeenNthCalledWith(1, "jazz");
    expect(onApplyTag).toHaveBeenNthCalledWith(2, "jazz");
    expect(screen.getAllByText("jazz")).toHaveLength(1);
  });

  it("shows 'Applying…' and disables the tag input while the save is in flight", async () => {
    let resolveTag!: () => void;
    const onApplyTag = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveTag = resolve;
      })
    );
    const user = userEvent.setup({ delay: null });
    renderPanel({ onApplyTag });

    const input = screen.getByRole("combobox");
    await user.type(input, "jazz{Enter}");

    expect(screen.getByText("Applying…")).toBeInTheDocument();
    expect(input).toBeDisabled();

    resolveTag();
    await waitFor(() => expect(screen.queryByText("Applying…")).not.toBeInTheDocument());
  });

  it("the Add button also commits the current input value and is disabled when the input is empty", async () => {
    const onApplyTag = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderPanel({ onApplyTag });

    const addButton = screen.getByRole("button", { name: "Add" });
    expect(addButton).toBeDisabled();

    const input = screen.getByRole("combobox");
    await user.type(input, "ambient");
    expect(addButton).not.toBeDisabled();

    await user.click(addButton);

    expect(onApplyTag).toHaveBeenCalledWith("ambient");
    await waitFor(() => expect(screen.getByText("ambient")).toBeInTheDocument());
  });

  it("shows a static error, adds no chip, and does not clear the input when onApplyTag rejects", async () => {
    const onApplyTag = vi.fn().mockRejectedValue(new Error("boom"));
    const user = userEvent.setup({ delay: null });
    renderPanel({ onApplyTag });

    const input = screen.getByRole("combobox");
    await user.type(input, "jazz{Enter}");

    await waitFor(() => expect(screen.queryByText("Applying…")).not.toBeInTheDocument());
    expect(screen.getByText("Failed to add tag")).toBeInTheDocument();
    expect(screen.queryByText("jazz")).not.toBeInTheDocument();
    expect(input).toHaveValue("jazz");
  });

  it("clears a stale tag error once a subsequent add succeeds", async () => {
    const onApplyTag = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
    const user = userEvent.setup({ delay: null });
    renderPanel({ onApplyTag });

    const input = screen.getByRole("combobox");
    await user.type(input, "jazz{Enter}");
    await waitFor(() => expect(screen.getByText("Failed to add tag")).toBeInTheDocument());

    // Rejection leaves the input un-cleared (asserted above), so clear it explicitly
    // before retyping — otherwise this would submit "jazzjazz" instead of "jazz".
    await user.clear(input);
    await user.type(input, "jazz{Enter}");

    await waitFor(() => expect(screen.getByText("jazz")).toBeInTheDocument());
    expect(screen.queryByText("Failed to add tag")).not.toBeInTheDocument();
  });
});

describe("BatchEditPanel - reset on open", () => {
  it("discards a previous session's applied score/tags when the panel is reopened", async () => {
    const onApplyScore = vi.fn().mockResolvedValue(undefined);
    const onApplyTag = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    const { rerender } = renderPanel({ open: true, onApplyScore, onApplyTag });

    await user.click(screen.getByRole("radio", { name: "4 of 5" }));
    await waitFor(() => expect(screen.getByText("4/5")).toBeInTheDocument());

    const input = screen.getByRole("combobox");
    await user.type(input, "jazz{Enter}");
    await waitFor(() => expect(screen.getByText("jazz")).toBeInTheDocument());

    // Close, then reopen — simulates a fresh batch-edit session.
    rerender(
      <BatchEditPanel
        open={false}
        count={3}
        itemLabel="audio file"
        allTags={[]}
        itemType="files"
        selectedIds={["file-1", "file-2", "file-3"]}
        onClose={() => {}}
        onApplyScore={onApplyScore}
        onApplyTag={onApplyTag}
        onBatchOperation={() => {}}
      />
    );
    rerender(
      <BatchEditPanel
        open={true}
        count={3}
        itemLabel="audio file"
        allTags={[]}
        itemType="files"
        selectedIds={["file-1", "file-2", "file-3"]}
        onClose={() => {}}
        onApplyScore={onApplyScore}
        onApplyTag={onApplyTag}
        onBatchOperation={() => {}}
      />
    );

    await waitFor(() => expect(screen.queryByText("jazz")).not.toBeInTheDocument());
    expect(screen.queryByText("4/5")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("");
    screen.getAllByRole("radio").forEach((radio) => expect(radio).toHaveAttribute("aria-checked", "false"));
  });

  it("discards a stale score/tag error from a previous session when the panel is reopened", async () => {
    const onApplyScore = vi.fn().mockRejectedValue(new Error("boom"));
    const onApplyTag = vi.fn().mockRejectedValue(new Error("boom"));
    const user = userEvent.setup({ delay: null });
    const { rerender } = renderPanel({ open: true, onApplyScore, onApplyTag });

    await user.click(screen.getByRole("radio", { name: "4 of 5" }));
    await waitFor(() => expect(screen.getByText("Failed to apply score")).toBeInTheDocument());

    const input = screen.getByRole("combobox");
    await user.type(input, "jazz{Enter}");
    await waitFor(() => expect(screen.getByText("Failed to add tag")).toBeInTheDocument());

    // Close, then reopen — simulates a fresh batch-edit session.
    rerender(
      <BatchEditPanel
        open={false}
        count={3}
        itemLabel="audio file"
        allTags={[]}
        itemType="files"
        selectedIds={["file-1", "file-2", "file-3"]}
        onClose={() => {}}
        onApplyScore={onApplyScore}
        onApplyTag={onApplyTag}
        onBatchOperation={() => {}}
      />
    );
    rerender(
      <BatchEditPanel
        open={true}
        count={3}
        itemLabel="audio file"
        allTags={[]}
        itemType="files"
        selectedIds={["file-1", "file-2", "file-3"]}
        onClose={() => {}}
        onApplyScore={onApplyScore}
        onApplyTag={onApplyTag}
        onBatchOperation={() => {}}
      />
    );

    await waitFor(() => expect(screen.queryByText("Failed to apply score")).not.toBeInTheDocument());
    expect(screen.queryByText("Failed to add tag")).not.toBeInTheDocument();
  });
});

describe("BatchEditPanel - Copy/Move/Delete actions", () => {
  it("calls onBatchOperation with 'copy' and the full selected id list for a Files batch", async () => {
    const onBatchOperation = vi.fn();
    const user = userEvent.setup();
    renderPanel({ itemType: "files", selectedIds: ["file-1", "file-2", "file-3"], onBatchOperation });

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(onBatchOperation).toHaveBeenCalledTimes(1);
    expect(onBatchOperation).toHaveBeenCalledWith("copy", ["file-1", "file-2", "file-3"]);
  });

  it("calls onBatchOperation with 'move' and the full selected id list for a Files batch", async () => {
    const onBatchOperation = vi.fn();
    const user = userEvent.setup();
    renderPanel({ itemType: "files", selectedIds: ["file-1", "file-2"], onBatchOperation });

    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(onBatchOperation).toHaveBeenCalledWith("move", ["file-1", "file-2"]);
  });

  it("calls onBatchOperation with 'delete' and the full selected id list for a Files batch", async () => {
    const onBatchOperation = vi.fn();
    const user = userEvent.setup();
    renderPanel({ itemType: "files", selectedIds: ["file-1", "file-2"], onBatchOperation });

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onBatchOperation).toHaveBeenCalledWith("delete", ["file-1", "file-2"]);
  });

  it("passes through the full id list unchanged for a Projects batch with no nesting relationship", async () => {
    const onBatchOperation = vi.fn();
    const user = userEvent.setup();
    renderPanel({
      itemType: "projects",
      selectedIds: ["proj-a", "proj-b"],
      projectPaths: [
        { id: "proj-a", path: "Music/Alpha" },
        { id: "proj-b", path: "Music/Beta" },
      ],
      onBatchOperation,
    });

    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(onBatchOperation).toHaveBeenCalledWith("move", ["proj-a", "proj-b"]);
  });

  it("excludes a selected sub-project from the batch target when its parent project is also selected", async () => {
    const onBatchOperation = vi.fn();
    const user = userEvent.setup();
    renderPanel({
      itemType: "projects",
      selectedIds: ["parent-id", "child-id", "unrelated-id"],
      projectPaths: [
        { id: "parent-id", path: "Music/Parent Project" },
        { id: "child-id", path: "Music/Parent Project/Nested Sub-Project" },
        { id: "unrelated-id", path: "Music/Unrelated Project" },
      ],
      onBatchOperation,
    });

    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(onBatchOperation).toHaveBeenCalledWith("move", ["parent-id", "unrelated-id"]);
  });

  it("applies the same dedup for Copy and Delete, not just Move", async () => {
    const onBatchOperation = vi.fn();
    const user = userEvent.setup();
    const props = {
      itemType: "projects" as const,
      selectedIds: ["parent-id", "child-id"],
      projectPaths: [
        { id: "parent-id", path: "Music/Parent Project" },
        { id: "child-id", path: "Music/Parent Project/Nested Sub-Project" },
      ],
      onBatchOperation,
    };
    renderPanel(props);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onBatchOperation).toHaveBeenNthCalledWith(1, "copy", ["parent-id"]);
    expect(onBatchOperation).toHaveBeenNthCalledWith(2, "delete", ["parent-id"]);
  });

  it("does not close the panel after invoking onBatchOperation (mirrors the score/tag actions, which also stay open)", async () => {
    const onClose = vi.fn();
    const onBatchOperation = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose, onBatchOperation });

    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Batch edit audio files" })).toBeInTheDocument();
  });
});
