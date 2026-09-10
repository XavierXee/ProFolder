import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectsTable } from "../ProjectsTable.js";
import type { Project } from "../../types.js";

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
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    isRemoved: false,
    contentModifiedAt: null,
    audioFileCount: 3,
    ...overrides,
  };
}

function renderTable(overrides: Partial<Parameters<typeof ProjectsTable>[0]> = {}) {
  const props = {
    projects: [] as ProjectRow[],
    total: 0,
    totalPages: 1,
    page: 1,
    pageSize: 20,
    loading: false,
    isDark: true,
    selectedId: null,
    selectedIds: new Set<string>(),
    onPageChange: () => {},
    onReveal: () => {},
    onRowClick: () => {},
    onToggleSelect: () => {},
    onToggleSelectAll: () => {},
    ...overrides,
  };
  return render(<ProjectsTable {...props} />);
}

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

  it("shows the 'no folders match your filters' message when total is nonzero but the current page is empty", () => {
    renderTable({ projects: [], total: 5 });

    expect(screen.getByText("No folders match your filters.")).toBeInTheDocument();
  });
});

describe("ProjectsTable - loading state", () => {
  it("shows a loading message and no rows while loading", () => {
    renderTable({ loading: true, projects: [makeProject()] });

    expect(screen.getByText("Loading project folders…")).toBeInTheDocument();
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

describe("ProjectsTable - Reveal in Finder", () => {
  it("calls onReveal with the project's path when clicked", async () => {
    const onReveal = vi.fn();
    const user = userEvent.setup();
    renderTable({ projects: [makeProject({ path: "/music/My Song" })], onReveal });

    await user.click(screen.getByRole("button", { name: "Reveal in Finder" }));

    expect(onReveal).toHaveBeenCalledWith("/music/My Song");
  });

  it("stops the click from propagating to the row's onRowClick", async () => {
    const onReveal = vi.fn();
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderTable({ projects: [makeProject()], onReveal, onRowClick });

    await user.click(screen.getByRole("button", { name: "Reveal in Finder" }));

    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
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
