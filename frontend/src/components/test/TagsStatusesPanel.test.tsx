import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TagsStatusesPanel from "../TagsStatusesPanel.js";
import { StatusCatalogProvider } from "../../contexts/StatusCatalogContext.js";
import type { ConfirmationSettings, StatusDef } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getStatuses: vi.fn(),
  createStatus: vi.fn(),
  editStatus: vi.fn(),
  deleteStatus: vi.fn(),
  createTag: vi.fn(),
  renameTag: vi.fn(),
  deleteTag: vi.fn(),
  getConfirmationSettings: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetStatuses = vi.mocked(api.getStatuses);
const mockCreateStatus = vi.mocked(api.createStatus);
const mockEditStatus = vi.mocked(api.editStatus);
const mockDeleteStatus = vi.mocked(api.deleteStatus);
const mockCreateTag = vi.mocked(api.createTag);
const mockRenameTag = vi.mocked(api.renameTag);
const mockDeleteTag = vi.mocked(api.deleteTag);
const mockGetConfirmationSettings = vi.mocked(api.getConfirmationSettings);

// `TagsStatusesPanel`'s Statuses section renders one `StatusBadge` per catalog entry (plus the
// fixed "unknown" sentinel), and `StatusBadge` looks non-"unknown" statuses up in the dynamic
// catalog (see StatusCatalogContext) — so these entries drive both the read-only badges and the
// edit/delete affordances under test.
const CATALOG_STATUSES: StatusDef[] = [
  { key: "draft", name: "Draft", color: "#a1b2c3", sortOrder: 1, createdAt: "2024-01-01T00:00:00.000Z" },
  { key: "needs_mixing", name: "Need Mixing", color: "#b2c3a1", sortOrder: 2, createdAt: "2024-01-01T00:00:00.000Z" },
];

function makeConfirmSettings(overrides: Partial<ConfirmationSettings> = {}): ConfirmationSettings {
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

function renderPanel(overrides: Partial<Parameters<typeof TagsStatusesPanel>[0]> = {}) {
  const props = {
    allTags: [] as string[],
    onClose: vi.fn(),
    onTagsChanged: vi.fn(),
    onStatusDeleted: vi.fn(),
    ...overrides,
  };
  return {
    ...render(
      <StatusCatalogProvider>
        <TagsStatusesPanel {...props} />
      </StatusCatalogProvider>
    ),
    props,
  };
}

beforeEach(() => {
  mockGetStatuses.mockReset().mockResolvedValue(CATALOG_STATUSES);
  mockCreateStatus.mockReset();
  mockEditStatus.mockReset();
  mockDeleteStatus.mockReset();
  mockCreateTag.mockReset();
  mockRenameTag.mockReset();
  mockDeleteTag.mockReset();
  // Confirmation off by default so delete flows resolve without needing typed confirmation text,
  // matching this test file's focus on the create/rename/delete wiring rather than the
  // typed-confirmation gating itself (covered separately by DeleteStatusConfirmDialog.test.tsx /
  // DeleteCatalogTagConfirmDialog.test.tsx).
  mockGetConfirmationSettings.mockReset().mockResolvedValue(makeConfirmSettings());
});

describe("TagsStatusesPanel - statuses section (read-only rendering)", () => {
  it("renders every catalog status by name, and never the unknown sentinel", async () => {
    renderPanel();

    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());
    expect(screen.getByText("Need Mixing")).toBeInTheDocument();

    // "Unknown" is a blank/default sentinel, not a real catalog row — the panel deliberately
    // omits it from the list entirely (nothing to add/edit/delete/color for it).
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit status Unknown" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete status Unknown" })).not.toBeInTheDocument();
  });

  it("shows the catalog status count alongside the section label", async () => {
    renderPanel();

    await waitFor(() => expect(screen.getByText("Statuses (2)")).toBeInTheDocument());
  });

  it("scopes the status list to a scrollable container, matching the Tags section's own bound", async () => {
    renderPanel();

    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    const statusList = screen.getByText("Draft").closest("div")?.parentElement;
    expect(statusList).toHaveClass("max-h-64", "overflow-y-auto");
  });

  it("renders edit/delete affordances for every non-unknown catalog status", async () => {
    renderPanel();

    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Edit status Draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete status Draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit status Need Mixing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete status Need Mixing" })).toBeInTheDocument();
  });
});

describe("TagsStatusesPanel - add status", () => {
  it("opens the add-status form, disables Add while the name is blank, and creates on submit", async () => {
    mockCreateStatus.mockResolvedValue({ key: "released", name: "Released", color: "#123456", sortOrder: 3, createdAt: "2024-01-01T00:00:00.000Z" });
    const onStatusDeleted = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onStatusDeleted });
    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Add status" }));
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    await user.type(screen.getByLabelText("New status name"), "Released");
    expect(screen.getByRole("button", { name: "Add" })).not.toBeDisabled();

    // getByLabelText("New status color") is an <input type="color">, which fireEvent.change
    // must drive directly (a real hex-format color-picker value, not a text-input keystroke
    // sequence userEvent.type could simulate).
    fireEvent.change(screen.getByLabelText("New status color"), { target: { value: "#123456" } });

    mockGetStatuses.mockResolvedValue([...CATALOG_STATUSES, { key: "released", name: "Released", color: "#123456", sortOrder: 3, createdAt: "2024-01-01T00:00:00.000Z" }]);
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(mockCreateStatus).toHaveBeenCalledWith("Released", "#123456"));
    expect(mockGetStatuses).toHaveBeenCalledTimes(2);
    // Form collapses back to the "+" affordance on success.
    await waitFor(() => expect(screen.queryByLabelText("New status name")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Add status" })).toBeInTheDocument();
    // Status create doesn't touch any already-fetched row's data, so it must not trigger
    // the row-level refetch signal reserved for status delete.
    expect(onStatusDeleted).not.toHaveBeenCalled();
  });

  it("cancelling the add-status form discards the input and does not call createStatus", async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Add status" }));
    await user.type(screen.getByLabelText("New status name"), "Discarded");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockCreateStatus).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add status" })).toBeInTheDocument();
  });

  it("shows an inline error and keeps the form open when createStatus rejects", async () => {
    mockCreateStatus.mockRejectedValue(new Error("Status name already exists"));
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Add status" }));
    await user.type(screen.getByLabelText("New status name"), "Draft");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(screen.getByText("Status name already exists")).toBeInTheDocument());
    // Form stays open with the entered text so the user can correct it.
    expect(screen.getByLabelText("New status name")).toHaveValue("Draft");
  });
});

describe("TagsStatusesPanel - edit status", () => {
  it("opens the edit form pre-filled with the status's current name/color and saves via editStatus + refetch", async () => {
    mockEditStatus.mockResolvedValue({ key: "draft", name: "In Progress", color: "#ff0000", sortOrder: 1, createdAt: "2024-01-01T00:00:00.000Z" });
    const onStatusDeleted = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onStatusDeleted });
    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Edit status Draft" }));
    expect(screen.getByLabelText("Edit name for Draft")).toHaveValue("Draft");
    expect(screen.getByLabelText("Edit color for Draft")).toHaveValue("#a1b2c3");

    await user.clear(screen.getByLabelText("Edit name for Draft"));
    await user.type(screen.getByLabelText("Edit name for Draft"), "In Progress");
    fireEvent.change(screen.getByLabelText("Edit color for Draft"), { target: { value: "#ff0000" } });

    mockGetStatuses.mockResolvedValue([
      { key: "draft", name: "In Progress", color: "#ff0000", sortOrder: 1, createdAt: "2024-01-01T00:00:00.000Z" },
      CATALOG_STATUSES[1],
    ]);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockEditStatus).toHaveBeenCalledWith("draft", { name: "In Progress", color: "#ff0000" }));
    expect(mockGetStatuses).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByLabelText("Edit name for Draft")).not.toBeInTheDocument());
    // Status edit (rename/recolor) never changes which rows hold the key, so it must not trigger
    // the row-level refetch signal reserved for status delete.
    expect(onStatusDeleted).not.toHaveBeenCalled();
  });

  it("cancelling the edit form discards changes and does not call editStatus", async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Edit status Draft" }));
    await user.clear(screen.getByLabelText("Edit name for Draft"));
    await user.type(screen.getByLabelText("Edit name for Draft"), "Discarded");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockEditStatus).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit status Draft" })).toBeInTheDocument();
  });

  it("shows an inline error and keeps the edit form open when editStatus rejects", async () => {
    mockEditStatus.mockRejectedValue(new Error("Invalid color"));
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Edit status Draft" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Invalid color")).toBeInTheDocument());
    expect(screen.getByLabelText("Edit name for Draft")).toBeInTheDocument();
  });
});

describe("TagsStatusesPanel - delete status", () => {
  it("opens DeleteStatusConfirmDialog, and confirming calls deleteStatus + refetch + onStatusDeleted", async () => {
    mockDeleteStatus.mockResolvedValue(undefined);
    const onStatusDeleted = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onStatusDeleted });
    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Delete status Draft" }));
    expect(screen.getByRole("dialog", { name: "Delete status confirmation" })).toBeInTheDocument();
    expect(screen.getByText(/Remove the status "Draft"\?/)).toBeInTheDocument();

    mockGetStatuses.mockResolvedValue([CATALOG_STATUSES[1]]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteStatus).toHaveBeenCalledWith("draft"));
    expect(mockGetStatuses).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete status confirmation" })).not.toBeInTheDocument());
    expect(onStatusDeleted).toHaveBeenCalledTimes(1);
  });

  it("gates the Delete button on typed confirmation when confirmStatusDeletion is required", async () => {
    mockGetConfirmationSettings.mockResolvedValue(makeConfirmSettings({ confirmStatusDeletion: true }));
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Delete status Draft" }));
    await waitFor(() => expect(screen.getByLabelText('Type "Draft" to confirm')).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    await user.type(screen.getByLabelText('Type "Draft" to confirm'), "Draft");
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();
  });

  it("cancelling the confirm dialog does not call deleteStatus", async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Delete status Draft" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockDeleteStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Delete status confirmation" })).not.toBeInTheDocument();
  });
});

describe("TagsStatusesPanel - tags section (read-only rendering, unchanged behavior)", () => {
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

describe("TagsStatusesPanel - add tag", () => {
  it("opens the add-tag form, disables Add while the name is blank, and creates on submit", async () => {
    mockCreateTag.mockResolvedValue({ id: 1, name: "reverb" });
    const onTagsChanged = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onTagsChanged, allTags: ["vocals"] });

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    await user.type(screen.getByLabelText("New tag name"), "reverb");
    expect(screen.getByRole("button", { name: "Add" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(mockCreateTag).toHaveBeenCalledWith("reverb"));
    expect(onTagsChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByLabelText("New tag name")).not.toBeInTheDocument());
  });

  it("cancelling the add-tag form discards the input and does not call createTag", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("New tag name"), "discarded");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockCreateTag).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add tag" })).toBeInTheDocument();
  });

  it("shows an inline error (e.g. duplicate) and keeps the form open when createTag rejects", async () => {
    mockCreateTag.mockRejectedValue(new Error("Tag already exists"));
    const user = userEvent.setup();
    renderPanel({ allTags: ["vocals"] });

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    await user.type(screen.getByLabelText("New tag name"), "vocals");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(screen.getByText("Tag already exists")).toBeInTheDocument());
    expect(screen.getByLabelText("New tag name")).toHaveValue("vocals");
  });
});

describe("TagsStatusesPanel - rename tag", () => {
  it("clicking the edit icon converts the tag row to an inline input, and Save calls renameTag + onTagsChanged", async () => {
    mockRenameTag.mockResolvedValue({ name: "vocal-fx" });
    const onTagsChanged = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onTagsChanged, allTags: ["vocals"] });

    await user.click(screen.getByRole("button", { name: "Edit tag vocals" }));
    expect(screen.getByLabelText("Rename tag vocals")).toHaveValue("vocals");

    await user.clear(screen.getByLabelText("Rename tag vocals"));
    await user.type(screen.getByLabelText("Rename tag vocals"), "vocal-fx");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockRenameTag).toHaveBeenCalledWith("vocals", "vocal-fx"));
    expect(onTagsChanged).toHaveBeenCalledTimes(1);
  });

  it("cancelling the rename discards changes and does not call renameTag", async () => {
    const user = userEvent.setup();
    renderPanel({ allTags: ["vocals"] });

    await user.click(screen.getByRole("button", { name: "Edit tag vocals" }));
    await user.clear(screen.getByLabelText("Rename tag vocals"));
    await user.type(screen.getByLabelText("Rename tag vocals"), "discarded");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockRenameTag).not.toHaveBeenCalled();
    expect(screen.getByText("vocals")).toBeInTheDocument();
  });

  it("shows an inline error and keeps the rename form open when renameTag rejects", async () => {
    mockRenameTag.mockRejectedValue(new Error("Tag name already in use"));
    const user = userEvent.setup();
    renderPanel({ allTags: ["vocals"] });

    await user.click(screen.getByRole("button", { name: "Edit tag vocals" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Tag name already in use")).toBeInTheDocument());
    expect(screen.getByLabelText("Rename tag vocals")).toBeInTheDocument();
  });
});

describe("TagsStatusesPanel - delete tag", () => {
  it("opens DeleteCatalogTagConfirmDialog, and confirming calls deleteTag + onTagsChanged", async () => {
    mockDeleteTag.mockResolvedValue(undefined);
    const onTagsChanged = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onTagsChanged, allTags: ["vocals"] });

    await user.click(screen.getByRole("button", { name: "Delete tag vocals" }));
    expect(screen.getByRole("dialog", { name: "Delete tag confirmation" })).toBeInTheDocument();
    expect(screen.getByText(/Remove the tag "vocals"\?/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteTag).toHaveBeenCalledWith("vocals"));
    expect(onTagsChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete tag confirmation" })).not.toBeInTheDocument());
  });

  it("gates the Delete button on typed confirmation when confirmTagDeletion is required", async () => {
    mockGetConfirmationSettings.mockResolvedValue(makeConfirmSettings({ confirmTagDeletion: true }));
    const user = userEvent.setup();
    renderPanel({ allTags: ["vocals"] });

    await user.click(screen.getByRole("button", { name: "Delete tag vocals" }));
    await waitFor(() => expect(screen.getByLabelText('Type "vocals" to confirm')).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    await user.type(screen.getByLabelText('Type "vocals" to confirm'), "vocals");
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();
  });

  it("cancelling the confirm dialog does not call deleteTag", async () => {
    const user = userEvent.setup();
    renderPanel({ allTags: ["vocals"] });

    await user.click(screen.getByRole("button", { name: "Delete tag vocals" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockDeleteTag).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Delete tag confirmation" })).not.toBeInTheDocument();
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

  it("pressing Escape while the delete-status confirm dialog is open only cancels the dialog, not the whole panel", async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    await waitFor(() => expect(screen.getByText("Draft")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete status Draft" }));
    expect(screen.getByRole("dialog", { name: "Delete status confirmation" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    // The nested dialog's capture-phase listener must stop the panel's own bubble-phase Escape
    // listener from also firing.
    expect(screen.queryByRole("dialog", { name: "Delete status confirmation" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call onClose when clicking inside the delete-tag confirm dialog's backdrop", async () => {
    const onClose = vi.fn();
    renderPanel({ onClose, allTags: ["vocals"] });

    fireEvent.click(screen.getByRole("button", { name: "Delete tag vocals" }));
    expect(screen.getByRole("dialog", { name: "Delete tag confirmation" })).toBeInTheDocument();

    // The dialog is portaled to document.body (see DeleteCatalogTagConfirmDialog.tsx's own
    // comment), so its backdrop is a sibling of this panel in the DOM, not a descendant reachable
    // via panelRef — the panel's outside-click check must instead gate on `deletingTag` being
    // set, not DOM containment, to avoid closing this panel out from under the dialog.
    const backdrop = document.body.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeTruthy();

    fireEvent.mouseDown(backdrop as Element);

    expect(onClose).not.toHaveBeenCalled();
  });
});
