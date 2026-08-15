import { describe, it, expect } from "vitest";
import { isAudioFile, getExtension, DEFAULT_AUDIO_EXTENSIONS } from "../src/scanner/audioDetector.js";

describe("getExtension", () => {
  it("returns the lowercased extension with leading dot", () => {
    expect(getExtension("Track A - Final.WAV")).toBe(".wav");
    expect(getExtension("kick.wav")).toBe(".wav");
  });

  it("returns empty string for files with no extension or dotfiles", () => {
    expect(getExtension("README")).toBe("");
    expect(getExtension(".gitignore")).toBe("");
  });
});

describe("isAudioFile", () => {
  it("recognizes all default supported extensions", () => {
    for (const ext of DEFAULT_AUDIO_EXTENSIONS) {
      expect(isAudioFile(`file${ext}`)).toBe(true);
    }
  });

  it("rejects non-audio extensions", () => {
    expect(isAudioFile("Track A.als")).toBe(false);
    expect(isAudioFile("notes.txt")).toBe(false);
  });

  it("respects a custom extension list", () => {
    expect(isAudioFile("file.xyz", [".xyz"])).toBe(true);
    expect(isAudioFile("file.wav", [".xyz"])).toBe(false);
  });
});
