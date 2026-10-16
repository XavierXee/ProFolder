import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  getConfig: vi.fn(),
  getDbLocation: vi.fn(),
  chooseDbLocation: vi.fn(),
  setDbLocation: vi.fn(),
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
const mockGetConfig = vi.mocked(api.getConfig);
const mockGetDbLocation = vi.mocked(api.getDbLocation);
const mockChooseDbLocation = vi.mocked(api.chooseDbLocation);
const mockSetDbLocation = vi.mocked(api.setDbLocation);

function makeSettings(overrides: Partial<ScanSettings> = {}): ScanSettings {
  return {
    excludeSamplesFolders: false,
    excludeBackupFolders: false,
    excludeFolderPatternEnabled: false,
    excludeFolderPattern: "Stems|STEMS",
    duplicateMatchThresholdPercent: 58,
    ...overrides,
  };
}

function makeConfirmationSettings(overrides: Partial<ConfirmationSettings> = {}): ConfirmationSettings {
  return {
    confirmTabDeletion: true,
    confirmCopy: true,
    confirmMove: true,
    confirmDelete: true,
    confirmStatusDeletion: true,
    confirmTagDeletion: true,
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
    theme: "profolder" as const,
    setTheme: () => {},
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
  // Default to web mode so existing tests above (written before the Data Location section
  // existed) don't need to know about it; desktop-mode behavior gets its own describe block.
  mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music", runtimeMode: "web" });
  mockGetDbLocation.mockReset().mockResolvedValue({ dbPath: "/Users/test/Library/data/library.db" });
  mockChooseDbLocation.mockReset().mockResolvedValue(undefined);
  mockSetDbLocation.mockReset().mockResolvedValue({ dbPath: "/Users/test/Library/data/library.db" });
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
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirm tab deletion/ })).toBeInTheDocument());
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

describe("SettingsPanel - bottom notification auto-dismiss", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-dismisses a 'Saved' message after 2 seconds", async () => {
    mockSetScanSettings.mockResolvedValue(makeSettings({ excludeSamplesFolders: true }));
    renderPanel();
    const checkbox = await screen.findByRole("checkbox", { name: /Exclude Samples folders/ });

    // Fake timers must already be active when the click fires the request, so the component's
    // own setTimeout(…, 2000) (scheduled once the mocked save resolves) is captured by the fake
    // clock rather than a real one — see App.pagination.test.tsx's identical rationale for why
    // fireEvent + vi.advanceTimersByTime is used here instead of userEvent.
    vi.useFakeTimers();
    fireEvent.click(checkbox);
    await act(async () => {});

    expect(screen.getByText("Saved")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("auto-dismisses a 'Failed to save' message after 2 seconds", async () => {
    mockSetScanSettings.mockRejectedValue(new Error("save failed"));
    renderPanel();
    const checkbox = await screen.findByRole("checkbox", { name: /Exclude Samples folders/ });

    vi.useFakeTimers();
    fireEvent.click(checkbox);
    await act(async () => {});

    expect(screen.getByText("Failed to save")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("Failed to save")).not.toBeInTheDocument();
  });

  it("does not dismiss a 'Saving…' message after 2 seconds while the request is still in flight", async () => {
    mockSetScanSettings.mockReturnValue(new Promise(() => {})); // never resolves
    renderPanel();
    const checkbox = await screen.findByRole("checkbox", { name: /Exclude Samples folders/ });

    vi.useFakeTimers();
    fireEvent.click(checkbox);
    await act(async () => {});

    expect(screen.getByText("Saving…")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // A slow save's only feedback must not vanish while still in flight — unlike "Saved"/
    // "Failed to save", "saving" is never given an auto-dismiss timer in the first place.
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it("a new action's 'Saving…' survives past when an earlier message's now-superseded dismiss timer would have fired", async () => {
    let resolveFirstSave!: (settings: ScanSettings) => void;
    mockSetScanSettings.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstSave = resolve;
      })
    );
    renderPanel();
    const samplesCheckbox = await screen.findByRole("checkbox", { name: /Exclude Samples folders/ });
    const backupCheckbox = screen.getByRole("checkbox", { name: /Exclude Backup folders/ });

    vi.useFakeTimers();
    fireEvent.click(samplesCheckbox);
    resolveFirstSave(makeSettings({ excludeSamplesFolders: true }));
    await act(async () => {});
    expect(screen.getByText("Saved")).toBeInTheDocument();

    // Let 1.5s of the first message's 2s dismiss timer elapse, then trigger a second, slower
    // save before it fires.
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    mockSetScanSettings.mockReturnValue(new Promise(() => {})); // never resolves
    fireEvent.click(backupCheckbox);
    await act(async () => {});
    expect(screen.getByText("Saving…")).toBeInTheDocument();

    // Advance another 1s — 2.5s total since the first message appeared, well past its own 2s
    // mark, which would have cleared the notification if the first timer hadn't been canceled
    // when the second save started.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });
});

describe("SettingsPanel - Confirmation Settings section", () => {
  it("renders all 6 toggles with the correct initial checked state from getConfirmationSettings", async () => {
    mockGetConfirmationSettings.mockReset().mockResolvedValue(
      makeConfirmationSettings({
        confirmTabDeletion: false,
        confirmCopy: true,
        confirmMove: false,
        confirmDelete: true,
        confirmStatusDeletion: false,
        confirmTagDeletion: true,
      })
    );
    renderPanel();

    expect(await screen.findByRole("checkbox", { name: /Confirm tab deletion/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Confirm copy/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Confirm move/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Confirm delete/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Confirm status deletion/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Confirm tag deletion/ })).toBeChecked();
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

  it("calls setConfirmationSettings with { confirmStatusDeletion: false } when the status-deletion toggle is clicked", async () => {
    let resolveSave!: (settings: ConfirmationSettings) => void;
    mockSetConfirmationSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    const user = userEvent.setup();
    renderPanel();

    const checkbox = await screen.findByRole("checkbox", { name: /Confirm status deletion/ });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);

    expect(checkbox).not.toBeChecked();
    expect(mockSetConfirmationSettings).toHaveBeenCalledWith({ confirmStatusDeletion: false });

    resolveSave(makeConfirmationSettings({ confirmStatusDeletion: false }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("calls setConfirmationSettings with { confirmTagDeletion: false } when the tag-deletion toggle is clicked", async () => {
    let resolveSave!: (settings: ConfirmationSettings) => void;
    mockSetConfirmationSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    const user = userEvent.setup();
    renderPanel();

    const checkbox = await screen.findByRole("checkbox", { name: /Confirm tag deletion/ });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);

    expect(checkbox).not.toBeChecked();
    expect(mockSetConfirmationSettings).toHaveBeenCalledWith({ confirmTagDeletion: false });

    resolveSave(makeConfirmationSettings({ confirmTagDeletion: false }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("shows 'Saving…' then 'Failed to save' for the new toggles the same way the existing ones do", async () => {
    mockSetConfirmationSettings.mockRejectedValue(new Error("save failed"));
    const user = userEvent.setup();
    renderPanel();

    const checkbox = await screen.findByRole("checkbox", { name: /Confirm status deletion/ });
    await user.click(checkbox);

    await waitFor(() => expect(screen.getByText("Failed to save")).toBeInTheDocument());
    expect(checkbox).not.toBeChecked();
  });
});

// the project notes' documented 50ms auto-focus hazard: SettingsPanel.tsx's
// mount effect does `setTimeout(() => closeRef.current?.focus(), 50)`. Under real-timer
// userEvent's default inter-keystroke delays, a `.clear()`/`.type()` sequence run shortly after
// mount can straddle that window and have focus stolen mid-type, dropping input. Every `user`
// instance below uses `delay: null` to close the race (matching this codebase's established fix
// for this exact hazard — see FileDetailPanel.test.tsx's/ProjectDetailPanel.test.tsx's "tags
// optimistic update" tests).
describe("SettingsPanel - Pagination section", () => {
  it("renders the Items per page input pre-filled with the fetched value", async () => {
    mockGetPaginationSettings.mockReset().mockResolvedValue(makePaginationSettings({ itemsPerPage: 75 }));
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    expect(input).toHaveValue(75);
  });

  it("calls setPaginationSettings with the typed value when Apply is clicked", async () => {
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "200");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(mockSetItemsPerPageGlobally).toHaveBeenCalledWith(200));
  });

  it("shows the Saved indicator after a successful Apply", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "100");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(screen.getAllByText("Saved").length).toBeGreaterThan(0));
  });

  it("disables Apply when the input is out of range (below the minimum of 5)", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "4");

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("enables Apply when the input is exactly the minimum of 5", async () => {
    mockGetPaginationSettings.mockReset().mockResolvedValue(makePaginationSettings({ itemsPerPage: 50 }));
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "5");

    expect(screen.getByRole("button", { name: "Apply" })).not.toBeDisabled();
  });

  it("disables Apply when the input is out of range (above the maximum of 500)", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "501");

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("disables Apply when the input is empty", async () => {
    const user = userEvent.setup({ delay: null });
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
    mockSetPaginationSettings.mockRejectedValue(new Error("itemsPerPage must be an integer between 5 and 500"));
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Items per page");
    await user.clear(input);
    await user.type(input, "100");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(screen.getByText("itemsPerPage must be an integer between 5 and 500")).toBeInTheDocument()
    );
    expect(mockSetItemsPerPageGlobally).not.toHaveBeenCalled();
  });
});

describe("SettingsPanel - Duplicate match threshold section", () => {
  it("renders the duplicate match threshold input pre-filled with the fetched value", async () => {
    mockGetScanSettings.mockReset().mockResolvedValue(makeSettings({ duplicateMatchThresholdPercent: 70 }));
    renderPanel();

    const input = await screen.findByLabelText("Duplicate match threshold (%)");
    expect(input).toHaveValue(70);
  });

  it("disables Apply when the input is unchanged from the currently-applied value", async () => {
    mockGetScanSettings.mockReset().mockResolvedValue(makeSettings({ duplicateMatchThresholdPercent: 58 }));
    renderPanel();

    const input = await screen.findByLabelText("Duplicate match threshold (%)");
    expect(input).toHaveValue(58);
    expect(screen.getByRole("button", { name: "Apply duplicate match threshold" })).toBeDisabled();
  });

  it("disables Apply when the input is below the minimum of 10", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Duplicate match threshold (%)");
    await user.clear(input);
    await user.type(input, "5");

    expect(screen.getByRole("button", { name: "Apply duplicate match threshold" })).toBeDisabled();
  });

  it("disables Apply when the input is above the maximum of 100", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Duplicate match threshold (%)");
    await user.clear(input);
    await user.type(input, "150");

    expect(screen.getByRole("button", { name: "Apply duplicate match threshold" })).toBeDisabled();
  });

  it("disables Apply when the input is a non-integer value", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Duplicate match threshold (%)");
    await user.clear(input);
    await user.type(input, "58.5");

    expect(screen.getByRole("button", { name: "Apply duplicate match threshold" })).toBeDisabled();
  });

  it("calls setScanSettings with the typed value when the disambiguated Apply button is clicked, then resyncs the input from the response", async () => {
    mockSetScanSettings.mockReset().mockResolvedValue(makeSettings({ duplicateMatchThresholdPercent: 45 }));
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Duplicate match threshold (%)");
    await user.clear(input);
    await user.type(input, "45");

    const applyButton = screen.getByRole("button", { name: "Apply duplicate match threshold" });
    expect(applyButton).not.toBeDisabled();
    await user.click(applyButton);

    expect(mockSetScanSettings).toHaveBeenCalledWith({ duplicateMatchThresholdPercent: 45 });
    await waitFor(() => expect(input).toHaveValue(45));
  });

  it("shows the real backend error message when setScanSettings rejects for a client-valid value", async () => {
    mockSetScanSettings.mockReset().mockRejectedValue(
      new Error("duplicateMatchThresholdPercent must be an integer between 10 and 100")
    );
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Duplicate match threshold (%)");
    await user.clear(input);
    await user.type(input, "45");
    await user.click(screen.getByRole("button", { name: "Apply duplicate match threshold" }));

    await waitFor(() =>
      expect(
        screen.getByText("duplicateMatchThresholdPercent must be an integer between 10 and 100")
      ).toBeInTheDocument()
    );
  });

  it("does not call setScanSettings while typing, only when Apply is clicked", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Duplicate match threshold (%)");
    await user.clear(input);
    await user.type(input, "45");

    expect(mockSetScanSettings).not.toHaveBeenCalled();
  });

  it("shows the reworded scan-settings footer copy, with no trace of the old blanket wording", async () => {
    renderPanel();

    await screen.findByLabelText("Duplicate match threshold (%)");

    expect(screen.getByText("Folder exclusion changes apply the next time you run a scan.")).toBeInTheDocument();
    expect(screen.queryByText("Changes apply the next time you run a scan.")).not.toBeInTheDocument();
  });
});

describe("SettingsPanel - Exclude folders by pattern section", () => {
  it("renders the checkbox unchecked and the pattern input pre-filled with the fetched (default) value", async () => {
    mockGetScanSettings
      .mockReset()
      .mockResolvedValue(makeSettings({ excludeFolderPatternEnabled: false, excludeFolderPattern: "Stems|STEMS" }));
    renderPanel();

    const checkbox = await screen.findByRole("checkbox", { name: /Exclude folders by pattern/ });
    expect(checkbox).not.toBeChecked();
    const input = screen.getByLabelText("Pattern (regular expression)");
    expect(input).toHaveValue("Stems|STEMS");
  });

  it("disables the pattern input and its Apply button while the checkbox is unchecked", async () => {
    mockGetScanSettings.mockReset().mockResolvedValue(makeSettings({ excludeFolderPatternEnabled: false }));
    renderPanel();

    await screen.findByRole("checkbox", { name: /Exclude folders by pattern/ });
    expect(screen.getByLabelText("Pattern (regular expression)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply exclude folder pattern" })).toBeDisabled();
  });

  it("enables the pattern input once the checkbox is checked", async () => {
    mockGetScanSettings.mockReset().mockResolvedValue(makeSettings({ excludeFolderPatternEnabled: false }));
    mockSetScanSettings.mockResolvedValue(makeSettings({ excludeFolderPatternEnabled: true }));
    const user = userEvent.setup();
    renderPanel();

    const checkbox = await screen.findByRole("checkbox", { name: /Exclude folders by pattern/ });
    await user.click(checkbox);

    await waitFor(() => expect(screen.getByLabelText("Pattern (regular expression)")).not.toBeDisabled());
  });

  it("disables Apply when the input is unchanged from the currently-applied value", async () => {
    mockGetScanSettings.mockReset().mockResolvedValue(
      makeSettings({ excludeFolderPatternEnabled: true, excludeFolderPattern: "Stems|STEMS" })
    );
    renderPanel();

    await screen.findByLabelText("Pattern (regular expression)");
    expect(screen.getByRole("button", { name: "Apply exclude folder pattern" })).toBeDisabled();
  });

  it("disables Apply when the input is empty", async () => {
    mockGetScanSettings.mockReset().mockResolvedValue(makeSettings({ excludeFolderPatternEnabled: true }));
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Pattern (regular expression)");
    await user.clear(input);

    expect(screen.getByRole("button", { name: "Apply exclude folder pattern" })).toBeDisabled();
  });

  it("disables Apply when the input is not a syntactically valid regex", async () => {
    mockGetScanSettings.mockReset().mockResolvedValue(makeSettings({ excludeFolderPatternEnabled: true }));
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Pattern (regular expression)");
    await user.clear(input);
    await user.type(input, "(unterminated");

    expect(screen.getByRole("button", { name: "Apply exclude folder pattern" })).toBeDisabled();
  });

  it("calls setScanSettings with the typed pattern when Apply is clicked, then resyncs the input from the response", async () => {
    mockGetScanSettings.mockReset().mockResolvedValue(makeSettings({ excludeFolderPatternEnabled: true }));
    mockSetScanSettings.mockReset().mockResolvedValue(
      makeSettings({ excludeFolderPatternEnabled: true, excludeFolderPattern: "^Render" })
    );
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Pattern (regular expression)");
    await user.clear(input);
    await user.type(input, "^Render");

    const applyButton = screen.getByRole("button", { name: "Apply exclude folder pattern" });
    expect(applyButton).not.toBeDisabled();
    await user.click(applyButton);

    expect(mockSetScanSettings).toHaveBeenCalledWith({ excludeFolderPattern: "^Render" });
    await waitFor(() => expect(input).toHaveValue("^Render"));
  });

  it("shows the real backend error message when setScanSettings rejects for a client-valid pattern", async () => {
    mockGetScanSettings.mockReset().mockResolvedValue(makeSettings({ excludeFolderPatternEnabled: true }));
    mockSetScanSettings.mockReset().mockRejectedValue(
      new Error("excludeFolderPattern must be a valid regular expression")
    );
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Pattern (regular expression)");
    await user.clear(input);
    await user.type(input, "^Render");
    await user.click(screen.getByRole("button", { name: "Apply exclude folder pattern" }));

    await waitFor(() =>
      expect(screen.getByText("excludeFolderPattern must be a valid regular expression")).toBeInTheDocument()
    );
  });

  it("does not call setScanSettings while typing, only when Apply is clicked", async () => {
    mockGetScanSettings.mockReset().mockResolvedValue(makeSettings({ excludeFolderPatternEnabled: true }));
    const user = userEvent.setup({ delay: null });
    renderPanel();

    const input = await screen.findByLabelText("Pattern (regular expression)");
    await user.clear(input);
    await user.type(input, "^Render");

    expect(mockSetScanSettings).not.toHaveBeenCalled();
  });
});

describe("SettingsPanel - Data Location section (desktop-only)", () => {
  it("does not render the Data Location section at all in web mode, not even while the mode check is loading", async () => {
    let resolveConfig!: (config: { musicRoot: string; runtimeMode: "web" | "desktop" }) => void;
    mockGetConfig.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveConfig = resolve;
      })
    );
    renderPanel();

    // Still resolving getConfig -- must not flash the section before we know the mode.
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirm tab deletion/ })).toBeInTheDocument());
    expect(screen.queryByText("Data Location")).not.toBeInTheDocument();

    resolveConfig({ musicRoot: "/music", runtimeMode: "web" });

    // Give any pending microtasks a chance to flush, then confirm it's still absent.
    await waitFor(() => expect(mockGetConfig).toHaveBeenCalled());
    expect(screen.queryByText("Data Location")).not.toBeInTheDocument();
    expect(mockGetDbLocation).not.toHaveBeenCalled();
  });

  it("renders the section with the current db path when runtimeMode is desktop", async () => {
    mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music", runtimeMode: "desktop" });
    mockGetDbLocation.mockReset().mockResolvedValue({ dbPath: "/Users/test/Library/data/library.db" });
    renderPanel();

    expect(await screen.findByText("Data Location")).toBeInTheDocument();
    expect(await screen.findByText("/Users/test/Library/data/library.db")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose…" })).toBeInTheDocument();
  });

  it("shows a pending confirm step (Apply & Restart / Cancel) after choosing a file, without calling setDbLocation yet", async () => {
    mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music", runtimeMode: "desktop" });
    mockChooseDbLocation.mockReset().mockResolvedValue("/Volumes/External/new-library.db");
    const user = userEvent.setup();
    renderPanel();

    const chooseButton = await screen.findByRole("button", { name: "Choose…" });
    await user.click(chooseButton);

    expect(await screen.findByText("/Volumes/External/new-library.db")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply & Restart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(mockSetDbLocation).not.toHaveBeenCalled();
  });

  it("calls setDbLocation and shows a restarting state when Apply & Restart is confirmed", async () => {
    mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music", runtimeMode: "desktop" });
    mockChooseDbLocation.mockReset().mockResolvedValue("/Volumes/External/new-library.db");
    mockSetDbLocation.mockReset().mockResolvedValue({ dbPath: "/Volumes/External/new-library.db" });
    const user = userEvent.setup();
    renderPanel();

    const chooseButton = await screen.findByRole("button", { name: "Choose…" });
    await user.click(chooseButton);
    const applyButton = await screen.findByRole("button", { name: "Apply & Restart" });
    await user.click(applyButton);

    expect(mockSetDbLocation).toHaveBeenCalledWith("/Volumes/External/new-library.db");
    await waitFor(() => expect(screen.getByText(/Restarting…/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Apply & Restart" })).not.toBeInTheDocument();
  });

  it("shows an inline error and lets the user retry when setDbLocation rejects", async () => {
    mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music", runtimeMode: "desktop" });
    mockChooseDbLocation.mockReset().mockResolvedValue("/Volumes/External/corrupt.db");
    mockSetDbLocation.mockReset().mockRejectedValue(new Error("Not a valid SQLite database file"));
    const user = userEvent.setup();
    renderPanel();

    const chooseButton = await screen.findByRole("button", { name: "Choose…" });
    await user.click(chooseButton);
    await user.click(await screen.findByRole("button", { name: "Apply & Restart" }));

    await waitFor(() => expect(screen.getByText("Not a valid SQLite database file")).toBeInTheDocument());
    // Not stuck: the pending confirm step (with Apply & Restart still available) remains so the
    // user can retry or cancel, rather than the panel getting stuck in a dead-end state.
    expect(screen.getByRole("button", { name: "Apply & Restart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows an inline error and lets the user retry when chooseDbLocation rejects", async () => {
    mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music", runtimeMode: "desktop" });
    mockChooseDbLocation.mockReset().mockRejectedValue(new Error("Could not open the file picker"));
    const user = userEvent.setup();
    renderPanel();

    const chooseButton = await screen.findByRole("button", { name: "Choose…" });
    await user.click(chooseButton);

    await waitFor(() => expect(screen.getByText("Could not open the file picker")).toBeInTheDocument());
    // Still able to retry: the Choose… button remains, no pending confirm step was entered.
    expect(screen.getByRole("button", { name: "Choose…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply & Restart" })).not.toBeInTheDocument();
  });

  it("leaves the current path unchanged with no pending state when the picker is canceled", async () => {
    mockGetConfig.mockReset().mockResolvedValue({ musicRoot: "/music", runtimeMode: "desktop" });
    mockGetDbLocation.mockReset().mockResolvedValue({ dbPath: "/Users/test/Library/data/library.db" });
    mockChooseDbLocation.mockReset().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel();

    const chooseButton = await screen.findByRole("button", { name: "Choose…" });
    await screen.findByText("/Users/test/Library/data/library.db");
    await user.click(chooseButton);

    await waitFor(() => expect(mockChooseDbLocation).toHaveBeenCalled());
    expect(screen.getByText("/Users/test/Library/data/library.db")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply & Restart" })).not.toBeInTheDocument();
    expect(mockSetDbLocation).not.toHaveBeenCalled();
  });
});
