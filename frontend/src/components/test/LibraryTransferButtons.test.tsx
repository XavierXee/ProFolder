import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LibraryTransferButtons, {
  clearPendingImportMessage,
  describeImport,
  peekPendingImportMessage,
} from "../LibraryTransferButtons.js";
import type { ImportSummary } from "../../types.js";

vi.mock("../../api/client.js", () => ({
  exportLibrary: vi.fn(),
  importLibrary: vi.fn(),
}));

import * as api from "../../api/client.js";

const mockExport = vi.mocked(api.exportLibrary);
const mockImport = vi.mocked(api.importLibrary);

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    projects: { updated: 0, unchanged: 0, notInLibrary: 0 },
    files: { updated: 0, unchanged: 0, notInLibrary: 0 },
    statusesAdded: 0,
    tagsAdded: 0,
    customTabsAdded: 0,
    customTabsKept: 0,
    settingsApplied: 0,
    settingsKept: 0,
    scanExclusionsApplied: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockExport.mockReset().mockResolvedValue({ blob: new Blob(["xlsx"]), filename: "ProFolder export 2026-11-04.xlsx" });
  mockImport.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
});

describe("describeImport", () => {
  it("lists what was filled in, added and applied, and how many items were skipped", () => {
    expect(
      describeImport(
        summary({
          files: { updated: 12, unchanged: 3, notInLibrary: 4 },
          projects: { updated: 1, unchanged: 0, notInLibrary: 1 },
          statusesAdded: 1,
          tagsAdded: 2,
          customTabsAdded: 1,
          settingsApplied: 3,
          scanExclusionsApplied: true,
        })
      )
    ).toBe(
      "Import complete: 12 audio files and 1 project folder filled in; 1 status, 2 tags, 1 custom tab added; " +
        "3 settings applied; scan exclusions applied. 5 items not in this library skipped."
    );
  });

  it("says when there was nothing new", () => {
    expect(describeImport(summary({ files: { updated: 0, unchanged: 8, notInLibrary: 0 } }))).toBe(
      "Import complete: nothing new to add."
    );
  });
});

describe("pending import message", () => {
  it("reads the message saved before the reload until it's cleared", () => {
    sessionStorage.setItem("musicLibraryManager.importMessage", "Import complete: nothing new to add.");
    expect(peekPendingImportMessage()).toBe("Import complete: nothing new to add.");
    expect(peekPendingImportMessage()).toBe("Import complete: nothing new to add.");
    clearPendingImportMessage();
    expect(peekPendingImportMessage()).toBeUndefined();
  });
});

describe("LibraryTransferButtons - export", () => {
  it("asks where to save first, then writes the workbook there", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const picker = vi.fn().mockResolvedValue({ createWritable: async () => ({ write, close }) });
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = picker;
    const onMessage = vi.fn();
    const user = userEvent.setup();
    render(<LibraryTransferButtons onMessage={onMessage} />);

    await user.click(screen.getByRole("button", { name: "Export library" }));

    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("Library exported."));
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: expect.stringMatching(/^ProFolder export \d{4}-\d{2}-\d{2}\.xlsx$/) }));
    expect(picker.mock.invocationCallOrder[0]).toBeLessThan(mockExport.mock.invocationCallOrder[0]!);
    expect(write).toHaveBeenCalledWith(expect.any(Blob));
    expect(close).toHaveBeenCalled();
  });

  it("does nothing when the save dialog is cancelled", async () => {
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi
      .fn()
      .mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const onMessage = vi.fn();
    const user = userEvent.setup();
    render(<LibraryTransferButtons onMessage={onMessage} />);

    await user.click(screen.getByRole("button", { name: "Export library" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Export library" })).toBeEnabled());
    expect(mockExport).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("falls back to a regular download where there's no save dialog", async () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const onMessage = vi.fn();
    const user = userEvent.setup();
    render(<LibraryTransferButtons onMessage={onMessage} />);

    await user.click(screen.getByRole("button", { name: "Export library" }));

    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("Library exported."));
    expect(click).toHaveBeenCalled();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe("ProFolder export 2026-11-04.xlsx");
    click.mockRestore();
  });

  it("reports a failed export", async () => {
    mockExport.mockRejectedValue(new Error("disk full"));
    const onMessage = vi.fn();
    const user = userEvent.setup();
    render(<LibraryTransferButtons onMessage={onMessage} />);
    URL.createObjectURL = vi.fn(() => "blob:x");

    await user.click(screen.getByRole("button", { name: "Export library" }));

    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("Export failed: disk full"));
  });
});

describe("LibraryTransferButtons - import", () => {
  const workbook = new File(["xlsx"], "export.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  it("opens a file chooser for .xlsx files", async () => {
    const user = userEvent.setup();
    render(<LibraryTransferButtons onMessage={vi.fn()} />);
    const input = screen.getByTestId("library-import-input") as HTMLInputElement;
    const click = vi.spyOn(input, "click");

    await user.click(screen.getByRole("button", { name: "Import library" }));

    expect(click).toHaveBeenCalled();
    expect(input.accept).toContain(".xlsx");
  });

  it("uploads the chosen file, saves the summary and reloads the app", async () => {
    mockImport.mockResolvedValue(summary({ tagsAdded: 2 }));
    const reload = vi.fn();
    render(<LibraryTransferButtons onMessage={vi.fn()} reload={reload} />);

    fireEvent.change(screen.getByTestId("library-import-input"), { target: { files: [workbook] } });

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(mockImport).toHaveBeenCalledWith(workbook);
    expect(peekPendingImportMessage()).toBe("Import complete: 2 tags added.");
  });

  it("reports a rejected file without reloading", async () => {
    mockImport.mockRejectedValue(new Error("This workbook isn't a ProFolder library export."));
    const reload = vi.fn();
    const onMessage = vi.fn();
    render(<LibraryTransferButtons onMessage={onMessage} reload={reload} />);

    fireEvent.change(screen.getByTestId("library-import-input"), { target: { files: [workbook] } });

    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("Import failed: This workbook isn't a ProFolder library export."));
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Import library" })).toBeEnabled();
  });
});
