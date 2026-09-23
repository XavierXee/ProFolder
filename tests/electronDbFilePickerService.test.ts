import { beforeEach, describe, expect, it, vi } from "vitest";

// Mirrors electronFolderPickerService.test.ts's established pattern for mocking Electron's
// `dialog` module.
vi.mock("electron", () => ({
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

import { dialog } from "electron";
import { ElectronDbFilePickerService } from "../src/services/ElectronDbFilePickerService.js";

describe("ElectronDbFilePickerService", () => {
  beforeEach(() => {
    vi.mocked(dialog.showOpenDialog).mockReset();
  });

  it("resolves with the chosen path when the user picks a file", async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ["/Users/test/Music/library.db"],
    });

    const result = await new ElectronDbFilePickerService().chooseDbFile("Select a database file");

    expect(result).toBe("/Users/test/Music/library.db");
  });

  it("uses the openFile dialog mode with a .db filter, not the openDirectory mode a folder picker would use", async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    await new ElectronDbFilePickerService().chooseDbFile("Select a database file");

    expect(dialog.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: ["openFile"],
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      })
    );
    // Explicitly proves the folder-picker mode is NOT what's being requested — this codebase's
    // sibling ElectronFolderPickerService uses ["openDirectory"] for the exact same call shape,
    // so this is the one line that actually distinguishes the two implementations.
    const call = vi.mocked(dialog.showOpenDialog).mock.calls[0]?.[0];
    expect(call?.properties ?? []).not.toContain("openDirectory");
  });

  it("resolves with undefined when the user cancels the dialog", async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    const result = await new ElectronDbFilePickerService().chooseDbFile("Select a database file");

    expect(result).toBeUndefined();
  });

  // Real Electron responses always pair canceled:true with an empty filePaths array, so the
  // test above alone can't tell whether the implementation actually checks `canceled` or just
  // happens to fall through on an empty array. This adversarial (shouldn't-happen-per-Electron's-
  // own-docs, but meaningful) case pins down that `canceled` itself is checked.
  it("resolves with undefined when canceled is true even if filePaths is non-empty (defensive check)", async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: true,
      filePaths: ["/Users/test/Music/library.db"],
    });

    const result = await new ElectronDbFilePickerService().chooseDbFile("Select a database file");

    expect(result).toBeUndefined();
  });
});
