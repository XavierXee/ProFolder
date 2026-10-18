import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteCatalogTagConfirmDialog from "../DeleteCatalogTagConfirmDialog.js";
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

function renderDialog(overrides: Partial<Parameters<typeof DeleteCatalogTagConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    tagName: "vocals",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { ...render(<DeleteCatalogTagConfirmDialog {...props} />), props };
}

beforeEach(() => {
  // Default: confirmation off, matching this file's pre-existing "instant delete" tests.
  mockGetConfirmationSettings.mockReset().mockResolvedValue(makeSettings());
});

describe("DeleteCatalogTagConfirmDialog - open=false", () => {
  it("renders nothing", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("DeleteCatalogTagConfirmDialog - open=true", () => {
  it("renders the tagName in the confirmation text", () => {
    renderDialog({ tagName: "vocals" });

    expect(screen.getByRole("dialog", { name: "Delete tag confirmation" })).toBeInTheDocument();
    expect(screen.getByText('Remove the tag "vocals"? This cannot be undone.')).toBeInTheDocument();
  });

  it("clicking Delete calls onConfirm and not onCancel", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

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
    const { props } = renderDialog();

    // The dialog is portaled to document.body (see DeleteCatalogTagConfirmDialog.tsx's own
    // comment), so its backdrop is a sibling of RTL's `container`, not a descendant of it.
    const backdrop = document.body.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});

describe("DeleteCatalogTagConfirmDialog - confirmTagDeletion required (true)", () => {
  beforeEach(() => {
    mockGetConfirmationSettings.mockReset().mockResolvedValue(makeSettings({ confirmTagDeletion: true }));
  });

  it("renders a confirmation input and disables Delete until the exact tag name is typed", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({ tagName: "vocals" });

    await waitFor(() => expect(screen.getByLabelText('Type "vocals" to confirm')).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    await user.type(screen.getByLabelText('Type "vocals" to confirm'), "vocals");

    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps Delete disabled if the typed text doesn't exactly match (case-sensitive)", async () => {
    const user = userEvent.setup();
    renderDialog({ tagName: "vocals" });

    await waitFor(() => expect(screen.getByLabelText('Type "vocals" to confirm')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Type "vocals" to confirm'), "Vocals");

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("does not call onConfirm when Enter is pressed while Delete is still disabled (confirmation text not yet satisfied)", async () => {
    const { props } = renderDialog({ tagName: "vocals" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled());
    fireEvent.keyDown(window, { key: "Enter" });

    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm when Enter is pressed once the confirmation text is satisfied", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({ tagName: "vocals" });

    await waitFor(() => expect(screen.getByLabelText('Type "vocals" to confirm')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Type "vocals" to confirm'), "vocals");
    fireEvent.keyDown(window, { key: "Enter" });

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("treats confirmation as required (renders the input, disables Delete) before settings have loaded yet, fail-safe", () => {
    mockGetConfirmationSettings.mockReset().mockReturnValue(new Promise(() => {}));
    renderDialog({ tagName: "vocals" });

    expect(screen.getByLabelText('Type "vocals" to confirm')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});

describe("DeleteCatalogTagConfirmDialog - confirmTagDeletion disabled (false)", () => {
  it("renders no confirmation input and Delete is immediately enabled once settings have loaded", async () => {
    renderDialog();

    await waitFor(() => expect(mockGetConfirmationSettings).toHaveBeenCalled());
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled());
  });
});

describe("DeleteCatalogTagConfirmDialog - typed text resets between opens", () => {
  it("does not leak a previously typed tag name into confirming a different tag's deletion", async () => {
    mockGetConfirmationSettings.mockReset().mockResolvedValue(makeSettings({ confirmTagDeletion: true }));
    const user = userEvent.setup();
    const { rerender } = render(<DeleteCatalogTagConfirmDialog open={true} tagName="alpha" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Type "alpha" to confirm')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Type "alpha" to confirm'), "alpha");
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();

    // Close, then reopen the same mounted dialog instance for a different tag.
    rerender(<DeleteCatalogTagConfirmDialog open={false} tagName="alpha" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    rerender(<DeleteCatalogTagConfirmDialog open={true} tagName="beta" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Type "beta" to confirm')).toBeInTheDocument());
    expect(screen.getByLabelText('Type "beta" to confirm')).toHaveValue("");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
