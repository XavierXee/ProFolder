import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileTable, sortIndicator } from "../FileTable.js";
import type { AudioFile } from "../../types.js";
import type { FileFilters } from "../../api/client.js";

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

function renderTable(overrides: Partial<Parameters<typeof FileTable>[0]> = {}) {
  const props = {
    files: [],
    filters: {} as FileFilters,
    loading: false,
    flashId: null,
    isDark: true,
    selectedId: null,
    selectedIds: new Set<string>(),
    playingFileId: null,
    isPlaying: false,
    onSortChange: () => {},
    onRowClick: () => {},
    onClearFilters: () => {},
    onToggleSelect: () => {},
    onToggleSelectAll: () => {},
    onPlayClick: () => {},
    ...overrides,
  };
  return render(<FileTable {...props} />);
}

describe("sortIndicator", () => {
  const baseFilters: FileFilters = {};

  it("returns an up arrow when this key is the active sort, ascending", () => {
    expect(sortIndicator({ ...baseFilters, sortBy: "name", sortDir: "asc" }, "name")).toBe(" ↑");
  });

  it("returns a down arrow when this key is the active sort, descending", () => {
    expect(sortIndicator({ ...baseFilters, sortBy: "name", sortDir: "desc" }, "name")).toBe(" ↓");
  });

  it("defaults to an up arrow when sortDir is unset for the active key", () => {
    expect(sortIndicator({ ...baseFilters, sortBy: "name" }, "name")).toBe(" ↑");
  });

  it("returns an empty string when this key is not the active sort", () => {
    expect(sortIndicator({ ...baseFilters, sortBy: "modifiedAt", sortDir: "desc" }, "name")).toBe("");
  });

  it("returns an empty string when no sort is active at all", () => {
    expect(sortIndicator(baseFilters, "name")).toBe("");
  });
});

describe("FileTable - sortable headers", () => {
  function getHeader(name: RegExp) {
    return screen.getByRole("columnheader", { name });
  }

  it("marks the active ascending column with aria-sort='ascending' and shows the up arrow", () => {
    renderTable({ filters: { sortBy: "name", sortDir: "asc" } });

    const header = getHeader(/Track \/ File/);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(within(header).getByRole("button")).toHaveTextContent("Track / File ↑");
  });

  it("marks the active descending column with aria-sort='descending' and shows the down arrow", () => {
    renderTable({ filters: { sortBy: "modifiedAt", sortDir: "desc" } });

    const header = getHeader(/Modified/);
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(within(header).getByRole("button")).toHaveTextContent("Modified ↓");
  });

  it("marks inactive sortable columns with aria-sort='none' and no arrow", () => {
    renderTable({ filters: { sortBy: "name", sortDir: "asc" } });

    const header = getHeader(/^Location$/);
    expect(header).toHaveAttribute("aria-sort", "none");
    expect(within(header).getByRole("button")).toHaveTextContent("Location");
    expect(within(header).getByRole("button")).not.toHaveTextContent(/[↑↓]/);
  });

  it("marks the active ascending Score column with aria-sort='ascending' and shows the up arrow", () => {
    renderTable({ filters: { sortBy: "score", sortDir: "asc" } });

    const header = getHeader(/Score/);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(within(header).getByRole("button")).toHaveTextContent("Score ↑");
  });

  it("marks the active descending Score column with aria-sort='descending' and shows the down arrow", () => {
    renderTable({ filters: { sortBy: "score", sortDir: "desc" } });

    const header = getHeader(/Score/);
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(within(header).getByRole("button")).toHaveTextContent("Score ↓");
  });

  it("marks the Score column with aria-sort='none' and no arrow when it is not the active sort", () => {
    renderTable({ filters: { sortBy: "name", sortDir: "asc" } });

    const header = getHeader(/^Score$/);
    expect(header).toHaveAttribute("aria-sort", "none");
    expect(within(header).getByRole("button")).toHaveTextContent("Score");
    expect(within(header).getByRole("button")).not.toHaveTextContent(/[↑↓]/);
  });

  it("calls onSortChange with the clicked column's sort key", async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    renderTable({ onSortChange });

    await user.click(within(getHeader(/Track \/ File/)).getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith("name");

    await user.click(within(getHeader(/^Score$/)).getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith("score");

    await user.click(within(getHeader(/^Location$/)).getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith("folder");

    await user.click(within(getHeader(/Modified/)).getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith("modifiedAt");
  });
});

describe("FileTable - loading/empty/populated states", () => {
  it("renders skeleton loading rows when loading is true", () => {
    const { container } = renderTable({ loading: true, files: [] });

    expect(container.querySelectorAll("tbody tr")).toHaveLength(8);
    expect(container.querySelector(".skeleton")).not.toBeNull();
  });

  it("renders the empty state when not loading and there are no files", () => {
    renderTable({ loading: false, files: [] });

    expect(screen.getByText("No audio files match your filters")).toBeInTheDocument();
  });

  it("calls onClearFilters from the empty state's clear button", async () => {
    const onClearFilters = vi.fn();
    const user = userEvent.setup();
    renderTable({ loading: false, files: [], onClearFilters });

    await user.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("renders one row per file when populated", () => {
    const files = [
      makeFile({ id: "f1", filename: "one.wav" }),
      makeFile({ id: "f2", filename: "two.wav" }),
      makeFile({ id: "f3", filename: "three.wav" }),
    ];
    const { container } = renderTable({ loading: false, files });

    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(screen.getByText("one.wav")).toBeInTheDocument();
    expect(screen.getByText("two.wav")).toBeInTheDocument();
    expect(screen.getByText("three.wav")).toBeInTheDocument();
  });

  it("marks the row matching playingFileId as playing only when isPlaying is also true", () => {
    const files = [makeFile({ id: "f1", filename: "one.wav" })];
    const { rerender } = renderTable({ loading: false, files, playingFileId: "f1", isPlaying: false });

    expect(screen.getByRole("button", { name: "Play one.wav" })).toBeInTheDocument();

    rerender(
      <FileTable
        files={files}
        filters={{}}
        loading={false}
        flashId={null}
        isDark={true}
        selectedId={null}
        selectedIds={new Set()}
        playingFileId="f1"
        isPlaying={true}
        onSortChange={() => {}}
        onRowClick={() => {}}
        onClearFilters={() => {}}
        onToggleSelect={() => {}}
        onToggleSelectAll={() => {}}
        onPlayClick={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Pause one.wav" })).toBeInTheDocument();
  });
});

describe("FileTable - select-all checkbox", () => {
  function getSelectAllCheckbox() {
    return screen.getByLabelText("Select all visible files");
  }

  it("is unchecked when the file list is empty, even though selectedIds is also empty", () => {
    renderTable({ files: [], selectedIds: new Set() });

    expect(getSelectAllCheckbox()).not.toBeChecked();
  });

  it("is unchecked when some but not all visible files are selected", () => {
    const files = [makeFile({ id: "f1" }), makeFile({ id: "f2" })];
    renderTable({ files, selectedIds: new Set(["f1"]) });

    expect(getSelectAllCheckbox()).not.toBeChecked();
  });

  it("is checked when every visible file is selected", () => {
    const files = [makeFile({ id: "f1" }), makeFile({ id: "f2" })];
    renderTable({ files, selectedIds: new Set(["f1", "f2"]) });

    expect(getSelectAllCheckbox()).toBeChecked();
  });

  it("calls onToggleSelectAll when clicked", async () => {
    const onToggleSelectAll = vi.fn();
    const user = userEvent.setup();
    const files = [makeFile({ id: "f1" })];
    renderTable({ files, onToggleSelectAll });

    await user.click(getSelectAllCheckbox());

    expect(onToggleSelectAll).toHaveBeenCalledTimes(1);
  });
});
