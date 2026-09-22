import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { showItemInFolderMock } = vi.hoisted(() => ({
  showItemInFolderMock: vi.fn(),
}));

vi.mock("electron", () => ({
  shell: {
    showItemInFolder: showItemInFolderMock,
  },
}));

import { ElectronFinderService } from "../src/services/ElectronFinderService.js";

// isWithinRoot (used internally by revealInFinder) resolves real paths via fs.realpathSync
// to defend against symlinks, so these fixtures use real files/directories under a tmpdir
// rather than made-up paths — mirrors tests/finderService.test.ts's MacFinderService coverage.
describe("ElectronFinderService.revealInFinder", () => {
  let root: string;

  beforeEach(() => {
    showItemInFolderMock.mockClear();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "electron-finder-service-test-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rejects a path outside the configured music root BEFORE calling shell.showItemInFolder", async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "electron-finder-service-test-other-"));
    const secretPath = path.join(other, "secret.txt");
    fs.writeFileSync(secretPath, "");
    const service = new ElectronFinderService(() => root);

    try {
      await expect(service.revealInFinder(secretPath)).rejects.toThrow(
        /outside the configured music root/
      );
      expect(showItemInFolderMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("calls shell.showItemInFolder with the resolved path for a path inside the configured music root", async () => {
    const songDir = path.join(root, "Song");
    fs.mkdirSync(songDir, { recursive: true });
    const trackPath = path.join(songDir, "track.als");
    fs.writeFileSync(trackPath, "");
    const service = new ElectronFinderService(() => root);

    await expect(service.revealInFinder(trackPath)).resolves.toBeUndefined();
    expect(showItemInFolderMock).toHaveBeenCalledWith(trackPath);
  });

  it("throws (fails closed) for a path that doesn't exist on disk", async () => {
    // Regression guard for the fail-closed requirement on isWithinRoot: fs.realpathSync
    // throws ENOENT for a nonexistent path, which must be treated as NOT contained rather
    // than propagating the error or defaulting to "allowed".
    const missingPath = path.join(root, "does-not-exist.als");
    const service = new ElectronFinderService(() => root);

    await expect(service.revealInFinder(missingPath)).rejects.toThrow(
      /outside the configured music root/
    );
    expect(showItemInFolderMock).not.toHaveBeenCalled();
  });
});
