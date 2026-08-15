import { describe, it, expect } from "vitest";
import { computeExportConfidence } from "../src/scanner/exportClassifier.js";

describe("computeExportConfidence", () => {
  it("scores a file in an Exports folder with 'Final' in the name as very likely export", () => {
    const result = computeExportConfidence(
      "Ableton Projects/Track A/Exports/Track A - Final.wav",
      "Track A - Final.wav"
    );
    expect(result.confidence).toBeCloseTo(0.95);
    expect(result.isExportCandidate).toBe(true);
  });

  it("scores a Bounce-folder file labeled Draft as low confidence despite the folder bonus", () => {
    const result = computeExportConfidence(
      "Ableton Projects/Track B/Bounce/Track B - Draft.wav",
      "Track B - Draft.wav"
    );
    expect(result.confidence).toBeCloseTo(0.4);
    expect(result.isExportCandidate).toBe(false);
  });

  it("scores plain sample library content as low confidence", () => {
    const result = computeExportConfidence("Sample Library/Drums/kick.wav", "kick.wav");
    expect(result.confidence).toBeCloseTo(0.05);
    expect(result.isExportCandidate).toBe(false);
  });

  it("gives an unclassified file the base score", () => {
    const result = computeExportConfidence("Misc/random.wav", "random.wav");
    expect(result.confidence).toBeCloseTo(0.3);
    expect(result.isExportCandidate).toBe(false);
  });

  it("clamps confidence to a maximum of 1", () => {
    const result = computeExportConfidence(
      "Master/Mixes/song final master mix v2.wav",
      "song final master mix v2.wav"
    );
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("clamps confidence to a minimum of 0", () => {
    const result = computeExportConfidence(
      "Sample Library/Loops/draft demo.wav",
      "draft demo.wav"
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });
});
