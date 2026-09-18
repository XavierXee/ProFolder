import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TagsStatusesPanel from "../TagsStatusesPanel.js";

function renderPanel(overrides: Partial<Parameters<typeof TagsStatusesPanel>[0]> = {}) {
  const props = {
    allTags: [] as string[],
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<TagsStatusesPanel {...props} />), props };
}

describe("TagsStatusesPanel - statuses section", () => {
  it("renders all 5 statuses using their STATUS_LABELS display text", () => {
    renderPanel();

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Need Mixing")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Released")).toBeInTheDocument();
  });
});

describe("TagsStatusesPanel - tags section", () => {
  it("shows a 'No tags yet.' fallback when allTags is empty", () => {
    renderPanel({ allTags: [] });

    expect(screen.getByText("No tags yet.")).toBeInTheDocument();
  });

  it("renders every tag as a chip, and shows the count alongside the section label", () => {
    renderPanel({ allTags: ["mixing", "vocals", "reverb"] });

    expect(screen.getByText("Tags (3)")).toBeInTheDocument();
    expect(screen.getByText("mixing")).toBeInTheDocument();
    expect(screen.getByText("vocals")).toBeInTheDocument();
    expect(screen.getByText("reverb")).toBeInTheDocument();
    expect(screen.queryByText("No tags yet.")).not.toBeInTheDocument();
  });

  it("does not show a count next to the Tags label when there are no tags", () => {
    renderPanel({ allTags: [] });

    expect(screen.getByText("Tags")).toBeInTheDocument();
  });
});

describe("TagsStatusesPanel - dismiss behavior", () => {
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
    renderPanel({ onClose, allTags: ["vocals"] });

    await user.click(screen.getByRole("dialog", { name: "Statuses and tags" }));

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

    await user.click(screen.getByRole("button", { name: "Close statuses and tags panel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
