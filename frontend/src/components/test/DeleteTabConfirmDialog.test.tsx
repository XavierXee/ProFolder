import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteTabConfirmDialog from "../DeleteTabConfirmDialog.js";

function renderDialog(overrides: Partial<Parameters<typeof DeleteTabConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    isDark: true,
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
});

describe("DeleteTabConfirmDialog - isDark theming", () => {
  it("renders the dark-theme card background/text classes when isDark=true", () => {
    renderDialog({ isDark: true });

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("bg-[#13161e]");
    expect(dialog.className).toContain("text-slate-200");
  });

  it("renders the light-theme card background/text classes when isDark=false", () => {
    renderDialog({ isDark: false });

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("bg-white");
    expect(dialog.className).toContain("text-slate-800");
    expect(dialog.className).not.toContain("bg-[#13161e]");
  });

  it("still renders expected structure and responds to Cancel/Delete when isDark=false", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({ isDark: false, tabName: "Light Mode Tab" });

    expect(screen.getByText(/Light Mode Tab/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("threads isDark through the backdrop opacity, not just the card", () => {
    const { container: darkContainer } = renderDialog({ isDark: true });
    const darkBackdrop = darkContainer.querySelector('[aria-hidden="true"]');
    expect(darkBackdrop?.className).toContain("bg-black/50");
    expect(darkBackdrop?.className).not.toContain("bg-black/20");

    const { container: lightContainer } = renderDialog({ isDark: false });
    const lightBackdrop = lightContainer.querySelector('[aria-hidden="true"]');
    expect(lightBackdrop?.className).toContain("bg-black/20");
    expect(lightBackdrop?.className).not.toContain("bg-black/50");
  });
});
