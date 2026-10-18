import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateCustomTabModal from "../CreateCustomTabModal.js";
import type { CustomTab } from "../../types.js";
import { StatusCatalogProvider } from "../../contexts/StatusCatalogContext.js";
import type { StatusDef } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  createCustomTab: vi.fn(),
  getStatuses: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockCreateCustomTab = vi.mocked(api.createCustomTab);
const mockGetStatuses = vi.mocked(api.getStatuses);

// Matches the pre-catalog fixed 5-status list (unknown + these 4), so the existing
// Draft/Done-picking tests keep the same meaning as before Task 4.
const CATALOG_STATUSES: StatusDef[] = [
  { key: "draft", name: "Draft", color: "#a1b2c3", sortOrder: 1, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "needs_mixing", name: "Need Mixing", color: "#b2c3a1", sortOrder: 2, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "done", name: "Done", color: "#c3a1b2", sortOrder: 3, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "released", name: "Released", color: "#a1c3b2", sortOrder: 4, createdAt: "2024-01-01T00:00:00.000Z" },
];

function makeTab(overrides: Partial<CustomTab> = {}): CustomTab {
  return {
    id: 1,
    name: "My Tab",
    type: "projects",
    statuses: [],
    scores: [],
    tags: [],
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderModal(overrides: Partial<Parameters<typeof CreateCustomTabModal>[0]> = {}) {
  const props = {
    open: true,
    allTags: ["rock", "jazz"],
    onClose: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  };
  return {
    ...render(
      <StatusCatalogProvider>
        <CreateCustomTabModal {...props} />
      </StatusCatalogProvider>
    ),
    props,
  };
}

beforeEach(() => {
  mockCreateCustomTab.mockReset().mockResolvedValue(makeTab());
  mockGetStatuses.mockReset().mockResolvedValue(CATALOG_STATUSES);
});

describe("CreateCustomTabModal - open=false", () => {
  it("stays mounted but translated off-screen (slide-in pattern), matching ScanFolderPanel/SettingsPanel", () => {
    renderModal({ open: false });

    const dialog = screen.getByRole("dialog", { name: "Create custom tab" });
    expect(dialog.className).toContain("translate-x-full");
    expect(dialog.className).not.toContain("translate-x-0");
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

describe("CreateCustomTabModal - Association filter (files-only)", () => {
  it("does not render the Association picker for the default 'Project Folders' type", () => {
    renderModal();

    expect(screen.queryByRole("button", { name: "Folders" })).not.toBeInTheDocument();
  });

  it("renders the Association picker once 'Audio Files' is selected", async () => {
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.click(screen.getByRole("radio", { name: "Audio Files" }));

    expect(screen.getByRole("button", { name: "Folders" })).toBeInTheDocument();
  });

  it("hides the Association picker again when switching back to 'Project Folders'", async () => {
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.click(screen.getByRole("radio", { name: "Audio Files" }));
    await user.click(screen.getByRole("radio", { name: "Project Folders" }));

    expect(screen.queryByRole("button", { name: "Folders" })).not.toBeInTheDocument();
  });

  it("includes the picked association in the submit payload for a files tab", async () => {
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.type(screen.getByLabelText("Name"), "Unassociated Files");
    await user.click(screen.getByRole("radio", { name: "Audio Files" }));
    await user.click(screen.getByRole("button", { name: "Folders" }));
    await user.click(screen.getByRole("checkbox", { name: "Only files unassociated to a project folder" }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mockCreateCustomTab).toHaveBeenCalledWith(
        expect.objectContaining({ type: "files", association: "unassociated" })
      )
    );
  });

  it("clears a previously-picked association (not silently submitted) when switching back to 'Project Folders' before submitting", async () => {
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.type(screen.getByLabelText("Name"), "Switched Back");
    await user.click(screen.getByRole("radio", { name: "Audio Files" }));
    await user.click(screen.getByRole("button", { name: "Folders" }));
    await user.click(screen.getByRole("checkbox", { name: "Only files associated to a project folder" }));
    await user.click(screen.getByRole("radio", { name: "Project Folders" }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(mockCreateCustomTab).toHaveBeenCalledTimes(1));
    const payload = mockCreateCustomTab.mock.calls[0][0];
    expect(payload.association).toBeUndefined();
  });
});

describe("CreateCustomTabModal - dynamic status catalog", () => {
  it("shows a custom (non-default) catalog status in the Status dropdown and includes it in the submit payload", async () => {
    mockGetStatuses.mockReset().mockResolvedValue([
      ...CATALOG_STATUSES,
      { key: "mastering", name: "Mastering", color: "#123456", sortOrder: 5, createdAt: "2024-01-01T00:00:00.000Z" },
    ]);
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.type(screen.getByLabelText("Name"), "Custom Status Tab");
    await user.click(screen.getByRole("button", { name: "Status" }));
    const masteringCheckbox = await screen.findByRole("checkbox", { name: "Mastering" });
    await user.click(masteringCheckbox);
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mockCreateCustomTab).toHaveBeenCalledWith({
        name: "Custom Status Tab",
        type: "projects",
        statuses: ["mastering"],
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

describe("CreateCustomTabModal - Escape scoping with a nested dropdown open", () => {
  it("closes only the open MultiSelectDropdown on Escape, leaving the modal and its form state intact", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({ delay: null });
    renderModal({ onClose });

    await user.type(screen.getByLabelText("Name"), "My Draft Tab");
    await user.click(screen.getByRole("button", { name: "Status" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    // The dropdown closed...
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // ...but the modal itself stayed open, with the typed name untouched.
    expect(screen.getByRole("dialog", { name: "Create custom tab" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("My Draft Tab");
    expect(onClose).not.toHaveBeenCalled();
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
