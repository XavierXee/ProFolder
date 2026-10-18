import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteTabConfirmDialog from "../DeleteTabConfirmDialog.js";
import type { ConfirmationSettings } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getConfirmationSettings: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetConfirmationSettings = vi.mocked(api.getConfirmationSettings);

function makeSettings(overrides: Partial<ConfirmationSettings> = {}): ConfirmationSettings {
  return {
    confirmTabDeletion: false,
    confirmCopy: false,
    confirmMove: false,
    confirmDelete: false,
    confirmStatusDeletion: false,
    confirmTagDeletion: false,
    ...overrides,
  };
}

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

beforeEach(() => {
  // Default: confirmation off, matching this file's pre-existing "instant delete" tests.
  mockGetConfirmationSettings.mockReset().mockResolvedValue(makeSettings());
});

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
    // Matched against the message paragraph specifically (not a substring match) since the
    // confirmation input's own label, rendered while settings load (fail-safe-required), also
    // contains the tab name and would otherwise collide on a loose /Favorites/ match.
    expect(screen.getByText('Delete the tab "Favorites"? This cannot be undone.')).toBeInTheDocument();
  });

  it("clicking Delete calls onConfirm and not onCancel", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    // confirmTabDeletion is false in this file's default mock, but settings load
    // asynchronously — wait for the fail-safe-required window to clear before clicking.
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled());
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

  it("calls onConfirm when Enter is pressed and Delete is enabled", async () => {
    const { props } = renderDialog();

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled());
    fireEvent.keyDown(window, { key: "Enter" });

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();
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

describe("DeleteTabConfirmDialog - confirmTabDeletion required (true)", () => {
  beforeEach(() => {
    mockGetConfirmationSettings.mockReset().mockResolvedValue(makeSettings({ confirmTabDeletion: true }));
  });

  it("renders a confirmation input and disables Delete until the exact tab name is typed", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({ tabName: "Favorites" });

    await waitFor(() => expect(screen.getByLabelText('Type "Favorites" to confirm')).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    await user.type(screen.getByLabelText('Type "Favorites" to confirm'), "Favorites");

    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps Delete disabled if the typed text doesn't exactly match (case-sensitive)", async () => {
    const user = userEvent.setup();
    renderDialog({ tabName: "Favorites" });

    await waitFor(() => expect(screen.getByLabelText('Type "Favorites" to confirm')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Type "Favorites" to confirm'), "favorites");

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("does not call onConfirm when Enter is pressed while Delete is still disabled (confirmation text not yet satisfied)", async () => {
    const { props } = renderDialog({ tabName: "Favorites" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled());
    fireEvent.keyDown(window, { key: "Enter" });

    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm when Enter is pressed once the confirmation text is satisfied", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({ tabName: "Favorites" });

    await waitFor(() => expect(screen.getByLabelText('Type "Favorites" to confirm')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Type "Favorites" to confirm'), "Favorites");
    fireEvent.keyDown(window, { key: "Enter" });

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("treats confirmation as required (renders the input, disables Delete) before settings have loaded yet, fail-safe", () => {
    mockGetConfirmationSettings.mockReset().mockReturnValue(new Promise(() => {}));
    renderDialog({ tabName: "Favorites" });

    expect(screen.getByLabelText('Type "Favorites" to confirm')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});

describe("DeleteTabConfirmDialog - confirmTabDeletion disabled (false)", () => {
  it("renders no confirmation input and Delete is immediately enabled once settings have loaded", async () => {
    renderDialog();

    await waitFor(() => expect(mockGetConfirmationSettings).toHaveBeenCalled());
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled());
  });
});

describe("DeleteTabConfirmDialog - typed text resets between opens", () => {
  it("does not leak a previously typed tab name into confirming a different tab's deletion", async () => {
    mockGetConfirmationSettings.mockReset().mockResolvedValue(makeSettings({ confirmTabDeletion: true }));
    const user = userEvent.setup();
    const { rerender } = render(<DeleteTabConfirmDialog open={true} tabName="Alpha" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Type "Alpha" to confirm')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Type "Alpha" to confirm'), "Alpha");
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();

    // Close, then reopen the same mounted dialog instance for a different tab.
    rerender(<DeleteTabConfirmDialog open={false} tabName="Alpha" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    rerender(<DeleteTabConfirmDialog open={true} tabName="Beta" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Type "Beta" to confirm')).toBeInTheDocument());
    expect(screen.getByLabelText('Type "Beta" to confirm')).toHaveValue("");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
