import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetricsPanel from "../MetricsPanel.js";
import type { LibraryStats } from "../../api/client.js";
import { StatusCatalogProvider } from "../../contexts/StatusCatalogContext.js";
import type { StatusDef } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getStatuses: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetStatuses = vi.mocked(api.getStatuses);

// Matches the pre-catalog fixed 5-status list (unknown + these 4), so the pre-existing
// count-based assertions ("12 zeroed tiles", etc.) keep meaning what they did before Task 4.
const CATALOG_STATUSES: StatusDef[] = [
  { key: "draft", name: "Draft", color: "#a1b2c3", sortOrder: 1, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "needs_mixing", name: "Need Mixing", color: "#b2c3a1", sortOrder: 2, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "done", name: "Done", color: "#c3a1b2", sortOrder: 3, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "released", name: "Released", color: "#a1c3b2", sortOrder: 4, createdAt: "2024-01-01T00:00:00.000Z" },
];

// Values are deliberately all distinct across both entities/every status so each can be
// asserted on unambiguously via getByText without needing to scope into a section container.
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

function renderPanel(overrides: Partial<Parameters<typeof MetricsPanel>[0]> = {}) {
  const props = {
    stats: STATS as LibraryStats | undefined,
    lastScanChanges: null as number | null,
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
});

describe("MetricsPanel - stats fallback", () => {
  it("renders zeroed tiles for both sections when stats is undefined (not yet loaded)", async () => {
    renderPanel({ stats: undefined });

    expect(screen.getAllByText("Projects")).toHaveLength(1);
    expect(screen.getAllByText("Audio Files")).toHaveLength(1);
    expect(screen.getAllByText("Total")).toHaveLength(2);
    // 2 sections x (Total + 5 statuses [unknown + 4 catalog]) = 12 zeroed tiles.
    await waitFor(() => expect(screen.getAllByText("0")).toHaveLength(12));
  });
});

describe("MetricsPanel - two-section per-status breakdown", () => {
  it("renders a Projects section before an Audio Files section", () => {
    const { container } = renderPanel();

    const projectsIdx = container.textContent!.indexOf("Projects");
    const filesIdx = container.textContent!.indexOf("Audio Files");
    expect(projectsIdx).toBeGreaterThanOrEqual(0);
    expect(filesIdx).toBeGreaterThan(projectsIdx);
  });

  it("renders the Projects total and per-status counts", async () => {
    renderPanel();

    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders the Audio Files total and per-status counts", async () => {
    renderPanel();

    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("uses the catalog status name (or STATUS_LABELS.unknown for the sentinel) for each status row, once per section", async () => {
    renderPanel();

    expect(screen.getAllByText("Unknown")).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByText("Draft")).toHaveLength(2));
    expect(screen.getAllByText("Need Mixing")).toHaveLength(2);
    expect(screen.getAllByText("Done")).toHaveLength(2);
    expect(screen.getAllByText("Released")).toHaveLength(2);
  });

  it("does not render any unscored tile or label", () => {
    renderPanel();

    expect(screen.queryByText(/unscored/i)).not.toBeInTheDocument();
  });

  it("renders a custom (non-default) catalog status's breakdown tile, reading its count via a defensive `?? 0` lookup", async () => {
    mockGetStatuses.mockReset().mockResolvedValue([
      { key: "mastering", name: "Mastering", color: "#123456", sortOrder: 1, createdAt: "2024-01-01T00:00:00.000Z" },
    ]);
    const stats: LibraryStats = {
      projects: { total: 3, byStatus: { unknown: 1, mastering: 2 } },
      files: { total: 0, byStatus: {} },
    };
    renderPanel({ stats });

    await waitFor(() => expect(screen.getAllByText("Mastering")).toHaveLength(2));
    expect(screen.getByText("2")).toBeInTheDocument();
    // The Audio Files section has no "mastering" entry in its byStatus at all — the `?? 0`
    // fallback must render "0" rather than blowing up on `undefined`.
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
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
