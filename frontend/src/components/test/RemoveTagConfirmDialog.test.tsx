import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RemoveTagConfirmDialog from "../RemoveTagConfirmDialog.js";
import type { ConfirmationSettings } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getConfirmationSettings: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetConfirmationSettings = vi.mocked(api.getConfirmationSettings);

function makeSettings(overrides: Partial<ConfirmationSettings> = {}): ConfirmationSettings {
  return {
    confirmTagRemoval: false,
    confirmTabDeletion: false,
    confirmCopy: false,
    confirmMove: false,
    confirmDelete: false,
    ...overrides,
  };
}

function renderDialog(overrides: Partial<Parameters<typeof RemoveTagConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    tagName: "rock",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { ...render(<RemoveTagConfirmDialog {...props} />), props };
}

beforeEach(() => {
  // Default: confirmation off, matching the "immediately actionable" tests below.
  mockGetConfirmationSettings.mockReset().mockResolvedValue(makeSettings());
});

describe("RemoveTagConfirmDialog - open=false", () => {
  it("renders nothing", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("RemoveTagConfirmDialog - open=true", () => {
  it("renders the tagName in the confirmation text", () => {
    renderDialog({ tagName: "jazz" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText('Remove the tag "jazz"? This cannot be undone.')).toBeInTheDocument();
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

describe("RemoveTagConfirmDialog - confirmTagRemoval required (true)", () => {
  beforeEach(() => {
    mockGetConfirmationSettings.mockReset().mockResolvedValue(makeSettings({ confirmTagRemoval: true }));
  });

  it("disables Remove until the exact tag name is typed, then calls onConfirm", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({ tagName: "jazz" });

    await waitFor(() => expect(screen.getByLabelText('Type "jazz" to confirm')).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();

    await user.type(screen.getByLabelText('Type "jazz" to confirm'), "jazz");

    expect(screen.getByRole("button", { name: "Remove" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps Remove disabled if the typed text doesn't exactly match (case-sensitive)", async () => {
    const user = userEvent.setup();
    renderDialog({ tagName: "jazz" });

    await waitFor(() => expect(screen.getByLabelText('Type "jazz" to confirm')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Type "jazz" to confirm'), "Jazz");

    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("treats confirmation as required (renders the input, disables Remove) before settings have loaded yet, fail-safe", () => {
    mockGetConfirmationSettings.mockReset().mockReturnValue(new Promise(() => {}));
    renderDialog({ tagName: "jazz" });

    expect(screen.getByLabelText('Type "jazz" to confirm')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("resets typed text on reopen for a different tag name", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RemoveTagConfirmDialog open={true} tagName="rock" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Type "rock" to confirm')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Type "rock" to confirm'), "rock");
    expect(screen.getByRole("button", { name: "Remove" })).not.toBeDisabled();

    rerender(<RemoveTagConfirmDialog open={false} tagName="rock" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    rerender(<RemoveTagConfirmDialog open={true} tagName="jazz" onConfirm={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Type "jazz" to confirm')).toBeInTheDocument());
    expect(screen.getByLabelText('Type "jazz" to confirm')).toHaveValue("");
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });
});

describe("RemoveTagConfirmDialog - confirmTagRemoval disabled (false)", () => {
  it("renders no confirmation input and Remove is immediately enabled once settings have loaded", async () => {
    renderDialog();

    await waitFor(() => expect(mockGetConfirmationSettings).toHaveBeenCalled());
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove" })).not.toBeDisabled());
  });
});
