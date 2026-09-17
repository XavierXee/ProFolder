import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteTabConfirmDialog from "../DeleteTabConfirmDialog.js";

function renderDialog(overrides: Partial<Parameters<typeof DeleteTabConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    tabName: "My Custom Tab",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { ...render(<DeleteTabConfirmDialog {...props} />), props };
}

describe("DeleteTabConfirmDialog - open=false", () => {
  it("renders nothing", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("DeleteTabConfirmDialog - open=true", () => {
  it("renders the tabName in the confirmation text", () => {
    renderDialog({ tabName: "Favorites" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Favorites/)).toBeInTheDocument();
  });

  it("clicking Delete calls onConfirm and not onCancel", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("clicking Cancel calls onCancel and not onConfirm", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel when Escape is pressed", () => {
    const { props } = renderDialog();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel when the backdrop is clicked", () => {
    const { props, container } = renderDialog();

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("uses the --rt-radius-lg token class on the dialog panel and --rt-radius on its buttons, not bare rounded/rounded-lg", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("rounded-[var(--rt-radius-lg)]");
    expect(dialog.className).not.toMatch(/(^|\s)rounded-lg(\s|$)/);

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(deleteButton.className).toContain("rounded-[var(--rt-radius)]");
    expect(cancelButton.className).toContain("rounded-[var(--rt-radius)]");
    expect(deleteButton.className).not.toMatch(/(^|\s)rounded(\s|$)/);
    expect(cancelButton.className).not.toMatch(/(^|\s)rounded(\s|$)/);
  });
});

describe("DeleteTabConfirmDialog - token-driven theming", () => {
  it("renders the panel using the token-driven surface/border/ink classes, not a hardcoded hex/isDark literal", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("bg-surface");
    expect(dialog.className).toContain("border-border");
    expect(dialog.className).toContain("text-ink");
    expect(dialog.className).not.toContain("bg-[#13161e]");
    expect(dialog.className).not.toContain("bg-white");
  });

  it("renders the backdrop using the shared bg-scrim token, not a hardcoded bg-black/NN literal", () => {
    const { container } = renderDialog();

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop?.className).toContain("bg-scrim");
    expect(backdrop?.className).not.toContain("bg-black/50");
    expect(backdrop?.className).not.toContain("bg-black/20");
  });
});
