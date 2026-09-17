import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPanel from "../SettingsPanel.js";
import type { ScanSettings } from "../../api/client.js";

vi.mock("../../api/client.js", () => ({
  getScanSettings: vi.fn(),
  setScanSettings: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockGetScanSettings = vi.mocked(api.getScanSettings);
const mockSetScanSettings = vi.mocked(api.setScanSettings);

function makeSettings(overrides: Partial<ScanSettings> = {}): ScanSettings {
  return {
    excludeSamplesFolders: false,
    excludeBackupFolders: false,
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
