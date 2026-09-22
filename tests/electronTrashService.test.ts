import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { trashItemMock } = vi.hoisted(() => ({
  trashItemMock: vi.fn(async () => undefined),
}));

vi.mock("electron", () => ({
  shell: {
    trashItem: trashItemMock,
  },
}));

import { ElectronTrashService } from "../src/services/ElectronTrashService.js";
import { PathOutsideRootError } from "../src/services/TrashService.js";

// isWithinRoot (used internally by trash) resolves real paths via fs.realpathSync to defend
// against symlinks, so these fixtures use real files/directories under a tmpdir rather than
// made-up paths — mirrors tests/trashService.test.ts's MacTrashService coverage and
// tests/electronFinderService.test.ts's ElectronFinderService coverage.
describe("ElectronTrashService.trash", () => {
  let root: string;

  beforeEach(() => {
    trashItemMock.mockClear();
    trashItemMock.mockImplementation(async () => undefined);
    root = fs.mkdtempSync(path.join(os.tmpdir(), "electron-trash-service-test-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("trashes a single path inside the root via one shell.trashItem call", async () => {
    const trackPath = path.join(root, "track.als");
    fs.writeFileSync(trackPath, "");
    const service = new ElectronTrashService(() => root);

    await expect(service.trash([trackPath])).resolves.toBeUndefined();

    expect(trashItemMock).toHaveBeenCalledTimes(1);
    expect(trashItemMock).toHaveBeenCalledWith(trackPath);
  });

  it("calls shell.trashItem once per path for a batch of 3+ paths", async () => {
    const paths = ["a.als", "b.als", "c.als"].map((name) => {
      const p = path.join(root, name);
      fs.writeFileSync(p, "");
      return p;
    });
    const service = new ElectronTrashService(() => root);

    await expect(service.trash(paths)).resolves.toBeUndefined();

    expect(trashItemMock).toHaveBeenCalledTimes(3);
    for (const p of paths) {
      expect(trashItemMock).toHaveBeenCalledWith(p);
    }
  });

  it("rejects without invoking shell.trashItem when a path is outside the configured root", async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "electron-trash-service-test-other-"));
    const secretPath = path.join(other, "secret.txt");
    fs.writeFileSync(secretPath, "");
    const service = new ElectronTrashService(() => root);

    try {
      await expect(service.trash([secretPath])).rejects.toThrow(PathOutsideRootError);
      expect(trashItemMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("rejects the whole batch (no shell.trashItem call at all) if ANY path in a batch fails containment", async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "electron-trash-service-test-other-"));
    const secretPath = path.join(other, "secret.txt");
    fs.writeFileSync(secretPath, "");
    const insidePath = path.join(root, "track.als");
    fs.writeFileSync(insidePath, "");
    const service = new ElectronTrashService(() => root);

    try {
      await expect(service.trash([insidePath, secretPath])).rejects.toThrow(PathOutsideRootError);
      expect(trashItemMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("rejects without invoking shell.trashItem for a symlink inside the root pointing outside it", async () => {
    // Regression guard mirroring tests/trashService.test.ts's equivalent case: a symlink
    // living inside root but pointing at a target outside it must be rejected by
    // isWithinRoot's fs.realpathSync-based check, not merely lexically allowed.
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "electron-trash-service-test-outside-"));
    const secretPath = path.join(outsideDir, "id_rsa");
    fs.writeFileSync(secretPath, "secret");
    const symlinkPath = path.join(root, "totally-a-track.als");
    fs.symlinkSync(secretPath, symlinkPath);
    const service = new ElectronTrashService(() => root);

    try {
      await expect(service.trash([symlinkPath])).rejects.toThrow(PathOutsideRootError);
      expect(trashItemMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("rejects if the underlying shell.trashItem call rejects", async () => {
    trashItemMock.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const trackPath = path.join(root, "track.als");
    fs.writeFileSync(trackPath, "");
    const service = new ElectronTrashService(() => root);

    await expect(service.trash([trackPath])).rejects.toThrow("boom");
  });
});
