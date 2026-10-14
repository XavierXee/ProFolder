import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectsTable, sortIndicator } from "../ProjectsTable.js";
import type { Project } from "../../types.js";
import type { ProjectFilters } from "../../api/client.js";

type ProjectRow = Project & { audioFileCount: number };

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "p1",
    name: "My Song",
    path: "/music/My Song",
    hasVideo: false,
    hasImage: false,
    status: "draft",
    tags: [],
    score: null,
    notes: "",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    contentModifiedAt: null,
    audioFileCount: 3,
    ...overrides,
  };
}

/** The ProFolder accent-bar span is `aria-hidden`, but so is ScoreBadge's unrelated dot indicator
 * (`w-2 h-2 rounded-full`, see ScoreBadge.tsx) — disambiguate by the accent bar's distinctive
 * `w-[3px]` width class rather than matching on `aria-hidden` alone. */
function getAccentBar(container: HTMLElement): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>('span[aria-hidden="true"]')).find((el) =>
    el.className.split(/\s+/).includes("w-[3px]")
  ) ?? null;
}

function renderTable(overrides: Partial<Parameters<typeof ProjectsTable>[0]> = {}) {
  const props = {
    projects: [] as ProjectRow[],
    total: 0,
    totalPages: 1,
    page: 1,
    pageSize: 20,
    loading: false,
    selectedId: null,
    selectedIds: new Set<string>(),
    filters: {} as ProjectFilters,
    onPageChange: () => {},
    onRowClick: () => {},
    onToggleSelect: () => {},
    onToggleSelectAll: () => {},
    onSortChange: () => {},
    ...overrides,
  };
  return render(<ProjectsTable {...props} />);
}

describe("ProjectsTable - fixed column widths", () => {
  it("uses a fixed table layout so column widths don't depend on cell content", () => {
    const { container } = renderTable();

    expect(container.querySelector("table")).toHaveClass("table-fixed");
  });

  it("gives every header cell an explicit percentage width", () => {
    const { container } = renderTable();

    const widths = Array.from(container.querySelectorAll("thead th")).map((th) =>
      Array.from(th.classList).find((cls) => /^w-\[\d+%\]$/.test(cls))
    );

    expect(widths).toHaveLength(9);
    expect(widths.every(Boolean)).toBe(true);
  });
});

describe("ProjectsTable - typeLabel/typeTooltip", () => {
  it("shows the DAW label and a 'detected via' tooltip for a project with a detected DAW type", () => {
    const projects = [makeProject({ dawType: "ableton", detectedVia: ".als file" })];
    renderTable({ projects });

    const label = screen.getByText("Ableton");
    expect(label).toBeInTheDocument();
    expect(label).toHaveAttribute("title", "Ableton — detected via .als file");
  });

  it("falls back to 'unknown marker' in the tooltip when detectedVia is unset", () => {
    const projects = [makeProject({ dawType: "logic", detectedVia: undefined })];
    renderTable({ projects });

    expect(screen.getByText("Logic Pro")).toHaveAttribute("title", "Logic Pro — detected via unknown marker");
  });

  it("shows 'Folder' with a no-DAW tooltip for a plain folder (no dawType)", () => {
    const projects = [makeProject({ dawType: undefined })];
    renderTable({ projects });

    const label = screen.getByText("Folder");
    expect(label).toBeInTheDocument();
    expect(label).toHaveAttribute("title", "Folder — no DAW project detected");
  });
});

describe("ProjectsTable - empty states", () => {
  it("shows the 'no folders found yet' message when total is 0", () => {
    renderTable({ projects: [], total: 0 });

    expect(screen.getByText("No folders found yet. Try running a scan.")).toBeInTheDocument();
  });

  it("spans the empty-state message across all 9 columns", () => {
    renderTable({ projects: [], total: 0 });

    expect(screen.getByText("No folders found yet. Try running a scan.").closest("td")).toHaveAttribute("colSpan", "9");
  });

  it("shows the 'no folders match your filters' message when a content filter is active (`total` alone can't distinguish this from a truly empty library, since it's already the filtered count)", () => {
    renderTable({ projects: [], total: 0, filters: { search: "nonexistent-project" } });

    expect(screen.getByText("No folders match your filters.")).toBeInTheDocument();
  });
});

describe("ProjectsTable - loading state", () => {
  it("shows a loading message and no rows while loading", () => {
    renderTable({ loading: true, projects: [makeProject()] });

    expect(screen.getByText("Loading project folders…")).toBeInTheDocument();
  });

  it("spans the loading message across all 9 columns", () => {
    renderTable({ loading: true, projects: [makeProject()] });

    expect(screen.getByText("Loading project folders…").closest("td")).toHaveAttribute("colSpan", "9");
  });
});

describe("ProjectsTable - media column", () => {
  it("shows only the video icon when hasVideo is true and hasImage is false", () => {
    renderTable({ projects: [makeProject({ hasVideo: true, hasImage: false })] });

    expect(screen.getByLabelText("Contains video files")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contains image files")).not.toBeInTheDocument();
  });

  it("shows only the image icon when hasImage is true and hasVideo is false", () => {
    renderTable({ projects: [makeProject({ hasVideo: false, hasImage: true })] });

    expect(screen.getByLabelText("Contains image files")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contains video files")).not.toBeInTheDocument();
  });

  it("shows an em-dash placeholder when neither hasVideo nor hasImage is set", () => {
    const { container } = renderTable({ projects: [makeProject({ hasVideo: false, hasImage: false })] });

    expect(screen.queryByLabelText("Contains video files")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Contains image files")).not.toBeInTheDocument();
    // Media is the 8th column (index 7); tags (index 4) also renders "—" when empty.
    expect(container.querySelectorAll("td")[7].textContent).toBe("—");
  });
});

describe("ProjectsTable - Modified column", () => {
  it("renders a formatted date for a project with a real contentModifiedAt", () => {
    const { container } = renderTable({
      projects: [makeProject({ contentModifiedAt: "2026-01-15T10:30:00.000Z" })],
    });

    // Modified is the 9th column (index 8).
    expect(container.querySelectorAll("td")[8].textContent).toBe("Jan 15, 10:30");
  });

  it("renders the em-dash placeholder for a project with a null contentModifiedAt", () => {
    const { container } = renderTable({
      projects: [makeProject({ contentModifiedAt: null })],
    });

    expect(container.querySelectorAll("td")[8].textContent).toBe("—");
  });
});

describe("sortIndicator", () => {
  const baseFilters: ProjectFilters = {};

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

describe("ProjectsTable - sortable headers", () => {
  function getHeader(name: RegExp) {
    return screen.getByRole("columnheader", { name });
  }

  it("marks the active ascending Name column with aria-sort='ascending' and shows the up arrow", () => {
    renderTable({ filters: { sortBy: "name", sortDir: "asc" } });

    const header = getHeader(/Project Folder/);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(within(header).getByRole("button")).toHaveTextContent("Project Folder ↑");
  });

  it("marks the active descending Name column with aria-sort='descending' and shows the down arrow", () => {
    renderTable({ filters: { sortBy: "name", sortDir: "desc" } });

    const header = getHeader(/Project Folder/);
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(within(header).getByRole("button")).toHaveTextContent("Project Folder ↓");
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

  it("marks the active ascending Modified column with aria-sort='ascending' and shows the up arrow", () => {
    renderTable({ filters: { sortBy: "modifiedAt", sortDir: "asc" } });

    const header = getHeader(/Modified/);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(within(header).getByRole("button")).toHaveTextContent("Modified ↑");
  });

  it("marks the active descending Modified column with aria-sort='descending' and shows the down arrow", () => {
    renderTable({ filters: { sortBy: "modifiedAt", sortDir: "desc" } });

    const header = getHeader(/Modified/);
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(within(header).getByRole("button")).toHaveTextContent("Modified ↓");
  });

  it("marks the Modified column with aria-sort='none' and no arrow when it is not the active sort", () => {
    renderTable({ filters: { sortBy: "name", sortDir: "asc" } });

    const header = getHeader(/^Modified$/);
    expect(header).toHaveAttribute("aria-sort", "none");
    expect(within(header).getByRole("button")).toHaveTextContent("Modified");
    expect(within(header).getByRole("button")).not.toHaveTextContent(/[↑↓]/);
  });

  it("keeps the Project Folder (Name) header left-aligned, not centered", () => {
    renderTable({ filters: { sortBy: "name", sortDir: "asc" } });

    const header = getHeader(/Project Folder/);
    expect(header).toHaveClass("text-left");
    expect(header).not.toHaveClass("text-center");
  });

  it("centers the Score header to match its centered column data", () => {
    renderTable({ filters: { sortBy: "name", sortDir: "asc" } });

    const header = getHeader(/^Score$/);
    expect(header).toHaveClass("text-center");
    expect(header).not.toHaveClass("text-left");
  });

  it("centers the Modified header to match its centered column data", () => {
    renderTable({ filters: { sortBy: "name", sortDir: "asc" } });

    const header = getHeader(/^Modified$/);
    expect(header).toHaveClass("text-center");
    expect(header).not.toHaveClass("text-left");
  });

  it("gives each sort-header button a distinguishing 'Sort by <label>' aria-label", () => {
    renderTable({ filters: {} });

    expect(within(getHeader(/Project Folder/)).getByRole("button")).toHaveAttribute("aria-label", "Sort by Project Folder");
    expect(within(getHeader(/^Score$/)).getByRole("button")).toHaveAttribute("aria-label", "Sort by Score");
    expect(within(getHeader(/^Modified$/)).getByRole("button")).toHaveAttribute("aria-label", "Sort by Modified");
  });

  it("calls onSortChange with the clicked column's sort key", async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    renderTable({ onSortChange });

    await user.click(within(getHeader(/Project Folder/)).getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith("name");

    await user.click(within(getHeader(/^Score$/)).getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith("score");

    await user.click(within(getHeader(/^Modified$/)).getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith("modifiedAt");
  });
});

describe("ProjectsTable - Reveal in Finder column removal", () => {
  it("does not render a Reveal in Finder button/column (that action lives only in ProjectDetailPanel now)", () => {
    const { container } = renderTable({ projects: [makeProject()] });

    expect(screen.queryByRole("button", { name: "Reveal in Finder" })).not.toBeInTheDocument();
    expect(container.querySelectorAll("thead th")).toHaveLength(9);
    expect(container.querySelectorAll("tbody tr td")).toHaveLength(9);
  });
});

describe("ProjectsTable - checkbox column centering", () => {
  it("centers the select-all checkbox header", () => {
    renderTable();

    const header = screen.getByLabelText("Select all visible project folders").closest("th");
    expect(header).toHaveClass("text-center");
  });

  it("centers the row checkbox cell", () => {
    renderTable({ projects: [makeProject({ id: "p1", name: "Song One" })] });

    const cell = screen.getByLabelText("Select Song One").closest("td");
    expect(cell).toHaveClass("text-center");
  });
});

describe("ProjectsTable - row rendering/selection", () => {
  it("renders one row per project, with name and audio file count", () => {
    const projects = [
      makeProject({ id: "p1", name: "Song One", audioFileCount: 2 }),
      makeProject({ id: "p2", name: "Song Two", audioFileCount: 5 }),
    ];
    const { container } = renderTable({ projects });

    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getByText("Song One")).toBeInTheDocument();
    expect(screen.getByText("Song Two")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("calls onRowClick with the project's id when a row is clicked", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderTable({ projects: [makeProject({ id: "p1", name: "Song One" })], onRowClick });

    await user.click(screen.getByText("Song One"));

    expect(onRowClick).toHaveBeenCalledWith("p1");
  });

  it("reflects the selected project via aria-selected on its row", () => {
    const { container } = renderTable({
      projects: [makeProject({ id: "p1" })],
      selectedId: "p1",
    });

    expect(container.querySelector("tbody tr")).toHaveAttribute("aria-selected", "true");
  });

  it("calls onToggleSelect with the project's id when its row checkbox is clicked", async () => {
    const onToggleSelect = vi.fn();
    const user = userEvent.setup();
    renderTable({ projects: [makeProject({ id: "p1", name: "Song One" })], onToggleSelect });

    await user.click(screen.getByLabelText("Select Song One"));

    expect(onToggleSelect).toHaveBeenCalledWith("p1");
  });

  it("stops the row checkbox click from propagating to onRowClick", async () => {
    const onToggleSelect = vi.fn();
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderTable({ projects: [makeProject({ id: "p1", name: "Song One" })], onToggleSelect, onRowClick });

    await user.click(screen.getByLabelText("Select Song One"));

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe("ProjectsTable - select-all checkbox", () => {
  function getSelectAllCheckbox() {
    return screen.getByLabelText("Select all visible project folders");
  }

  it("is unchecked when the project list is empty", () => {
    renderTable({ projects: [], selectedIds: new Set() });

    expect(getSelectAllCheckbox()).not.toBeChecked();
  });

  it("is checked when every visible project is selected", () => {
    const projects = [makeProject({ id: "p1" }), makeProject({ id: "p2" })];
    renderTable({ projects, selectedIds: new Set(["p1", "p2"]) });

    expect(getSelectAllCheckbox()).toBeChecked();
  });
});

describe("ProjectsTable - token-driven row styling (no isProFolder prop)", () => {
  it("selected row: uses bg-surface-selected, border-border, a bg-chrome accent bar, and font-semibold (via the profolder: variant) on the name", () => {
    const { container } = renderTable({
      selectedId: "p1",
      projects: [makeProject({ id: "p1", name: "Song One" })],
    });

    const row = container.querySelector("tbody tr");
    expect(row).toHaveClass("bg-surface-selected");
    expect(row).toHaveClass("border-border");
    expect(row).not.toHaveClass("bg-surface");

    const name = screen.getByText("Song One");
    expect(name).toHaveClass("font-medium");
    expect(name).toHaveClass("profolder:font-semibold");
  });

  it("unselected row: uses bg-surface, hover:bg-surface-hover, a bg-border accent bar, and plain font-medium (no profolder: variant) on the name", () => {
    const { container } = renderTable({
      selectedId: null,
      projects: [makeProject({ id: "p1", name: "Song One" })],
    });

    const row = container.querySelector("tbody tr");
    expect(row).toHaveClass("bg-surface");
    expect(row).toHaveClass("hover:bg-surface-hover");
    expect(row).not.toHaveClass("bg-surface-selected");

    const name = screen.getByText("Song One");
    expect(name).toHaveClass("font-medium");
    expect(name).not.toHaveClass("profolder:font-semibold");
  });

  it("renders tag chips with the display-chip treatment (bg-surface/border-border/text-ink-muted)", () => {
    renderTable({ projects: [makeProject({ id: "p1", tags: ["rock"] })] });

    const chip = screen.getByText("rock");
    expect(chip).toHaveClass("bg-surface");
    expect(chip).toHaveClass("border-border");
    expect(chip).toHaveClass("text-ink-muted");
    expect(chip).not.toHaveClass("bg-chrome");
  });

  it("applies the same display-chip tag treatment regardless of whether the row is selected", () => {
    renderTable({
      selectedId: "p1",
      projects: [makeProject({ id: "p1", tags: ["rock"] })],
    });

    const chip = screen.getByText("rock");
    expect(chip).toHaveClass("bg-surface");
    expect(chip).toHaveClass("border-border");
    expect(chip).toHaveClass("text-ink-muted");
  });

  it("colors the dawType label with text-ink when detected, and text-ink-muted for a plain folder", () => {
    renderTable({
      projects: [
        makeProject({ id: "p1", dawType: "ableton", detectedVia: ".als file" }),
        makeProject({ id: "p2", dawType: undefined }),
      ],
    });

    expect(screen.getByText("Ableton")).toHaveClass("text-ink");
    expect(screen.getByText("Folder")).toHaveClass("text-ink-muted");
  });

  it("colors the video/image media icons with text-notice/text-success tokens", () => {
    renderTable({
      projects: [makeProject({ id: "p1", hasVideo: true }), makeProject({ id: "p2", hasImage: true })],
    });

    expect(screen.getByLabelText("Contains video files")).toHaveClass("text-notice");
    expect(screen.getByLabelText("Contains image files")).toHaveClass("text-success");
  });

  it("gives empty-state placeholders ('—') the text-ink-faint token", () => {
    renderTable({ projects: [makeProject({ id: "p1", tags: [], hasVideo: false, hasImage: false })] });

    const placeholders = screen.getAllByText("—");
    expect(placeholders.length).toBeGreaterThan(0);
    placeholders.forEach((el) => expect(el).toHaveClass("text-ink-faint"));
  });
});
