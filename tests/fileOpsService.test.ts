import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  NodeFileOpsService,
  PathOutsideRootError,
  NameConflictError,
} from "../src/services/FileOpsService.js";

// isWithinRoot (used internally by copyPath/movePath) resolves real paths via
// fs.realpathSync, so these fixtures use real files/directories under a tmpdir rather than
// made-up paths — see tests/finderService.test.ts and tests/audioStreamRoute.test.ts for
// the same pattern.
describe("NodeFileOpsService", () => {
  let root: string;
  let service: NodeFileOpsService;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "file-ops-service-test-"));
    service = new NodeFileOpsService(() => root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("movePath", () => {
    it("moves a single file on the same device: source gone, destination has correct content", async () => {
      const sourceDir = path.join(root, "source");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "kick-bytes");

      const result = await service.movePath(sourcePath, destDir);

      expect(result.newAbsolutePath).toBe(path.join(destDir, "kick.wav"));
      expect(fs.existsSync(sourcePath)).toBe(false);
      expect(fs.readFileSync(result.newAbsolutePath, "utf8")).toBe("kick-bytes");
    });

    it("moves a whole directory (with nested files) on the same device", async () => {
      const sourceDir = path.join(root, "source", "My Project");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(path.join(sourceDir, "samples"), { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "project.als"), "als-bytes");
      fs.writeFileSync(path.join(sourceDir, "samples", "kick.wav"), "kick-bytes");

      const result = await service.movePath(sourceDir, destDir);

      expect(fs.existsSync(sourceDir)).toBe(false);
      expect(fs.readFileSync(path.join(result.newAbsolutePath, "project.als"), "utf8")).toBe("als-bytes");
      expect(fs.readFileSync(path.join(result.newAbsolutePath, "samples", "kick.wav"), "utf8")).toBe(
        "kick-bytes"
      );
    });

    it("falls back to copy+rm on EXDEV (cross-device rename), verified against the real filesystem", async () => {
      const sourceDir = path.join(root, "source");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "kick-bytes");

      const renameSpy = vi.spyOn(fsp, "rename").mockRejectedValueOnce(
        Object.assign(new Error("cross-device link"), { code: "EXDEV" })
      );

      const result = await service.movePath(sourcePath, destDir);

      expect(renameSpy).toHaveBeenCalled();
      expect(fs.existsSync(sourcePath)).toBe(false);
      expect(fs.readFileSync(result.newAbsolutePath, "utf8")).toBe("kick-bytes");
    });

    it("falls back to copy+rm on EXDEV for a whole directory", async () => {
      const sourceDir = path.join(root, "source", "My Project");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(path.join(sourceDir, "samples"), { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "project.als"), "als-bytes");
      fs.writeFileSync(path.join(sourceDir, "samples", "kick.wav"), "kick-bytes");

      vi.spyOn(fsp, "rename").mockRejectedValueOnce(
        Object.assign(new Error("cross-device link"), { code: "EXDEV" })
      );

      const result = await service.movePath(sourceDir, destDir);

      expect(fs.existsSync(sourceDir)).toBe(false);
      expect(fs.readFileSync(path.join(result.newAbsolutePath, "project.als"), "utf8")).toBe("als-bytes");
      expect(fs.readFileSync(path.join(result.newAbsolutePath, "samples", "kick.wav"), "utf8")).toBe(
        "kick-bytes"
      );
    });

    it("propagates a non-EXDEV rename error rather than falling back", async () => {
      const sourceDir = path.join(root, "source");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "kick-bytes");

      vi.spyOn(fsp, "rename").mockRejectedValueOnce(
        Object.assign(new Error("permission denied"), { code: "EACCES" })
      );

      await expect(service.movePath(sourcePath, destDir)).rejects.toThrow("permission denied");
      expect(fs.existsSync(sourcePath)).toBe(true);
    });

    it("does not leave the file duplicated in both source and destination if the EXDEV fallback's rm step fails after cp succeeds", async () => {
      // Genuinely different failure mode than the existing EXDEV tests above, which only
      // exercise rename failing with EXDEV and the fallback then succeeding end-to-end.
      // Here the cp half of the fallback succeeds, but the final rm(source) half fails
      // (e.g. a permissions issue reclaiming space on the source volume after the copy
      // landed) — the data now technically exists in two places, which is a correctness
      // bug for a "move" (source should be authoritative-or-gone, never both).
      const sourceDir = path.join(root, "source");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "kick-bytes");

      vi.spyOn(fsp, "rename").mockRejectedValueOnce(
        Object.assign(new Error("cross-device link"), { code: "EXDEV" })
      );
      vi.spyOn(fsp, "rm").mockRejectedValueOnce(
        Object.assign(new Error("permission denied"), { code: "EACCES" })
      );

      await expect(service.movePath(sourcePath, destDir)).rejects.toThrow();

      // The move did not complete (an error was thrown), so the destination must not
      // silently end up with a copy of the data -- either the whole operation rolls back
      // (destination has nothing) or it's otherwise made clear/safe, but having full,
      // readable content at BOTH sourcePath and destDir/kick.wav simultaneously means a
      // caller that sees the rejection and assumes "nothing happened" is wrong, and a
      // caller that retries the move will silently produce two independent copies that
      // can drift, with no error at all on the DB-rekey layer built on top of this.
      expect(fs.existsSync(path.join(destDir, "kick.wav"))).toBe(false);
    });

    it("re-throws the original rm(source) error verbatim (not a synthetic replacement) when the rollback removal succeeds", async () => {
      // Complements the test above: that one only checks the destination copy was cleaned
      // up, not *what* gets thrown once rollback succeeds. A caller may rely on the
      // specific error (message/type) to decide how to react, so the original failure
      // reason must survive rollback rather than being replaced by some other message.
      const sourceDir = path.join(root, "source");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "kick-bytes");

      vi.spyOn(fsp, "rename").mockRejectedValueOnce(
        Object.assign(new Error("cross-device link"), { code: "EXDEV" })
      );
      vi.spyOn(fsp, "rm").mockRejectedValueOnce(
        Object.assign(new Error("permission denied removing source, distinctively-worded"), { code: "EACCES" })
      );

      await expect(service.movePath(sourcePath, destDir)).rejects.toThrow(
        "permission denied removing source, distinctively-worded"
      );
      expect(fs.existsSync(path.join(destDir, "kick.wav"))).toBe(false);
    });

    it("does not leave a partially-copied destination directory behind when the EXDEV fallback's rm(source) step fails for a directory move", async () => {
      // The single-file rollback test above only proves fs.rm cleans up one file. A
      // directory move copies the whole tree via fs.cp(recursive), so the rollback must
      // remove the whole destination directory tree too -- not just leave a partial/empty
      // directory shell behind. This directory-shaped case was not covered by either the
      // original bug-report test or the Developer's fix tests.
      const sourceDir = path.join(root, "source", "My Project");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(path.join(sourceDir, "samples"), { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "project.als"), "als-bytes");
      fs.writeFileSync(path.join(sourceDir, "samples", "kick.wav"), "kick-bytes");

      vi.spyOn(fsp, "rename").mockRejectedValueOnce(
        Object.assign(new Error("cross-device link"), { code: "EXDEV" })
      );
      vi.spyOn(fsp, "rm").mockRejectedValueOnce(
        Object.assign(new Error("permission denied"), { code: "EACCES" })
      );

      await expect(service.movePath(sourceDir, destDir)).rejects.toThrow();

      // Neither a partial nor a complete copy of the directory should remain at the
      // destination once the operation has thrown.
      expect(fs.existsSync(path.join(destDir, "My Project"))).toBe(false);
      // The original source directory (with all its nested content) must still be intact
      // since the move did not complete.
      expect(fs.readFileSync(path.join(sourceDir, "project.als"), "utf8")).toBe("als-bytes");
      expect(fs.readFileSync(path.join(sourceDir, "samples", "kick.wav"), "utf8")).toBe("kick-bytes");
    });

    it("surfaces both errors clearly when the EXDEV fallback's rollback removal also fails after rm(source) fails", async () => {
      // Genuinely unlucky double-failure: cp succeeds, rm(source) fails, and then the
      // rollback attempt to remove the just-created destination copy ALSO fails. The
      // caller must not be told this succeeded, nor silently told just one of the two
      // failures -- both must be discoverable since the data may now be stuck duplicated
      // at both source and destination with no clean rollback possible.
      const sourceDir = path.join(root, "source");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "kick-bytes");

      vi.spyOn(fsp, "rename").mockRejectedValueOnce(
        Object.assign(new Error("cross-device link"), { code: "EXDEV" })
      );
      vi.spyOn(fsp, "rm")
        .mockRejectedValueOnce(Object.assign(new Error("permission denied removing source"), { code: "EACCES" }))
        .mockRejectedValueOnce(
          Object.assign(new Error("permission denied removing destination"), { code: "EACCES" })
        );

      const error: unknown = await service.movePath(sourcePath, destDir).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/permission denied removing source/);
      expect((error as Error).message).toMatch(/permission denied removing destination/);
    });

    it("rejects with NameConflictError when the destination already has an item with the same name, leaving both source and destination untouched", async () => {
      const sourceDir = path.join(root, "source");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "source-bytes");
      const existingDestPath = path.join(destDir, "kick.wav");
      fs.writeFileSync(existingDestPath, "preexisting-bytes");

      await expect(service.movePath(sourcePath, destDir)).rejects.toThrow(NameConflictError);

      expect(fs.readFileSync(sourcePath, "utf8")).toBe("source-bytes");
      expect(fs.readFileSync(existingDestPath, "utf8")).toBe("preexisting-bytes");
    });

    it("rejects with PathOutsideRootError when the source is outside the configured root", async () => {
      const other = fs.mkdtempSync(path.join(os.tmpdir(), "file-ops-service-test-other-"));
      const destDir = path.join(root, "dest");
      fs.mkdirSync(destDir, { recursive: true });
      const outsidePath = path.join(other, "secret.txt");
      fs.writeFileSync(outsidePath, "secret");

      try {
        await expect(service.movePath(outsidePath, destDir)).rejects.toThrow(PathOutsideRootError);
        expect(fs.existsSync(outsidePath)).toBe(true);
        expect(fs.readdirSync(destDir)).toEqual([]);
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }
    });

    it("rejects with PathOutsideRootError when the destination is outside the configured root", async () => {
      const other = fs.mkdtempSync(path.join(os.tmpdir(), "file-ops-service-test-other-"));
      const sourceDir = path.join(root, "source");
      fs.mkdirSync(sourceDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "kick-bytes");

      try {
        await expect(service.movePath(sourcePath, other)).rejects.toThrow(PathOutsideRootError);
        expect(fs.existsSync(sourcePath)).toBe(true);
        expect(fs.readdirSync(other)).toEqual([]);
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }
    });

    it("rejects (fails closed) for a symlink inside root pointing outside it as the source", async () => {
      const other = fs.mkdtempSync(path.join(os.tmpdir(), "file-ops-service-test-symlink-"));
      const secretPath = path.join(other, "secret.txt");
      fs.writeFileSync(secretPath, "secret-bytes");
      const symlinkPath = path.join(root, "escape-link.txt");
      fs.symlinkSync(secretPath, symlinkPath);
      const destDir = path.join(root, "dest");
      fs.mkdirSync(destDir, { recursive: true });

      try {
        await expect(service.movePath(symlinkPath, destDir)).rejects.toThrow(PathOutsideRootError);
        expect(fs.existsSync(secretPath)).toBe(true);
        expect(fs.readFileSync(secretPath, "utf8")).toBe("secret-bytes");
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }
    });

    it("rejects with PathOutsideRootError when source's basename is literally \"..\" (via realpath-resolving-in-root path shape), which would otherwise let the computed destination escape root", async () => {
      // path.basename does not normalize "." / "..": a sourceAbsolutePath literally ending in
      // "<realSubdir>/.." has a basename of exactly "..", even though it resolves (via
      // realpath) to somewhere genuinely inside root -- so the source containment check
      // above passes. If the destination directory is root's own top-level directory, the
      // naively-computed newAbsolutePath = path.join(destDir, "..") would land on root's
      // PARENT, which is outside root. Without an explicit guard rejecting this "." / ".."
      // basename shape up front, this was only neutralized by the incidental side effect that
      // a directory's parent always exists (tripping the NameConflictError check below) --
      // not by design.
      const subdir = path.join(root, "subdir");
      fs.mkdirSync(subdir, { recursive: true });
      // Built via string concatenation, not path.join — path.join would normalize away the
      // trailing "..", which is exactly the non-normalizing behavior this test needs to
      // reproduce (path.basename does the same non-normalizing thing internally).
      const sourcePath = `${subdir}${path.sep}..`;

      await expect(service.movePath(sourcePath, root)).rejects.toThrow(PathOutsideRootError);

      // Confirm the rejection happened before any filesystem mutation: the source subdir is
      // untouched, and root's own contents are unchanged (nothing was moved/created/removed).
      expect(fs.existsSync(subdir)).toBe(true);
      expect(fs.readdirSync(root)).toEqual(["subdir"]);
    });
  });

  describe("copyPath", () => {
    it("copies a single file: source untouched, destination has correct content", async () => {
      const sourceDir = path.join(root, "source");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "kick-bytes");

      const result = await service.copyPath(sourcePath, destDir);

      expect(result.newAbsolutePath).toBe(path.join(destDir, "kick.wav"));
      expect(fs.readFileSync(sourcePath, "utf8")).toBe("kick-bytes");
      expect(fs.readFileSync(result.newAbsolutePath, "utf8")).toBe("kick-bytes");
    });

    it("copies a whole directory: source untouched, destination has correct content", async () => {
      const sourceDir = path.join(root, "source", "My Project");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(path.join(sourceDir, "samples"), { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "project.als"), "als-bytes");
      fs.writeFileSync(path.join(sourceDir, "samples", "kick.wav"), "kick-bytes");

      const result = await service.copyPath(sourceDir, destDir);

      expect(fs.existsSync(sourceDir)).toBe(true);
      expect(fs.readFileSync(path.join(sourceDir, "project.als"), "utf8")).toBe("als-bytes");
      expect(fs.readFileSync(path.join(result.newAbsolutePath, "project.als"), "utf8")).toBe("als-bytes");
      expect(fs.readFileSync(path.join(result.newAbsolutePath, "samples", "kick.wav"), "utf8")).toBe(
        "kick-bytes"
      );
    });

    it("auto-renames Finder-style on collision for a file: kick.wav -> kick copy.wav -> kick copy 2.wav", async () => {
      const sourceDir = path.join(root, "source");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "new-bytes");
      fs.writeFileSync(path.join(destDir, "kick.wav"), "preexisting-bytes");

      const firstCopy = await service.copyPath(sourcePath, destDir);
      expect(firstCopy.newAbsolutePath).toBe(path.join(destDir, "kick copy.wav"));
      expect(fs.readFileSync(firstCopy.newAbsolutePath, "utf8")).toBe("new-bytes");

      const secondCopy = await service.copyPath(sourcePath, destDir);
      expect(secondCopy.newAbsolutePath).toBe(path.join(destDir, "kick copy 2.wav"));
      expect(fs.readFileSync(secondCopy.newAbsolutePath, "utf8")).toBe("new-bytes");

      // The pre-existing file at the original name must be untouched throughout.
      expect(fs.readFileSync(path.join(destDir, "kick.wav"), "utf8")).toBe("preexisting-bytes");
    });

    it("skips past an already-taken 'copy' name when BOTH kick.wav and kick copy.wav pre-exist in the destination before any copy call", async () => {
      // Different scenario than the test above: there the collision at " copy" is only
      // created incrementally by the service's own prior copyPath call. Here both
      // colliding names are already present in the destination from an unrelated source
      // (e.g. a previous session, a different copy operation) before copyPath is ever
      // called, so the very first probe inside resolveCopyDestinationName's do/while loop
      // must already skip both "kick.wav" and "kick copy.wav" and land on "kick copy 2.wav".
      const sourceDir = path.join(root, "source");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "new-bytes");
      fs.writeFileSync(path.join(destDir, "kick.wav"), "preexisting-bytes");
      fs.writeFileSync(path.join(destDir, "kick copy.wav"), "preexisting-copy-bytes");

      const result = await service.copyPath(sourcePath, destDir);

      expect(result.newAbsolutePath).toBe(path.join(destDir, "kick copy 2.wav"));
      expect(fs.readFileSync(result.newAbsolutePath, "utf8")).toBe("new-bytes");
      expect(fs.readFileSync(path.join(destDir, "kick.wav"), "utf8")).toBe("preexisting-bytes");
      expect(fs.readFileSync(path.join(destDir, "kick copy.wav"), "utf8")).toBe("preexisting-copy-bytes");
    });

    it("auto-renames Finder-style on collision for a directory: My Project -> My Project copy", async () => {
      const sourceDir = path.join(root, "source", "My Project");
      const destDir = path.join(root, "dest");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, "project.als"), "new-bytes");
      const preexistingDestDir = path.join(destDir, "My Project");
      fs.mkdirSync(preexistingDestDir, { recursive: true });
      fs.writeFileSync(path.join(preexistingDestDir, "old.als"), "old-bytes");

      const result = await service.copyPath(sourceDir, destDir);

      expect(result.newAbsolutePath).toBe(path.join(destDir, "My Project copy"));
      expect(fs.readFileSync(path.join(result.newAbsolutePath, "project.als"), "utf8")).toBe("new-bytes");
      // Pre-existing destination directory untouched.
      expect(fs.readFileSync(path.join(preexistingDestDir, "old.als"), "utf8")).toBe("old-bytes");
      expect(fs.existsSync(path.join(preexistingDestDir, "project.als"))).toBe(false);
    });

    it("rejects with PathOutsideRootError when the source is outside the configured root", async () => {
      const other = fs.mkdtempSync(path.join(os.tmpdir(), "file-ops-service-test-other-"));
      const destDir = path.join(root, "dest");
      fs.mkdirSync(destDir, { recursive: true });
      const outsidePath = path.join(other, "secret.txt");
      fs.writeFileSync(outsidePath, "secret");

      try {
        await expect(service.copyPath(outsidePath, destDir)).rejects.toThrow(PathOutsideRootError);
        expect(fs.readdirSync(destDir)).toEqual([]);
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }
    });

    it("rejects with PathOutsideRootError when the destination is outside the configured root", async () => {
      const other = fs.mkdtempSync(path.join(os.tmpdir(), "file-ops-service-test-other-"));
      const sourceDir = path.join(root, "source");
      fs.mkdirSync(sourceDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "kick-bytes");

      try {
        await expect(service.copyPath(sourcePath, other)).rejects.toThrow(PathOutsideRootError);
        expect(fs.readdirSync(other)).toEqual([]);
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }
    });

    it("rejects (fails closed) for a symlink inside root pointing outside it as the destination directory", async () => {
      const outsideDestDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-ops-service-test-outside-dest-"));
      const symlinkDestDir = path.join(root, "dest-link");
      fs.symlinkSync(outsideDestDir, symlinkDestDir);
      const sourceDir = path.join(root, "source");
      fs.mkdirSync(sourceDir, { recursive: true });
      const sourcePath = path.join(sourceDir, "kick.wav");
      fs.writeFileSync(sourcePath, "kick-bytes");

      try {
        await expect(service.copyPath(sourcePath, symlinkDestDir)).rejects.toThrow(PathOutsideRootError);
        expect(fs.readdirSync(outsideDestDir)).toEqual([]);
      } finally {
        fs.rmSync(outsideDestDir, { recursive: true, force: true });
      }
    });

    it("rejects with PathOutsideRootError when source's basename is literally \"..\" (via realpath-resolving-in-root path shape), which would otherwise let the computed destination escape root", async () => {
      // Same escape shape as the equivalent movePath test above (see its comment for the
      // full rationale): path.basename("<realSubdir>/..") is literally "..", so with destDir
      // set to root's own top-level directory, the naively-computed newAbsolutePath would be
      // root's PARENT. For copyPath specifically, this was previously only neutralized by the
      // incidental side effect that resolveCopyDestinationName's collision check also always
      // trips here (a directory's parent always exists), auto-renaming ".." to the harmless
      // literal name ".. copy" -- not by explicit design.
      const subdir = path.join(root, "subdir");
      fs.mkdirSync(subdir, { recursive: true });
      // Built via string concatenation, not path.join — path.join would normalize away the
      // trailing "..", which is exactly the non-normalizing behavior this test needs to
      // reproduce (path.basename does the same non-normalizing thing internally).
      const sourcePath = `${subdir}${path.sep}..`;

      await expect(service.copyPath(sourcePath, root)).rejects.toThrow(PathOutsideRootError);

      // Confirm the rejection happened before any filesystem mutation: root's own contents
      // are unchanged (nothing was copied/created inside it, e.g. no ".. copy" directory).
      expect(fs.readdirSync(root)).toEqual(["subdir"]);
    });
  });
});
