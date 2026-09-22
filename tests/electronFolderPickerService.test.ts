import { beforeEach, describe, expect, it, vi } from "vitest";

// Establishes the pattern for mocking Electron's `dialog` module in this repo's test suite:
// no other test currently mocks `electron`, since this is the first test exercising an
// Electron-only service. `dialog.showOpenDialog` is the only member exercised here.
vi.mock("electron", () => ({
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

import { dialog } from "electron";
import { ElectronFolderPickerService } from "../src/services/ElectronFolderPickerService.js";

describe("ElectronFolderPickerService", () => {
  beforeEach(() => {
    vi.mocked(dialog.showOpenDialog).mockReset();
  });

  it("resolves with the chosen path when the user picks a folder", async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ["/Users/test/Music"],
    });

    const result = await new ElectronFolderPickerService().chooseFolder("Select a folder");

    expect(result).toBe("/Users/test/Music");
  });

  it("resolves with undefined when the user cancels the dialog", async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    const result = await new ElectronFolderPickerService().chooseFolder("Select a folder");

    expect(result).toBeUndefined();
  });

  // Real Electron responses always pair canceled:true with an empty filePaths array, so the
  // test above alone can't tell whether the implementation actually checks `canceled` or just
  // happens to fall through on an empty array. This adversarial (shouldn't-happen-per-Electron's-
  // own-docs, but meaningful) case pins down that `canceled` itself is checked.
  it("resolves with undefined when canceled is true even if filePaths is non-empty (defensive check)", async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: true,
      filePaths: ["/Users/test/Music"],
    });

    const result = await new ElectronFolderPickerService().chooseFolder("Select a folder");

    expect(result).toBeUndefined();
  });
});
