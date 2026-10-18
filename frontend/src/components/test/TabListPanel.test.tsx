import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TabListPanel, { type TabListItem } from "../TabListPanel.js";

const TABS: TabListItem[] = [
  { id: "projects", label: "Project Folders" },
  { id: "files", label: "Audio Files" },
  { id: 7, label: "My Custom Tab" },
];

function renderPanel(overrides: Partial<Parameters<typeof TabListPanel>[0]> = {}) {
  const props = {
    open: true,
    tabs: TABS,
    activeTabId: "projects" as string | number,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<TabListPanel {...props} />), props };
}

describe("TabListPanel - basic rendering", () => {
  it("renders the dialog with every tab's label, in the given order", () => {
    renderPanel();

    expect(screen.getByRole("dialog", { name: "All tabs" })).toBeInTheDocument();
    const buttons = screen.getAllByRole("button").filter((b) => b !== screen.getByRole("button", { name: "Close panel" }));
    expect(buttons.map((b) => b.textContent)).toEqual(["Project Folders", "Audio Files", "My Custom Tab"]);
  });

  // Each row's accessible name is "Go to tab {label}", not the plain label — see
  // TabListPanel.tsx's own comment on why (disambiguating from the tab bar's own same-labeled
  // button, a real separate DOM element this panel stays mounted alongside).
  it("marks only the active tab's button with aria-current", () => {
    renderPanel({ activeTabId: 7 });

    expect(screen.getByRole("button", { name: "Go to tab Project Folders" })).toHaveAttribute("aria-current", "false");
    expect(screen.getByRole("button", { name: "Go to tab Audio Files" })).toHaveAttribute("aria-current", "false");
    expect(screen.getByRole("button", { name: "Go to tab My Custom Tab" })).toHaveAttribute("aria-current", "true");
  });

  it("renders no tab rows when the tabs list is empty", () => {
    renderPanel({ tabs: [] });

    expect(screen.queryByRole("button", { name: "Go to tab Project Folders" })).not.toBeInTheDocument();
  });
});

describe("TabListPanel - selecting a tab", () => {
  it("calls onSelect with the clicked tab's id, then onClose", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onSelect, onClose });

    await user.click(screen.getByRole("button", { name: "Go to tab Audio Files" }));

    expect(onSelect).toHaveBeenCalledWith("files");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onSelect with a custom tab's numeric id", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onSelect });

    await user.click(screen.getByRole("button", { name: "Go to tab My Custom Tab" }));

    expect(onSelect).toHaveBeenCalledWith(7);
  });
});

describe("TabListPanel - Escape to close", () => {
  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on Escape while the panel is closed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ open: false, onClose });

    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("TabListPanel - close button", () => {
  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });

    await user.click(screen.getByRole("button", { name: "Close panel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("TabListPanel - backdrop click to dismiss", () => {
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
