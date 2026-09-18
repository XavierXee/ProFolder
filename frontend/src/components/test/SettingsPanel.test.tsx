import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPanel from "../SettingsPanel.js";
import type { ConfirmationSettings, PaginationSettings, ScanSettings } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getScanSettings: vi.fn(),
  setScanSettings: vi.fn(),
  getConfirmationSettings: vi.fn(),
  setConfirmationSettings: vi.fn(),
  getPaginationSettings: vi.fn(),
  setPaginationSettings: vi.fn(),
}));

vi.mock("../../hooks/useItemsPerPage.js", () => ({
  setItemsPerPageGlobally: vi.fn(),
}));

import * as api from "../../api/client.js";
import { setItemsPerPageGlobally } from "../../hooks/useItemsPerPage.js";

const mockGetScanSettings = vi.mocked(api.getScanSettings);
const mockSetScanSettings = vi.mocked(api.setScanSettings);
const mockGetConfirmationSettings = vi.mocked(api.getConfirmationSettings);
const mockSetConfirmationSettings = vi.mocked(api.setConfirmationSettings);
const mockGetPaginationSettings = vi.mocked(api.getPaginationSettings);
const mockSetPaginationSettings = vi.mocked(api.setPaginationSettings);
const mockSetItemsPerPageGlobally = vi.mocked(setItemsPerPageGlobally);

function makeSettings(overrides: Partial<ScanSettings> = {}): ScanSettings {
  return {
    excludeSamplesFolders: false,
    excludeBackupFolders: false,
    ...overrides,
  };
}

function makeConfirmationSettings(overrides: Partial<ConfirmationSettings> = {}): ConfirmationSettings {
  return {
    confirmTagRemoval: true,
    confirmTabDeletion: true,
    confirmCopy: true,
    confirmMove: true,
    confirmDelete: true,
    ...overrides,
  };
}

function makePaginationSettings(overrides: Partial<PaginationSettings> = {}): PaginationSettings {
  return {
    itemsPerPage: 50,
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof SettingsPanel>[0]> = {}) {
  const props = {
    open: true,
    onClose: () => {},
    ...overrides,
  };
  return { ...render(<SettingsPanel {...props} />), props };
}

beforeEach(() => {
  mockGetScanSettings.mockReset().mockResolvedValue(makeSettings());
  mockSetScanSettings.mockReset().mockResolvedValue(makeSettings());
  mockGetConfirmationSettings.mockReset().mockResolvedValue(makeConfirmationSettings());
  mockSetConfirmationSettings.mockReset().mockResolvedValue(makeConfirmationSettings());
  mockGetPaginationSettings.mockReset().mockResolvedValue(makePaginationSettings());
  mockSetPaginationSettings.mockReset().mockResolvedValue(makePaginationSettings());
  mockSetItemsPerPageGlobally.mockReset();
});

describe("SettingsPanel - load-on-open", () => {
  it("does not call getScanSettings and renders no settings content when the panel is not open", () => {
    renderPanel({ open: false });

    expect(mockGetScanSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("calls getScanSettings and shows a loading message while it resolves, then the settings once loaded", async () => {
    let resolveSettings!: (settings: ScanSettings) => void;
    mockGetScanSettings.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      })
    );
    renderPanel();

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    // Confirmation Settings resolves independently (its own mocked promise, not the one under
    // test here) -- wait for it to settle first so the scan-settings "Loading…" text below is
    // unambiguous rather than colliding with the confirmation section's own loading text.
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirm tag removal/ })).toBeInTheDocument());
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveSettings(makeSettings({ excludeSamplesFolders: true }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Exclude Samples folders/ })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: /Exclude Backup folders/ })).not.toBeChecked();
  });

  it("shows the error message when getScanSettings rejects", async () => {
    mockGetScanSettings.mockReset().mockRejectedValue(new Error("network down"));
    renderPanel();

    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
  });

  it("falls back to a generic error message when the rejection is not an Error instance", async () => {
    mockGetScanSettings.mockReset().mockRejectedValue("nope");
    renderPanel();

    await waitFor(() => expect(screen.getByText("Failed to load settings")).toBeInTheDocument());
  });
});

describe("SettingsPanel - Escape to close", () => {
  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });

    await waitFor(() => expect(mockGetScanSettings).toHaveBeenCalled());
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("SettingsPanel - handleChange optimistic merge", () => {
  it("checks the box immediately (optimistic) without waiting for the save to resolve", async () => {
    let resolveSave!: (settings: ScanSettings) => void;
    mockSetScanSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    const user = userEvent.setup();
    renderPanel();

    const checkbox = await screen.findByRole("checkbox", { name: /Exclude Samples folders/ });
    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(mockSetScanSettings).toHaveBeenCalledWith({ excludeSamplesFolders: true });

    resolveSave(makeSettings({ excludeSamplesFolders: true }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("only merges the changed key into local state, leaving the other setting's value untouched, while the save is still in flight", async () => {
    // Keep the save pending so we can inspect the purely-local optimistic merge
    // before the .then(setSettings) full-replacement from the server response
    // (see the save-state-machine tests below) settles it.
    let resolveSave!: (settings: ReturnType<typeof makeSettings>) => void;
    mockSetScanSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    mockGetScanSettings.mockResolvedValue(makeSettings({ excludeSamplesFolders: false, excludeBackupFolders: true }));
    const user = userEvent.setup();
    renderPanel();

    const samplesBox = await screen.findByRole("checkbox", { name: /Exclude Samples folders/ });
    const backupBox = screen.getByRole("checkbox", { name: /Exclude Backup folders/ });
    expect(backupBox).toBeChecked();

    await user.click(samplesBox);

    expect(samplesBox).toBeChecked();
    expect(backupBox).toBeChecked();
    expect(mockSetScanSettings).toHaveBeenCalledWith({ excludeSamplesFolders: true });

    resolveSave(makeSettings({ excludeSamplesFolders: true, excludeBackupFolders: true }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });
});

describe("SettingsPanel - save state machine", () => {
  it("shows 'Saving…' while the request is in flight, then 'Saved' once it resolves", async () => {
    let resolveSave!: (settings: ScanSettings) => void;
    mockSetScanSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    const user = userEvent.setup();
    renderPanel();

    const checkbox = await screen.findByRole("checkbox", { name: /Exclude Samples folders/ });
    await user.click(checkbox);

    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(checkbox).toBeDisabled();

    resolveSave(makeSettings({ excludeSamplesFolders: true }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
  });

  it("shows 'Failed to save' when the save rejects, keeping the optimistic value (no rollback)", async () => {
    mockSetScanSettings.mockRejectedValue(new Error("save failed"));
    const user = userEvent.setup();
    renderPanel();

    const checkbox = await screen.findByRole("checkbox", { name: /Exclude Samples folders/ });
    await user.click(checkbox);

    await waitFor(() => expect(screen.getByText("Failed to save")).toBeInTheDocument());
    expect(checkbox).toBeChecked();
  });
});

describe("SettingsPanel - Confirmation Settings section", () => {
  it("renders all 5 toggles with the correct initial checked state from getConfirmationSettings", async () => {
    mockGetConfirmationSettings.mockReset().mockResolvedValue(
      makeConfirmationSettings({
        confirmTagRemoval: true,
        confirmTabDeletion: false,
        confirmCopy: true,
        confirmMove: false,
        confirmDelete: true,
      })
    );
    renderPanel();

    expect(await screen.findByRole("checkbox", { name: /Confirm tag removal/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Confirm tab deletion/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Confirm copy/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Confirm move/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Confirm delete/ })).toBeChecked();
  });

  it("calls setConfirmationSettings with the correct partial patch when a toggle is clicked", async () => {
    let resolveSave!: (settings: ConfirmationSettings) => void;
    mockSetConfirmationSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    const user = userEvent.setup();
    renderPanel();

    const checkbox = await screen.findByRole("checkbox", { name: /Confirm delete/ });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);

    expect(checkbox).not.toBeChecked();
    expect(mockSetConfirmationSettings).toHaveBeenCalledWith({ confirmDelete: false });

    resolveSave(makeConfirmationSettings({ confirmDelete: false }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });
});

describe("SettingsPanel - Pagination section", () => {
  it("renders the Items per page input pre-filled with the fetched value", async () => {
    mockGetPaginationSettings.mockReset().mockResolvedValue(makePaginationSettings({ itemsPerPage: 75 }));
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    expect(input).toHaveValue(75);
  });

  it("calls setPaginationSettings with the typed value when Apply is clicked", async () => {
    const user = userEvent.setup();
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "200");

    const applyButton = screen.getByRole("button", { name: "Apply" });
    await user.click(applyButton);

    expect(mockSetPaginationSettings).toHaveBeenCalledWith({ itemsPerPage: 200 });
  });

  it("pushes the new value to every mounted tab via setItemsPerPageGlobally on a successful Apply", async () => {
    mockSetPaginationSettings.mockResolvedValue(makePaginationSettings({ itemsPerPage: 200 }));
    const user = userEvent.setup();
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "200");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(mockSetItemsPerPageGlobally).toHaveBeenCalledWith(200));
  });

  it("shows the Saved indicator after a successful Apply", async () => {
    const user = userEvent.setup();
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "100");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(screen.getAllByText("Saved").length).toBeGreaterThan(0));
  });

  it("disables Apply when the input is out of range (below the minimum of 10)", async () => {
    const user = userEvent.setup();
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "5");

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("disables Apply when the input is out of range (above the maximum of 500)", async () => {
    const user = userEvent.setup();
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "501");

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("disables Apply when the input is empty", async () => {
    const user = userEvent.setup();
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("disables Apply when the input is unchanged from the currently-applied value", async () => {
    mockGetPaginationSettings.mockReset().mockResolvedValue(makePaginationSettings({ itemsPerPage: 50 }));
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    expect(input).toHaveValue(50);
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("does not call setItemsPerPageGlobally and shows an error when the save rejects", async () => {
    mockSetPaginationSettings.mockRejectedValue(new Error("itemsPerPage must be an integer between 10 and 500"));
    const user = userEvent.setup();
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "100");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(screen.getByText("itemsPerPage must be an integer between 10 and 500")).toBeInTheDocument()
    );
    expect(mockSetItemsPerPageGlobally).not.toHaveBeenCalled();
  });
});
