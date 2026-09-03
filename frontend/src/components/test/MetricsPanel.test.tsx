import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetricsPanel from "../MetricsPanel.js";
import type { LibraryStats } from "../../api/client.js";

function renderPanel(overrides: Partial<Parameters<typeof MetricsPanel>[0]> = {}) {
  const props = {
    stats: { total: 42, draftCount: 10, unscoredCount: 3 } as LibraryStats | undefined,
    lastScanChanges: null as number | null,
    isDark: true,
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<MetricsPanel {...props} />), props };
}

describe("MetricsPanel - stats fallback", () => {
  it("renders zeroed tiles when stats is undefined (not yet loaded)", () => {
    renderPanel({ stats: undefined });

    expect(screen.getByText("Total Files")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Unscored")).toBeInTheDocument();
    const zeros = screen.getAllByText("0");
    expect(zeros).toHaveLength(3);
  });

  it("renders the real values when stats is provided", () => {
    renderPanel({ stats: { total: 42, draftCount: 10, unscoredCount: 3 } });

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("MetricsPanel - unscoredCount highlight", () => {
  it("applies highlight styling to the Unscored tile value when unscoredCount > 0", () => {
    renderPanel({ stats: { total: 42, draftCount: 10, unscoredCount: 3 }, isDark: true });

    expect(screen.getByText("3")).toHaveClass("text-purple-400");
  });

  it("uses the light-mode highlight class when isDark is false", () => {
    renderPanel({ stats: { total: 42, draftCount: 10, unscoredCount: 3 }, isDark: false });

    expect(screen.getByText("3")).toHaveClass("text-purple-700");
  });

  it("does not apply highlight styling when unscoredCount is 0", () => {
    renderPanel({ stats: { total: 42, draftCount: 10, unscoredCount: 0 }, isDark: true });

    const value = screen.getByText("0");
    expect(value).not.toHaveClass("text-purple-400");
    expect(value).not.toHaveClass("text-purple-700");
    expect(value).toHaveClass("text-slate-200");
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
