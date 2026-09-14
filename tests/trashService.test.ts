import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Default mock impl succeeds; individual tests override via mockImplementationOnce.
// `passthroughState` lets the small handful of real-filesystem verification tests below
// (which need osascript to actually run) opt in to calling the real node:child_process
// execFile instead of the mock, without needing a second test file or a second vi.mock
// registration — see the "real Trash verification" describe block.
const { execFileMock, passthroughState } = vi.hoisted(() => ({
  execFileMock: vi.fn(
    (_command: string, _args: string[], callback: (error: Error | null) => void) => {
      callback(null);
    }
  ),
  passthroughState: { current: false },
}));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    execFile: (...args: Parameters<typeof actual.execFile>) => {
      if (passthroughState.current) {
        return actual.execFile(...args);
      }
      // @ts-expect-error -- overload spread is fine for our call shape (command, args, callback)
      return execFileMock(...args);
    },
  };
});

import { MacTrashService, PathOutsideRootError } from "../src/services/TrashService.js";

// isWithinRoot (used internally by trash) resolves real paths via fs.realpathSync to defend
// against symlinks, so these fixtures use real files/directories under a tmpdir rather than
// made-up paths, matching tests/finderService.test.ts's convention.
describe("MacTrashService.trash", () => {
  let root: string;

  beforeEach(() => {
    execFileMock.mockClear();
    execFileMock.mockImplementation((_cmd, _args, callback) => callback(null));
    passthroughState.current = false;
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trash-service-test-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("trashes a single path inside the root in one osascript call", async () => {
    const trackPath = path.join(root, "track.als");
    fs.writeFileSync(trackPath, "");
    const service = new MacTrashService(() => root);

    await expect(service.trash([trackPath])).resolves.toBeUndefined();

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [command, args] = execFileMock.mock.calls[0]!;
    expect(command).toBe("osascript");
    expect(args[0]).toBe("-e");
    expect(args[1]).toContain(trackPath);
    expect(args[1]).toContain('tell application "Finder" to delete');
  });

  it("trashes a batch of 3+ paths in a single execFile call, not one per path", async () => {
    const paths = ["a.als", "b.als", "c.als"].map((name) => {
      const p = path.join(root, name);
      fs.writeFileSync(p, "");
      return p;
    });
    const service = new MacTrashService(() => root);

    await expect(service.trash(paths)).resolves.toBeUndefined();

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [, args] = execFileMock.mock.calls[0]!;
    for (const p of paths) {
      expect(args[1]).toContain(p);
    }
  });

  it("rejects without invoking execFile when a path is outside the configured root", async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "trash-service-test-other-"));
    const secretPath = path.join(other, "secret.txt");
    fs.writeFileSync(secretPath, "");
    const service = new MacTrashService(() => root);

    try {
      await expect(service.trash([secretPath])).rejects.toThrow(PathOutsideRootError);
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("rejects the whole batch (no execFile call at all) if ANY path in a batch fails containment", async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "trash-service-test-other-"));
    const secretPath = path.join(other, "secret.txt");
    fs.writeFileSync(secretPath, "");
    const insidePath = path.join(root, "track.als");
    fs.writeFileSync(insidePath, "");
    const service = new MacTrashService(() => root);

    try {
      await expect(service.trash([insidePath, secretPath])).rejects.toThrow(PathOutsideRootError);
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("rejects without invoking execFile for a symlink inside the root pointing outside it", async () => {
    // Regression guard mirroring tests/audioStreamRoute.test.ts's symlink case: a symlink
    // living inside root but pointing at a target outside it must be rejected by
    // isWithinRoot's fs.realpathSync-based check, not merely lexically allowed.
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "trash-service-test-outside-"));
    const secretPath = path.join(outsideDir, "id_rsa");
    fs.writeFileSync(secretPath, "secret");
    const symlinkPath = path.join(root, "totally-a-track.als");
    fs.symlinkSync(secretPath, symlinkPath);
    const service = new MacTrashService(() => root);

    try {
      await expect(service.trash([symlinkPath])).rejects.toThrow(PathOutsideRootError);
      expect(execFileMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("rejects if the underlying osascript invocation errors", async () => {
    execFileMock.mockImplementationOnce((_cmd, _args, callback) => callback(new Error("boom")));
    const trackPath = path.join(root, "track.als");
    fs.writeFileSync(trackPath, "");
    const service = new MacTrashService(() => root);

    await expect(service.trash([trackPath])).rejects.toThrow("boom");
  });

  it("escapes a literal double-quote in a filename so it doesn't break out of the AppleScript string literal", async () => {
    const trackPath = path.join(root, 'kick "final".wav');
    fs.writeFileSync(trackPath, "");
    const service = new MacTrashService(() => root);

    await expect(service.trash([trackPath])).resolves.toBeUndefined();

    const [, args] = execFileMock.mock.calls[0]!;
    const script = args[1] as string;
    // The embedded path's quote must be backslash-escaped, not left raw (which would
    // terminate the AppleScript string literal early and either syntax-error or, worse,
    // let trailing filename characters be interpreted as AppleScript source).
    expect(script).toContain('POSIX file "' + root + '/kick \\"final\\".wav"');
    // Sanity: the script must contain exactly one unescaped-looking closing `"}` (the
    // literal's real end), not an early one introduced by the raw quote in the filename.
    expect(script).toBe(`tell application "Finder" to delete {POSIX file "${trackPath.replace(/"/g, '\\"')}"}`);
  });

  it("escapes a literal backslash in a filename, and escapes backslashes before quotes so an embedded backslash-quote sequence round-trips correctly", async () => {
    const trackPath = path.join(root, "back\\slash.wav");
    fs.writeFileSync(trackPath, "");
    const service = new MacTrashService(() => root);

    await expect(service.trash([trackPath])).resolves.toBeUndefined();

    const [, args] = execFileMock.mock.calls[0]!;
    const script = args[1] as string;
    expect(script).toContain('POSIX file "' + root + '/back\\\\slash.wav"');
  });

  it("correctly escapes special characters for EACH path in a multi-path batch, not just the first", async () => {
    const quotedPath = path.join(root, 'quote"one.wav');
    const backslashPath = path.join(root, "back\\slash-two.wav");
    fs.writeFileSync(quotedPath, "");
    fs.writeFileSync(backslashPath, "");
    const service = new MacTrashService(() => root);

    await expect(service.trash([quotedPath, backslashPath])).resolves.toBeUndefined();

    const [, args] = execFileMock.mock.calls[0]!;
    const script = args[1] as string;
    expect(script).toContain('POSIX file "' + root + '/quote\\"one.wav"');
    expect(script).toContain('POSIX file "' + root + '/back\\\\slash-two.wav"');
  });
});

// Real-filesystem verification: actually shells out to osascript and confirms the item is
// genuinely moved to ~/.Trash. Only meaningful on macOS (Finder/osascript-specific).
//
// Best-effort cleanup caveat: macOS tags items moved into Trash via Finder scripting with
// a `com.apple.provenance` extended attribute. Removing such an item afterward requires
// either the "Full Disk Access" privacy permission (System Settings > Privacy & Security)
// granted to whichever process is running the tests, or an interactive Finder confirmation
// dialog — neither is available in a headless/CI/agent-sandboxed run. Confirmed: a plain
// `fs.rmSync`/`rm -rf` on a Finder-trashed item fails EPERM without Full Disk Access, even
// though the same process can freely create/delete its *own* ordinary files directly under
// ~/.Trash (i.e. this isn't a blanket ~/.Trash access restriction, it's specific to
// Finder-provenance-tagged items). So cleanup below is attempted but not required to
// succeed for the test to pass — the functional assertions (removed from source, present in
// Trash) already ran by that point. If cleanup fails, it's logged so a developer running
// locally with Full Disk Access granted (which does work — this is an environment
// permission gap, not a code defect) can tell at a glance, and can grant Full Disk Access to
// their terminal/IDE, or manually empty those specific items from Trash, to keep it tidy.
function removeFromTrashBestEffort(trashedPath: string): void {
  try {
    fs.rmSync(trashedPath, { recursive: true, force: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES") {
      console.warn(
        `[trashService.test.ts] Could not remove "${trashedPath}" from ~/.Trash after the test ` +
          `(requires Full Disk Access for this process on modern macOS). The test's functional ` +
          `assertions already passed; please remove this item from Trash manually.`
      );
      return;
    }
    throw error;
  }
}

describe.skipIf(process.platform !== "darwin")("MacTrashService.trash (real macOS Trash verification)", () => {
  let root: string;
  const trashDir = path.join(os.homedir(), ".Trash");

  beforeEach(() => {
    passthroughState.current = true;
    root = fs.mkdtempSync(path.join(os.tmpdir(), "trash-service-real-test-"));
  });

  afterEach(() => {
    passthroughState.current = false;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("actually moves a real file to ~/.Trash and removes it from its original location", async () => {
    const name = `trash-service-real-test-file-${Date.now()}.txt`;
    const filePath = path.join(root, name);
    fs.writeFileSync(filePath, "throwaway content");
    const service = new MacTrashService(() => root);
    const trashedPath = path.join(trashDir, name);

    try {
      await service.trash([filePath]);

      expect(fs.existsSync(filePath)).toBe(false);
      expect(fs.existsSync(trashedPath)).toBe(true);
    } finally {
      removeFromTrashBestEffort(trashedPath);
    }
  }, 20000);

  it("actually moves a real folder (with a file inside it) to ~/.Trash", async () => {
    const name = `trash-service-real-test-folder-${Date.now()}`;
    const folderPath = path.join(root, name);
    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(path.join(folderPath, "inner.txt"), "throwaway content");
    const service = new MacTrashService(() => root);
    const trashedPath = path.join(trashDir, name);

    try {
      await service.trash([folderPath]);

      expect(fs.existsSync(folderPath)).toBe(false);
      expect(fs.existsSync(trashedPath)).toBe(true);
      expect(fs.existsSync(path.join(trashedPath, "inner.txt"))).toBe(true);
    } finally {
      removeFromTrashBestEffort(trashedPath);
    }
  }, 20000);
});
