import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RootPathControl from "../RootPathControl.js";

vi.mock("../../api/client.js", () => ({
  chooseMusicRoot: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockChooseMusicRoot = vi.mocked(api.chooseMusicRoot);

function renderControl(overrides: Partial<Parameters<typeof RootPathControl>[0]> = {}) {
  const props = {
    musicRoot: "/music/root" as string | undefined,
    isDark: true,
    onSave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { ...render(<RootPathControl {...props} />), props };
}

beforeEach(() => {
  mockChooseMusicRoot.mockReset();
});

describe("RootPathControl - collapsed state", () => {
  it("shows the current musicRoot and enters editing mode via the edit button", async () => {
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root" });

    expect(screen.getByText("/music/root")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change production folder" }));

    expect(screen.getByRole("textbox", { name: "Production folder path" })).toHaveValue("/music/root");
  });

  it("shows a placeholder ellipsis when musicRoot is undefined", () => {
    renderControl({ musicRoot: undefined });

    expect(screen.getByText("…")).toBeInTheDocument();
  });
});

describe("RootPathControl - handleSave no-op behavior", () => {
  it("does not call onSave and simply exits editing when the input is unchanged", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root", onSave });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Production folder path" })).not.toBeInTheDocument());
  });

  it("does not call onSave when the input is cleared to empty", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root", onSave });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    const input = screen.getByRole("textbox", { name: "Production folder path" });
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not call onSave when the input is only whitespace", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root", onSave });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    const input = screen.getByRole("textbox", { name: "Production folder path" });
    await user.clear(input);
    await user.type(input, "   ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave with the trimmed path when it differs from musicRoot", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root", onSave });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    const input = screen.getByRole("textbox", { name: "Production folder path" });
    await user.clear(input);
    await user.type(input, "  /new/path  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("/new/path");
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Production folder path" })).not.toBeInTheDocument());
  });
});

describe("RootPathControl - handleBrowse", () => {
  it("does nothing further when the picker is cancelled (resolves undefined)", async () => {
    mockChooseMusicRoot.mockResolvedValue(undefined);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root", onSave });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    await user.click(screen.getByRole("button", { name: "Browse…" }));

    await waitFor(() => expect(mockChooseMusicRoot).toHaveBeenCalled());
    expect(onSave).not.toHaveBeenCalled();
    // Still editing, input unchanged.
    expect(screen.getByRole("textbox", { name: "Production folder path" })).toHaveValue("/music/root");
  });

  it("fills the input and saves immediately when the picker returns a path", async () => {
    mockChooseMusicRoot.mockResolvedValue("/picked/path");
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root", onSave });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    await user.click(screen.getByRole("button", { name: "Browse…" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("/picked/path"));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Production folder path" })).not.toBeInTheDocument());
  });

  it("surfaces an error message when the picker itself rejects", async () => {
    mockChooseMusicRoot.mockRejectedValue(new Error("picker unavailable"));
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root" });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    await user.click(screen.getByRole("button", { name: "Browse…" }));

    await waitFor(() => expect(screen.getByText("picker unavailable")).toBeInTheDocument());
  });
});

describe("RootPathControl - error surfacing on failed save", () => {
  it("shows the error message and stays in editing mode when onSave rejects", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("permission denied"));
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root", onSave });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    const input = screen.getByRole("textbox", { name: "Production folder path" });
    await user.clear(input);
    await user.type(input, "/bad/path");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("permission denied")).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Production folder path" })).toBeInTheDocument();
  });

  it("falls back to a generic message when the rejection is not an Error instance", async () => {
    const onSave = vi.fn().mockRejectedValue("some string failure");
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root", onSave });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    const input = screen.getByRole("textbox", { name: "Production folder path" });
    await user.clear(input);
    await user.type(input, "/bad/path");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Could not update the production folder")).toBeInTheDocument());
  });
});

describe("RootPathControl - busy/saving disabled state", () => {
  it("disables the input and action buttons, and shows 'Saving…', while a save is in flight", async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      })
    );
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root", onSave });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    const input = screen.getByRole("textbox", { name: "Production folder path" });
    await user.clear(input);
    await user.type(input, "/new/path");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Browse…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolveSave();
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Production folder path" })).not.toBeInTheDocument());
  });

  it("disables controls and shows 'Waiting…' on the Browse button while the picker is in flight", async () => {
    let resolveChoose!: (path: string | undefined) => void;
    mockChooseMusicRoot.mockReturnValue(
      new Promise((resolve) => {
        resolveChoose = resolve;
      })
    );
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root" });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    await user.click(screen.getByRole("button", { name: "Browse…" }));

    expect(screen.getByRole("button", { name: "Waiting…" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Production folder path" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolveChoose(undefined);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Waiting…" })).not.toBeInTheDocument());
  });
});

describe("RootPathControl - keyboard shortcuts", () => {
  it("Escape cancels editing without saving", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root", onSave });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    const input = screen.getByRole("textbox", { name: "Production folder path" });
    await user.type(input, "/typed/but/discarded");
    await user.keyboard("{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Production folder path" })).not.toBeInTheDocument();
  });

  it("Enter triggers a save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderControl({ musicRoot: "/music/root", onSave });

    await user.click(screen.getByRole("button", { name: "Change production folder" }));
    const input = screen.getByRole("textbox", { name: "Production folder path" });
    await user.clear(input);
    await user.type(input, "/typed/path{Enter}");

    expect(onSave).toHaveBeenCalledWith("/typed/path");
  });
});
