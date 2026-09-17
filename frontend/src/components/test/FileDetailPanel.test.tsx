import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FileDetailPanel, { formatBytes, formatFull } from "../FileDetailPanel.js";
import type { AudioFile } from "../../types.js";
import { STATUS_PILL, STATUS_PILL_UNSELECTED } from "../../statusStyles.js";

function makeFile(overrides: Partial<AudioFile> = {}): AudioFile {
  return {
    id: "f1",
    path: "/music/Song/track.wav",
    relativePath: "Song/track.wav",
    filename: "track.wav",
    extension: ".wav",
    size: 2048,
    modifiedAt: "2026-01-15T10:30:00.000Z",
    containingFolder: "Song",
    status: "draft",
    tags: ["rock"],
    score: 3,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof FileDetailPanel>[0]> = {}) {
  const props = {
    file: makeFile(),
    allTags: [] as string[],
    onClose: () => {},
    onSaveStatus: vi.fn().mockResolvedValue(undefined),
    onSaveTags: vi.fn().mockResolvedValue(undefined),
    onSaveScore: vi.fn().mockResolvedValue(undefined),
    onReveal: () => {},
    onFileOperation: vi.fn(),
    ...overrides,
  };
  return { ...render(<FileDetailPanel {...props} />), props };
}

describe("formatBytes", () => {
  it("renders whole bytes below the 1024 threshold", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("renders KB with one decimal at and above the 1024-byte threshold", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  it("renders MB with one decimal at and above the 1MB threshold", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatFull", () => {
  it("formats an ISO timestamp as a full 'Mon D, YYYY, HH:MM' string in UTC (24h)", () => {
    expect(formatFull("2026-01-15T10:30:00.000Z")).toBe("Jan 15, 2026, 10:30");
  });

  it("zero-pads the hour/minute and keeps midnight as 00:MM (not 24:MM)", () => {
    expect(formatFull("2026-01-15T00:05:00.000Z")).toBe("Jan 15, 2026, 00:05");
  });
});

describe("FileDetailPanel - basic rendering", () => {
  it("renders the filename, formatted 'Updated' timestamp, size, and location", () => {
    renderPanel({
      file: makeFile({
        filename: "beat.wav",
        size: 2048,
        modifiedAt: "2026-01-15T10:30:00.000Z",
        path: "/music/Song/beat.wav",
        relativePath: "Song/beat.wav",
      }),
    });

    expect(screen.getByRole("dialog", { name: "File detail: beat.wav" })).toBeInTheDocument();
    expect(screen.getByText("beat.wav")).toBeInTheDocument();
    expect(screen.getByText("Updated Jan 15, 2026, 10:30")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("Song/beat.wav")).toBeInTheDocument();
    expect(screen.getByText("/music/Song/beat.wav")).toBeInTheDocument();
  });

  it("always shows the 'Reveal file in Finder' button and calls onReveal with the file path", async () => {
    const onReveal = vi.fn();
    const user = userEvent.setup();
    renderPanel({ file: makeFile({ path: "/music/Song/beat.wav" }), onReveal });

    await user.click(screen.getByRole("button", { name: "Reveal file in Finder" }));

    expect(onReveal).toHaveBeenCalledWith("/music/Song/beat.wav");
  });

  it("shows the 'Reveal project' button and calls onReveal with the project path when file.projectPath is set", async () => {
    const onReveal = vi.fn();
    const user = userEvent.setup();
    renderPanel({ file: makeFile({ projectPath: "/music/Song" }), onReveal });

    const btn = screen.getByRole("button", { name: "Reveal project" });
    await user.click(btn);

    expect(onReveal).toHaveBeenCalledWith("/music/Song");
  });

  it("does not show the 'Reveal project' button when file.projectPath is absent", () => {
    renderPanel({ file: makeFile({ projectPath: undefined }) });

    expect(screen.queryByRole("button", { name: "Reveal project" })).not.toBeInTheDocument();
  });
});

describe("FileDetailPanel - Copy/Move/Delete buttons", () => {
  it("calls onFileOperation with 'copy' and the file when the Copy button is clicked", async () => {
    const onFileOperation = vi.fn();
    const user = userEvent.setup();
    const file = makeFile({ id: "f1", filename: "beat.wav" });
    renderPanel({ file, onFileOperation });

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(onFileOperation).toHaveBeenCalledTimes(1);
    expect(onFileOperation).toHaveBeenCalledWith("copy", file);
  });

  it("calls onFileOperation with 'move' and the file when the Move button is clicked", async () => {
    const onFileOperation = vi.fn();
    const user = userEvent.setup();
    const file = makeFile({ id: "f1", filename: "beat.wav" });
    renderPanel({ file, onFileOperation });

    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(onFileOperation).toHaveBeenCalledTimes(1);
    expect(onFileOperation).toHaveBeenCalledWith("move", file);
  });

  it("calls onFileOperation with 'delete' and the file when the Delete button is clicked", async () => {
    const onFileOperation = vi.fn();
    const user = userEvent.setup();
    const file = makeFile({ id: "f1", filename: "beat.wav" });
    renderPanel({ file, onFileOperation });

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onFileOperation).toHaveBeenCalledTimes(1);
    expect(onFileOperation).toHaveBeenCalledWith("delete", file);
  });
});

describe("FileDetailPanel - Escape to close", () => {
  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("FileDetailPanel - status optimistic update", () => {
  it("shows the new status immediately (optimistic) and keeps it once the save resolves", async () => {
    const onSaveStatus = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel({ file: makeFile({ status: "draft" }), onSaveStatus });

    const doneBtn = screen.getByRole("button", { name: "Done" });
    await user.click(doneBtn);

    expect(doneBtn).toHaveAttribute("aria-pressed", "true");
    expect(onSaveStatus).toHaveBeenCalledWith("f1", "done");

    await waitFor(() => expect(doneBtn).toHaveAttribute("aria-pressed", "true"));
  });

  it("rolls back to the previous status when the save rejects", async () => {
    const onSaveStatus = vi.fn().mockRejectedValue(new Error("save failed"));
    const user = userEvent.setup();
    renderPanel({ file: makeFile({ status: "draft" }), onSaveStatus });

    const draftBtn = screen.getByRole("button", { name: "Draft" });
    const doneBtn = screen.getByRole("button", { name: "Done" });
    await user.click(doneBtn);

    expect(onSaveStatus).toHaveBeenCalledWith("f1", "done");
    await waitFor(() => expect(draftBtn).toHaveAttribute("aria-pressed", "true"));
    expect(doneBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("does not call onSaveStatus when clicking the already-selected status (no-op guard)", async () => {
    const onSaveStatus = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel({ file: makeFile({ status: "draft" }), onSaveStatus });

    await user.click(screen.getByRole("button", { name: "Draft" }));

    expect(onSaveStatus).not.toHaveBeenCalled();
  });
});

describe("FileDetailPanel - tags optimistic update", () => {
  it("shows the new tag immediately and keeps it once the save resolves", async () => {
    const onSaveTags = vi.fn().mockResolvedValue(undefined);
    // delay: null avoids userEvent's real (macrotask-based) inter-keystroke
    // delay, so the whole "jazz{Enter}" sequence commits within one
    // synchronous/microtask turn instead of racing FileDetailPanel's
    // real 50ms setTimeout that auto-focuses the close button on mount.
    const user = userEvent.setup({ delay: null });
    renderPanel({ file: makeFile({ tags: ["rock"] }), onSaveTags });

    const input = screen.getByRole("combobox");
    await user.type(input, "jazz{Enter}");

    expect(screen.getByText("jazz")).toBeInTheDocument();
    expect(onSaveTags).toHaveBeenCalledWith("f1", ["rock", "jazz"]);

    await waitFor(() => expect(screen.getByText("jazz")).toBeInTheDocument());
  });

  it("rolls back to the previous tags when the save rejects", async () => {
    const onSaveTags = vi.fn().mockRejectedValue(new Error("save failed"));
    const user = userEvent.setup({ delay: null });
    renderPanel({ file: makeFile({ tags: ["rock"] }), onSaveTags });

    const input = screen.getByRole("combobox");
    await user.type(input, "jazz{Enter}");

    expect(onSaveTags).toHaveBeenCalledWith("f1", ["rock", "jazz"]);

    await waitFor(() => expect(screen.queryByText("jazz")).not.toBeInTheDocument());
    expect(screen.getByText("rock")).toBeInTheDocument();
  });
});

describe("FileDetailPanel - score optimistic update", () => {
  it("shows the new score immediately and keeps it once the save resolves", async () => {
    const onSaveScore = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel({ file: makeFile({ score: 3 }), onSaveScore });

    const fiveDot = screen.getByRole("radio", { name: "5 of 5" });
    await user.click(fiveDot);

    expect(fiveDot).toHaveAttribute("aria-checked", "true");
    expect(onSaveScore).toHaveBeenCalledWith("f1", 5);

    await waitFor(() => expect(fiveDot).toHaveAttribute("aria-checked", "true"));
  });

  it("rolls back to the previous score when the save rejects", async () => {
    const onSaveScore = vi.fn().mockRejectedValue(new Error("save failed"));
    const user = userEvent.setup();
    renderPanel({ file: makeFile({ score: 3 }), onSaveScore });

    const threeDot = screen.getByRole("radio", { name: "3 of 5" });
    const fiveDot = screen.getByRole("radio", { name: "5 of 5" });
    await user.click(fiveDot);

    expect(onSaveScore).toHaveBeenCalledWith("f1", 5);

    await waitFor(() => expect(threeDot).toHaveAttribute("aria-checked", "true"));
    expect(fiveDot).toHaveAttribute("aria-checked", "false");
  });
});

describe("FileDetailPanel - backdrop click to dismiss", () => {
  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = renderPanel({ onClose });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("FileDetailPanel - auto-focus on open", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("focuses the close button 50ms after opening", () => {
    renderPanel();

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
  });
});

describe("FileDetailPanel - Saving… indicator", () => {
  it("shows a 'Saving…' indicator while a status save is in flight", async () => {
    const onSaveStatus = vi.fn().mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderPanel({ file: makeFile({ status: "draft" }), onSaveStatus });

    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it("shows a 'Saving…' indicator while a score save is in flight", async () => {
    const onSaveScore = vi.fn().mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderPanel({ file: makeFile({ score: 3 }), onSaveScore });

    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "5 of 5" }));

    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it("shows a 'Saving…' indicator while a tags save is in flight", async () => {
    const onSaveTags = vi.fn().mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup({ delay: null });
    renderPanel({ file: makeFile({ tags: ["rock"] }), onSaveTags });

    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    const input = screen.getByRole("combobox");
    await user.type(input, "jazz{Enter}");

    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });
});

describe("FileDetailPanel - re-sync on file id change", () => {
  it("resets local edited state to the new file's values, discarding an unresolved edit on the previous file", async () => {
    // onSaveStatus never resolves, so the optimistic edit on file A stays "pending"
    // until the file prop swaps to a different id.
    const onSaveStatus = vi.fn().mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const fileA = makeFile({ id: "f1", status: "draft" });
    const fileB = makeFile({ id: "f2", status: "released", tags: ["ambient"], score: 1 });
    const { rerender } = renderPanel({ file: fileA, onSaveStatus });

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");

    rerender(
      <FileDetailPanel
        file={fileB}
        allTags={[]}
        onClose={() => {}}
        onSaveStatus={onSaveStatus}
        onSaveTags={vi.fn().mockResolvedValue(undefined)}
        onSaveScore={vi.fn().mockResolvedValue(undefined)}
        onReveal={() => {}}
        onFileOperation={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Released" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("ambient")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "1 of 5" })).toHaveAttribute("aria-checked", "true");
  });
});

// Token-class coverage: this panel is no longer isDark/isProFolder-driven (see App.tsx and
// index.css's [data-theme] blocks), so these tests assert the token classes themselves are
// present rather than any isDark-branch selection (removed from this file entirely).
describe("FileDetailPanel - token-driven classes", () => {
  it("applies STATUS_PILL's per-status classes to the selected status button and STATUS_PILL_UNSELECTED to the rest", () => {
    renderPanel({ file: makeFile({ status: "draft" }) });

    const draftBtn = screen.getByRole("button", { name: "Draft" });
    const doneBtn = screen.getByRole("button", { name: "Done" });

    for (const cls of STATUS_PILL.draft.split(" ")) {
      expect(draftBtn.className).toContain(cls);
    }
    for (const cls of STATUS_PILL_UNSELECTED.split(" ")) {
      expect(doneBtn.className).toContain(cls);
    }
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

  it("applies surface/border/ink tokens to the panel and its outline action buttons", () => {
    renderPanel();

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("bg-surface");
    expect(dialog.className).toContain("border-border");
    expect(dialog.className).toContain("text-ink");

    const copyBtn = screen.getByRole("button", { name: "Copy" });
    expect(copyBtn.className).toContain("border-border");
    expect(copyBtn.className).toContain("text-ink-muted");
    expect(copyBtn.className).toContain("hover:bg-surface-hover");
  });
});
