import { describe, it, expect } from "vitest";
import { shouldIgnoreDir, shouldIgnoreFile } from "../src/scanner/ignoreRules.js";

describe("shouldIgnoreDir", () => {
  it("ignores dot-directories", () => {
    expect(shouldIgnoreDir(".git")).toBe(true);
    expect(shouldIgnoreDir(".DS_Store")).toBe(true);
  });

  it("ignores known system/dependency directories", () => {
    expect(shouldIgnoreDir("node_modules")).toBe(true);
  });

  it("does not ignore normal project folders", () => {
    expect(shouldIgnoreDir("Track A")).toBe(false);
    expect(shouldIgnoreDir("Exports")).toBe(false);
  });

  it("ignores Ableton's auto-generated Backup folder, case-insensitively", () => {
    expect(shouldIgnoreDir("Backup")).toBe(true);
    expect(shouldIgnoreDir("backup")).toBe(true);
    expect(shouldIgnoreDir("BACKUP")).toBe(true);
  });

  it("does not ignore folders that merely contain the word backup", () => {
    expect(shouldIgnoreDir("Backups")).toBe(false);
    expect(shouldIgnoreDir("Old Backup Files")).toBe(false);
  });
});

describe("shouldIgnoreFile", () => {
  it("ignores .DS_Store and AppleDouble resource fork files", () => {
    expect(shouldIgnoreFile(".DS_Store")).toBe(true);
    expect(shouldIgnoreFile("._Track A.wav")).toBe(true);
  });

  it("does not ignore normal audio files", () => {
    expect(shouldIgnoreFile("Track A.wav")).toBe(false);
  });
});
