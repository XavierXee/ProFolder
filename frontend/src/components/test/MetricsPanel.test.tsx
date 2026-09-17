import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetricsPanel from "../MetricsPanel.js";
import type { LibraryStats } from "../../api/client.js";

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
  return { ...render(<MetricsPanel {...props} />), props };
}

describe("MetricsPanel - stats fallback", () => {
  it("renders zeroed tiles for both sections when stats is undefined (not yet loaded)", () => {
    renderPanel({ stats: undefined });

    expect(screen.getAllByText("Projects")).toHaveLength(1);
    expect(screen.getAllByText("Audio Files")).toHaveLength(1);
    expect(screen.getAllByText("Total")).toHaveLength(2);
    // 2 sections x (Total + 5 statuses) = 12 zeroed tiles.
    expect(screen.getAllByText("0")).toHaveLength(12);
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

  it("renders the Projects total and per-status counts", () => {
    renderPanel();

    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders the Audio Files total and per-status counts", () => {
    renderPanel();

    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("uses STATUS_LABELS display text for each status row, once per section", () => {
    renderPanel();

    expect(screen.getAllByText("Unknown")).toHaveLength(2);
    expect(screen.getAllByText("Draft")).toHaveLength(2);
    expect(screen.getAllByText("Need Mixing")).toHaveLength(2);
    expect(screen.getAllByText("Done")).toHaveLength(2);
    expect(screen.getAllByText("Released")).toHaveLength(2);
  });

  it("does not render any unscored tile or label", () => {
    renderPanel();

    expect(screen.queryByText(/unscored/i)).not.toBeInTheDocument();
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
