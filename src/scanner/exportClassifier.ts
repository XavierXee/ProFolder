import path from "node:path";

export const BASE_SCORE = 0.3;

export const FOLDER_BONUS_STRONG = 0.45;
export const STRONG_EXPORT_FOLDER_NAMES = [
  "export",
  "exports",
  "bounce",
  "bounces",
  "master",
  "masters",
  "final",
  "finals",
  "rendered",
  "render",
  "mix",
  "mixes",
];

export const FILENAME_BONUS_POSITIVE = 0.2;
export const STRONG_FILENAME_KEYWORDS = ["final", "master", "mix"];

export const FILENAME_BONUS_WEAK_POSITIVE = 0.1;
export const WEAK_FILENAME_KEYWORDS = ["export", "bounce"];

export const FILENAME_PENALTY = -0.35;
export const NEGATIVE_FILENAME_KEYWORDS = ["draft", "demo"];

export const FILENAME_VERSION_BONUS = 0.05;
export const VERSION_PATTERN = /\bv\d+\b/i;

export const SAMPLE_LIBRARY_PENALTY = -0.25;
export const SAMPLE_LIBRARY_FOLDER_NAMES = [
  "sample library",
  "samples",
  "sample packs",
  "loops",
  "one shots",
  "oneshots",
];

export const EXPORT_CANDIDATE_THRESHOLD = 0.5;

export type ExportClassification = {
  confidence: number;
  isExportCandidate: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ancestorFolderNames(relativePath: string): string[] {
  const dir = path.dirname(relativePath);
  if (dir === "." || dir === path.sep) return [];
  return dir.split(path.sep).map((name) => name.toLowerCase());
}

function nameWithoutExtension(filename: string): string {
  const ext = path.extname(filename);
  return (ext ? filename.slice(0, -ext.length) : filename).toLowerCase();
}

export function computeExportConfidence(
  relativePath: string,
  filename: string
): ExportClassification {
  const folders = ancestorFolderNames(relativePath);
  const baseName = nameWithoutExtension(filename);

  let score = BASE_SCORE;

  if (folders.some((folder) => STRONG_EXPORT_FOLDER_NAMES.includes(folder))) {
    score += FOLDER_BONUS_STRONG;
  }
  if (STRONG_FILENAME_KEYWORDS.some((keyword) => baseName.includes(keyword))) {
    score += FILENAME_BONUS_POSITIVE;
  }
  if (WEAK_FILENAME_KEYWORDS.some((keyword) => baseName.includes(keyword))) {
    score += FILENAME_BONUS_WEAK_POSITIVE;
  }
  if (VERSION_PATTERN.test(baseName) || baseName.includes("version")) {
    score += FILENAME_VERSION_BONUS;
  }
  if (NEGATIVE_FILENAME_KEYWORDS.some((keyword) => baseName.includes(keyword))) {
    score += FILENAME_PENALTY;
  }
  if (folders.some((folder) => SAMPLE_LIBRARY_FOLDER_NAMES.includes(folder))) {
    score += SAMPLE_LIBRARY_PENALTY;
  }

  const confidence = clamp(score, 0, 1);
  return {
    confidence,
    isExportCandidate: confidence >= EXPORT_CANDIDATE_THRESHOLD,
  };
}
