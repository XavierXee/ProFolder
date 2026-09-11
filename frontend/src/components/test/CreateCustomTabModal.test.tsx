import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateCustomTabModal from "../CreateCustomTabModal.js";
import type { CustomTab } from "../../types.js";

vi.mock("../../api/client.js", () => ({
  createCustomTab: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockCreateCustomTab = vi.mocked(api.createCustomTab);

function makeTab(overrides: Partial<CustomTab> = {}): CustomTab {
  return {
    id: 1,
    name: "My Tab",
    type: "projects",
    statuses: [],
    scores: [],
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderModal(overrides: Partial<Parameters<typeof CreateCustomTabModal>[0]> = {}) {
  const props = {
    open: true,
    isDark: true,
    allTags: ["rock", "jazz"],
    onClose: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  };
  return { ...render(<CreateCustomTabModal {...props} />), props };
}

beforeEach(() => {
  mockCreateCustomTab.mockReset().mockResolvedValue(makeTab());
});

describe("CreateCustomTabModal - open=false", () => {
  it("renders nothing", () => {
    renderModal({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });
});

describe("CreateCustomTabModal - name validation", () => {
  it("blocks submit and shows a validation message when name is empty, without calling the API", async () => {
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(mockCreateCustomTab).not.toHaveBeenCalled();
  });

  it("does not call the API when the name is only whitespace", async () => {
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.type(screen.getByLabelText("Name"), "   ");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(mockCreateCustomTab).not.toHaveBeenCalled();
  });

  it("re-validates empty name on a second submit attempt after a successful first submit", async () => {
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.type(screen.getByLabelText("Name"), "First Tab");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mockCreateCustomTab).toHaveBeenCalledTimes(1));

    // The parent controls `open`; in this test it stays true, so the panel remains
    // mounted with its post-submit state. Clearing the name and submitting again
    // must still trigger validation (i.e. it isn't a first-attempt-only check).
    await user.clear(screen.getByLabelText("Name"));
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(mockCreateCustomTab).toHaveBeenCalledTimes(1);
  });
});

describe("CreateCustomTabModal - submit payload", () => {
  it("sends the exact expected payload for a full selection (type, statuses, scores, tags)", async () => {
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.type(screen.getByLabelText("Name"), "My Tab");
    await user.click(screen.getByRole("radio", { name: "Audio Files" }));

    await user.click(screen.getByRole("button", { name: "Status" }));
    await user.click(screen.getByRole("checkbox", { name: "Draft" }));
    await user.click(screen.getByRole("checkbox", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Score" }));
    await user.click(screen.getByRole("checkbox", { name: "5" }));
    await user.click(screen.getByRole("checkbox", { name: "Unscored" }));

    await user.click(screen.getByRole("button", { name: "Tags" }));
    await user.click(screen.getByRole("checkbox", { name: "rock" }));

    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mockCreateCustomTab).toHaveBeenCalledWith({
        name: "My Tab",
        type: "files",
        statuses: ["draft", "done"],
        scores: [5, "unscored"],
        tags: ["rock"],
      })
    );
  });

  it("defaults to type 'projects' and empty filter arrays when nothing else is selected", async () => {
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.type(screen.getByLabelText("Name"), "Simple Tab");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mockCreateCustomTab).toHaveBeenCalledWith({
        name: "Simple Tab",
        type: "projects",
        statuses: [],
        scores: [],
        tags: [],
      })
    );
  });
});

describe("CreateCustomTabModal - success", () => {
  it("calls onCreated with the server's returned tab and closes the panel", async () => {
    const created = makeTab({ id: 42, name: "Simple Tab" });
    mockCreateCustomTab.mockResolvedValue(created);
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup({ delay: null });
    renderModal({ onCreated, onClose });

    await user.type(screen.getByLabelText("Name"), "Simple Tab");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CreateCustomTabModal - server error", () => {
  it("shows the error message inline and keeps the panel open", async () => {
    mockCreateCustomTab.mockRejectedValue(new Error("Name already in use"));
    const onClose = vi.fn();
    const user = userEvent.setup({ delay: null });
    renderModal({ onClose });

    await user.type(screen.getByLabelText("Name"), "Dup Tab");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.getByText("Name already in use")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Create custom tab" })).toBeInTheDocument();
  });
});

describe("CreateCustomTabModal - Escape to close", () => {
  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderModal({ onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CreateCustomTabModal - backdrop click to dismiss", () => {
  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = renderModal({ onClose });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CreateCustomTabModal - auto-focus on open", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("focuses the close button 50ms after opening", () => {
    renderModal();

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
  });
});
