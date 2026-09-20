import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetricsPanel from "../MetricsPanel.js";
import type { LibraryStats, MetricsSettings, TagCounts } from "../../api/client.js";
import { StatusCatalogProvider } from "../../contexts/StatusCatalogContext.js";
import type { StatusDef } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getStatuses: vi.fn(),
  getMetricsSettings: vi.fn(),
  setMetricsSettings: vi.fn(),
  getTagCounts: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetStatuses = vi.mocked(api.getStatuses);
const mockGetMetricsSettings = vi.mocked(api.getMetricsSettings);
const mockSetMetricsSettings = vi.mocked(api.setMetricsSettings);
const mockGetTagCounts = vi.mocked(api.getTagCounts);

const CATALOG_STATUSES: StatusDef[] = [
  { key: "draft", name: "Draft", color: "#a1b2c3", sortOrder: 1, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "needs_mixing", name: "Need Mixing", color: "#b2c3a1", sortOrder: 2, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "done", name: "Done", color: "#c3a1b2", sortOrder: 3, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "released", name: "Released", color: "#a1c3b2", sortOrder: 4, createdAt: "2024-01-01T00:00:00.000Z" },
];

const STATS: LibraryStats = {
  projects: {
    total: 100,
    byStatus: { unknown: 1, draft: 2, needs_mixing: 3, done: 4, released: 5 },
  },
  files: {
    total: 200,
    byStatus: { unknown: 6, draft: 7, needs_mixing: 8, done: 9, released: 10 },
  },
};

const DEFAULT_SETTINGS: MetricsSettings = {
  projectsMetrics: [{ type: "total" }, { type: "status", key: "unknown" }],
  filesMetrics: [{ type: "total" }, { type: "status", key: "unknown" }],
};

const EMPTY_TAG_COUNTS: TagCounts = { files: {}, projects: {} };

function renderPanel(overrides: Partial<Parameters<typeof MetricsPanel>[0]> = {}) {
  const props = {
    stats: STATS as LibraryStats | undefined,
    lastScanChanges: null as number | null,
    allTags: [] as string[],
    onClose: vi.fn(),
    ...overrides,
  };
  return {
    ...render(
      <StatusCatalogProvider>
        <MetricsPanel {...props} />
      </StatusCatalogProvider>
    ),
    props,
  };
}

beforeEach(() => {
  mockGetStatuses.mockReset().mockResolvedValue(CATALOG_STATUSES);
  mockGetMetricsSettings.mockReset().mockResolvedValue(DEFAULT_SETTINGS);
  mockSetMetricsSettings.mockReset();
  mockGetTagCounts.mockReset().mockResolvedValue(EMPTY_TAG_COUNTS);
});

/** Scopes queries to just the section whose heading text matches (Projects / Audio Files),
 * since both sections render structurally identical tiles/controls. */
function getSection(title: "Projects" | "Audio Files") {
  const heading = screen.getByText(title);
  // The heading's parent is the section's own title row; its next sibling holds the tiles/add-form.
  const container = heading.closest("div")!.parentElement!;
  return within(container as HTMLElement);
}

describe("MetricsPanel - default view", () => {
  it("shows Total + Unknown in both sections when nothing has been customized", async () => {
    renderPanel();

    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    const projects = getSection("Projects");
    expect(projects.getByText("Total")).toBeInTheDocument();
    expect(projects.getByText("100")).toBeInTheDocument();
    expect(projects.getByText("Unknown")).toBeInTheDocument();
    expect(projects.getByText("1")).toBeInTheDocument();

    const files = getSection("Audio Files");
    expect(files.getByText("Total")).toBeInTheDocument();
    expect(files.getByText("200")).toBeInTheDocument();
    expect(files.getByText("Unknown")).toBeInTheDocument();
    expect(files.getByText("6")).toBeInTheDocument();
  });

  it("renders the optimistic default before the settings fetch resolves (no empty flash)", () => {
    // Never resolves during this test — proves the initial render already shows the default
    // shape rather than an empty/blank panel while the request is in flight.
    mockGetMetricsSettings.mockReturnValue(new Promise(() => {}));
    renderPanel();

    expect(screen.getAllByText("Total")).toHaveLength(2);
    expect(screen.getAllByText("Unknown")).toHaveLength(2);
  });
});

describe("MetricsPanel - cross-section independence", () => {
  it("adding a metric to Projects never affects Files, and the PUT patch never includes the other section's key", async () => {
    const user = userEvent.setup();
    mockSetMetricsSettings.mockResolvedValue({
      projectsMetrics: [{ type: "total" }, { type: "status", key: "unknown" }, { type: "status", key: "draft" }],
      filesMetrics: DEFAULT_SETTINGS.filesMetrics,
    });
    renderPanel();
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Add metric to Projects" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "New Projects metric type" }), "status");
    await user.selectOptions(screen.getByRole("combobox", { name: "New Projects metric value" }), "draft");
    await user.click(screen.getByRole("button", { name: "Confirm adding Projects metric" }));

    await waitFor(() => expect(mockSetMetricsSettings).toHaveBeenCalledTimes(1));
    const patch = mockSetMetricsSettings.mock.calls[0][0];
    expect(patch).toHaveProperty("projectsMetrics");
    expect(patch).not.toHaveProperty("filesMetrics");

    const files = getSection("Audio Files");
    expect(files.getByText("Total")).toBeInTheDocument();
    expect(files.getByText("Unknown")).toBeInTheDocument();
    expect(files.queryByText("Draft")).not.toBeInTheDocument();

    const projects = getSection("Projects");
    await waitFor(() => expect(projects.getByText("Draft")).toBeInTheDocument());
  });

  it("removing a metric from Files never affects Projects, and the PUT patch never includes the other section's key", async () => {
    const user = userEvent.setup();
    mockSetMetricsSettings.mockResolvedValue({
      projectsMetrics: DEFAULT_SETTINGS.projectsMetrics,
      filesMetrics: [{ type: "total" }],
    });
    renderPanel();
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Remove Unknown from Audio Files metrics" }));

    await waitFor(() => expect(mockSetMetricsSettings).toHaveBeenCalledTimes(1));
    const patch = mockSetMetricsSettings.mock.calls[0][0];
    expect(patch).toHaveProperty("filesMetrics");
    expect(patch).not.toHaveProperty("projectsMetrics");

    const projects = getSection("Projects");
    expect(projects.getByText("Unknown")).toBeInTheDocument();

    const files = getSection("Audio Files");
    await waitFor(() => expect(files.queryByText("Unknown")).not.toBeInTheDocument());
  });
});

describe("MetricsPanel - add flow", () => {
  it("adds a status metric and renders its tile with the correct count", async () => {
    const user = userEvent.setup();
    mockSetMetricsSettings.mockResolvedValue({
      projectsMetrics: [...DEFAULT_SETTINGS.projectsMetrics, { type: "status", key: "done" }],
      filesMetrics: DEFAULT_SETTINGS.filesMetrics,
    });
    renderPanel();
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Add metric to Projects" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "New Projects metric type" }), "status");
    await user.selectOptions(screen.getByRole("combobox", { name: "New Projects metric value" }), "done");
    await user.click(screen.getByRole("button", { name: "Confirm adding Projects metric" }));

    expect(mockSetMetricsSettings).toHaveBeenCalledWith({
      projectsMetrics: [{ type: "total" }, { type: "status", key: "unknown" }, { type: "status", key: "done" }],
    });

    const projects = getSection("Projects");
    await waitFor(() => expect(projects.getByText("Done")).toBeInTheDocument());
    expect(projects.getByText("4")).toBeInTheDocument();
  });

  it("adds a total metric to a section that doesn't already have one", async () => {
    const user = userEvent.setup();
    mockGetMetricsSettings.mockResolvedValue({
      projectsMetrics: [{ type: "status", key: "unknown" }],
      filesMetrics: DEFAULT_SETTINGS.filesMetrics,
    });
    mockSetMetricsSettings.mockResolvedValue({
      projectsMetrics: [{ type: "status", key: "unknown" }, { type: "total" }],
      filesMetrics: DEFAULT_SETTINGS.filesMetrics,
    });
    renderPanel();
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    const projects = getSection("Projects");
    await waitFor(() => expect(projects.queryByText("Total")).not.toBeInTheDocument());

    await user.click(projects.getByRole("button", { name: "Add metric to Projects" }));
    // Total is the default/first available type since status options aren't exhausted but
    // total is the only type missing from this section — assert it's selected without a second select.
    const typeSelect = screen.getByRole("combobox", { name: "New Projects metric type" }) as HTMLSelectElement;
    expect(typeSelect.value).toBe("total");
    expect(screen.queryByRole("combobox", { name: "New Projects metric value" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm adding Projects metric" }));

    expect(mockSetMetricsSettings).toHaveBeenCalledWith({
      projectsMetrics: [{ type: "status", key: "unknown" }, { type: "total" }],
    });
    await waitFor(() => expect(getSection("Projects").getByText("Total")).toBeInTheDocument());
  });

  it("adds a tag metric, fetches tag counts split by section, and renders the count", async () => {
    const user = userEvent.setup();
    mockGetMetricsSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockSetMetricsSettings.mockResolvedValue({
      projectsMetrics: [...DEFAULT_SETTINGS.projectsMetrics, { type: "tag", name: "mixed" }],
      filesMetrics: DEFAULT_SETTINGS.filesMetrics,
    });
    // Real TagCounts shape per frontend/src/api/client.ts: { files: Record<string,number>, projects: Record<string,number> }.
    mockGetTagCounts.mockResolvedValue({ files: {}, projects: { mixed: 42 } });

    renderPanel({ allTags: ["mixed", "loud"] });
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Add metric to Projects" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "New Projects metric type" }), "tag");
    await user.selectOptions(screen.getByRole("combobox", { name: "New Projects metric value" }), "mixed");
    await user.click(screen.getByRole("button", { name: "Confirm adding Projects metric" }));

    await waitFor(() =>
      expect(mockGetTagCounts).toHaveBeenCalledWith([], ["mixed"])
    );

    const projects = getSection("Projects");
    await waitFor(() => expect(projects.getByText("mixed")).toBeInTheDocument());
    expect(projects.getByText("42")).toBeInTheDocument();
  });
});

describe("MetricsPanel - remove flow", () => {
  it("removes a metric via the correct PUT patch and the tile disappears from that section only", async () => {
    const user = userEvent.setup();
    mockSetMetricsSettings.mockResolvedValue({
      projectsMetrics: [{ type: "total" }],
      filesMetrics: DEFAULT_SETTINGS.filesMetrics,
    });
    renderPanel();
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Remove Unknown from Projects metrics" }));

    expect(mockSetMetricsSettings).toHaveBeenCalledWith({ projectsMetrics: [{ type: "total" }] });

    const projects = getSection("Projects");
    await waitFor(() => expect(projects.queryByText("Unknown")).not.toBeInTheDocument());
    expect(projects.getByText("Total")).toBeInTheDocument();

    const files = getSection("Audio Files");
    expect(files.getByText("Unknown")).toBeInTheDocument();
  });

  it("surfaces a PUT failure inline and does not remove the tile", async () => {
    const user = userEvent.setup();
    mockSetMetricsSettings.mockRejectedValue(new Error("Server exploded"));
    renderPanel();
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Remove Unknown from Projects metrics" }));

    await waitFor(() => expect(screen.getByText("Server exploded")).toBeInTheDocument());
    const projects = getSection("Projects");
    expect(projects.getByText("Unknown")).toBeInTheDocument();
  });
});

describe("MetricsPanel - add picker exclusions", () => {
  it("excludes already-chosen values from the add picker (can't add Unknown twice)", async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Add metric to Projects" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "New Projects metric type" }), "status");

    const valueSelect = screen.getByRole("combobox", { name: "New Projects metric value" });
    expect(within(valueSelect).queryByRole("option", { name: "Unknown" })).not.toBeInTheDocument();
    expect(within(valueSelect).getByRole("option", { name: "Draft" })).toBeInTheDocument();
  });

  it("hides the add affordance once every possible metric is already chosen (exhausted)", async () => {
    mockGetMetricsSettings.mockResolvedValue({
      projectsMetrics: [
        { type: "total" },
        { type: "status", key: "unknown" },
        { type: "status", key: "draft" },
        { type: "status", key: "needs_mixing" },
        { type: "status", key: "done" },
        { type: "status", key: "released" },
      ],
      filesMetrics: DEFAULT_SETTINGS.filesMetrics,
    });
    renderPanel({ allTags: [] });
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(getSection("Projects").getByText("Released")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Add metric to Projects" })).not.toBeInTheDocument();
    // Files section is still at the default, so its own add affordance remains available.
    expect(screen.getByRole("button", { name: "Add metric to Audio Files" })).toBeInTheDocument();
  });
});

describe("MetricsPanel - empty section", () => {
  it("shows 'No metrics selected.' when a section's array is empty", async () => {
    mockGetMetricsSettings.mockResolvedValue({
      projectsMetrics: [],
      filesMetrics: DEFAULT_SETTINGS.filesMetrics,
    });
    renderPanel();
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    const projects = getSection("Projects");
    await waitFor(() => expect(projects.getByText("No metrics selected.")).toBeInTheDocument());
  });
});

describe("MetricsPanel - stale metric reference tolerance", () => {
  it("renders a status referencing a deleted catalog key using the raw key as a fallback label, without crashing", async () => {
    mockGetMetricsSettings.mockResolvedValue({
      projectsMetrics: [{ type: "total" }, { type: "status", key: "some-deleted-key" }],
      filesMetrics: DEFAULT_SETTINGS.filesMetrics,
    });
    renderPanel();
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    const projects = getSection("Projects");
    await waitFor(() => expect(projects.getByText("some-deleted-key")).toBeInTheDocument());
  });
});

describe("MetricsPanel - accessible-name disambiguation", () => {
  it("uniquely targets each section's controls when both add-forms are open simultaneously", async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Add metric to Projects" }));
    await user.click(screen.getByRole("button", { name: "Add metric to Audio Files" }));

    // This is the regression test for the accessible-name-collision hazard: if the aria-labels
    // didn't embed the section title, each of these queries would throw on finding 2 matches.
    expect(screen.getByRole("combobox", { name: "New Projects metric type" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "New Audio Files metric type" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel adding Projects metric" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel adding Audio Files metric" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm adding Projects metric" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm adding Audio Files metric" })).toBeInTheDocument();

    // Switch both to "status" so the value select also renders, and confirm those are disambiguated too.
    await user.selectOptions(screen.getByRole("combobox", { name: "New Projects metric type" }), "status");
    await user.selectOptions(screen.getByRole("combobox", { name: "New Audio Files metric type" }), "status");
    expect(screen.getByRole("combobox", { name: "New Projects metric value" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "New Audio Files metric value" })).toBeInTheDocument();
  });

  it("does not produce a remove-button label colliding across sections for the same metric label", async () => {
    renderPanel();
    await waitFor(() => expect(mockGetMetricsSettings).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("button", { name: "Remove Unknown from Projects metrics" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Unknown from Audio Files metrics" })).toBeInTheDocument();
  });
});

describe("MetricsPanel - last scan status", () => {
  it("shows 'No scans yet' when lastScanChanges is null", () => {
    renderPanel({ lastScanChanges: null });

    expect(screen.getByText("No scans yet")).toBeInTheDocument();
  });

  it("shows 'No changes' when lastScanChanges is 0", () => {
    renderPanel({ lastScanChanges: 0 });

    expect(screen.getByText("No changes")).toBeInTheDocument();
  });

  it("shows '+N changed' when lastScanChanges is a positive number", () => {
    renderPanel({ lastScanChanges: 7 });

    expect(screen.getByText("+7 changed")).toBeInTheDocument();
  });
});

describe("MetricsPanel - dismiss behavior", () => {
  it("calls onClose when clicking outside the panel", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });

    await user.click(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the panel", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });

    await user.click(screen.getByRole("dialog", { name: "Library metrics" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });

    await user.click(screen.getByRole("button", { name: "Close metrics panel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
