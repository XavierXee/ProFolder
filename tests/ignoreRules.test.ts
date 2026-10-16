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

  it("ignores Backup by default but respects excludeBackupFolders: false", () => {
    expect(shouldIgnoreDir("Backup")).toBe(true);
    expect(shouldIgnoreDir("Backup", { excludeBackupFolders: false })).toBe(false);
  });

  it("ignores Samples folders by default, case-insensitively", () => {
    expect(shouldIgnoreDir("Samples")).toBe(true);
    expect(shouldIgnoreDir("samples")).toBe(true);
    expect(shouldIgnoreDir("SAMPLES")).toBe(true);
  });

  it("respects excludeSamplesFolders: false", () => {
    expect(shouldIgnoreDir("Samples", { excludeSamplesFolders: false })).toBe(false);
  });

  it("does not ignore folders that merely contain the word samples", () => {
    expect(shouldIgnoreDir("Sample Packs")).toBe(false);
    expect(shouldIgnoreDir("Samples Old")).toBe(false);
  });

  it("does not match the pattern when excludeFolderPatternEnabled is not set, even with a pattern given", () => {
    expect(shouldIgnoreDir("Stems", { excludeFolderPattern: "Stems|STEMS" })).toBe(false);
  });

  it("matches the pattern case-sensitively when enabled, requiring each casing to be spelled out", () => {
    expect(shouldIgnoreDir("Stems", { excludeFolderPatternEnabled: true, excludeFolderPattern: "Stems|STEMS" })).toBe(
      true
    );
    expect(shouldIgnoreDir("STEMS", { excludeFolderPatternEnabled: true, excludeFolderPattern: "Stems|STEMS" })).toBe(
      true
    );
    expect(shouldIgnoreDir("stems", { excludeFolderPatternEnabled: true, excludeFolderPattern: "Stems|STEMS" })).toBe(
      false
    );
  });

  it("does not ignore a non-matching folder when the pattern is enabled", () => {
    expect(
      shouldIgnoreDir("Track A", { excludeFolderPatternEnabled: true, excludeFolderPattern: "Stems|STEMS" })
    ).toBe(false);
  });

  it("treats an invalid regex pattern as a non-match rather than throwing", () => {
    expect(() =>
      shouldIgnoreDir("Stems", { excludeFolderPatternEnabled: true, excludeFolderPattern: "(unterminated" })
    ).not.toThrow();
    expect(shouldIgnoreDir("Stems", { excludeFolderPatternEnabled: true, excludeFolderPattern: "(unterminated" })).toBe(
      false
    );
  });

  it("treats an enabled but empty pattern as a non-match", () => {
    expect(shouldIgnoreDir("Stems", { excludeFolderPatternEnabled: true, excludeFolderPattern: "" })).toBe(false);
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
