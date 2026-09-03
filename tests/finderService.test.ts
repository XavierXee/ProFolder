import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(
    (_command: string, _args: string[], callback: (error: Error | null) => void) => {
      callback(null);
    }
  ),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { MacFinderService } from "../src/services/FinderService.js";

// isWithinRoot (used internally by revealInFinder) resolves real paths via fs.realpathSync
// to defend against symlinks, so these fixtures use real files/directories under a tmpdir
// rather than made-up paths — a nonexistent path now fails closed (see the "outside the
// configured music root" tests below and tests/audioStreamRoute.test.ts's symlink case).
describe("MacFinderService.revealInFinder", () => {
  let root: string;

  beforeEach(() => {
    execFileMock.mockClear();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finder-service-test-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(`${root}Evil`, { recursive: true, force: true });
  });

  it("throws for a path outside the configured music root", async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "finder-service-test-other-"));
    const secretPath = path.join(other, "secret.txt");
    fs.writeFileSync(secretPath, "");
    const service = new MacFinderService(() => root);

    try {
      await expect(service.revealInFinder(secretPath)).rejects.toThrow(
        /outside the configured music root/
      );
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("throws for a sibling directory whose name merely shares the root as a string prefix", async () => {
    // `${root}Evil` starts with the string `root` but is NOT inside it — regression guard
    // for a naive startsWith(root) check instead of startsWith(root + sep).
    const evilSibling = `${root}Evil`;
    fs.mkdirSync(evilSibling, { recursive: true });
    const evilFile = path.join(evilSibling, "file.txt");
    fs.writeFileSync(evilFile, "");
    const service = new MacFinderService(() => root);

    await expect(service.revealInFinder(evilFile)).rejects.toThrow(
      /outside the configured music root/
    );
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("resolves for a path inside the configured music root", async () => {
    const songDir = path.join(root, "Song");
    fs.mkdirSync(songDir, { recursive: true });
    const trackPath = path.join(songDir, "track.als");
    fs.writeFileSync(trackPath, "");
    const service = new MacFinderService(() => root);

    await expect(service.revealInFinder(trackPath)).resolves.toBeUndefined();
    expect(execFileMock).toHaveBeenCalledWith("open", ["-R", trackPath], expect.any(Function));
  });

  it("resolves for the root path itself", async () => {
    const service = new MacFinderService(() => root);

    await expect(service.revealInFinder(root)).resolves.toBeUndefined();
    expect(execFileMock).toHaveBeenCalledWith("open", ["-R", root], expect.any(Function));
  });

  it("rejects if the underlying `open -R` invocation errors", async () => {
    execFileMock.mockImplementationOnce((_cmd, _args, callback) => callback(new Error("boom")));
    const songDir = path.join(root, "Song");
    fs.mkdirSync(songDir, { recursive: true });
    const service = new MacFinderService(() => root);

    await expect(service.revealInFinder(songDir)).rejects.toThrow("boom");
  });

  it("throws (fails closed) for a path that doesn't exist on disk", async () => {
    // Regression guard for the fail-closed requirement on isWithinRoot: fs.realpathSync
    // throws ENOENT for a nonexistent path, which must be treated as NOT contained rather
    // than propagating the error or defaulting to "allowed".
    const missingPath = path.join(root, "does-not-exist.als");
    const service = new MacFinderService(() => root);

    await expect(service.revealInFinder(missingPath)).rejects.toThrow(
      /outside the configured music root/
    );
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
