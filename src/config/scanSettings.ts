import type Database from "better-sqlite3";
import { getSetting, setSetting } from "../database/repositories/appSettingsRepository.js";

const EXCLUDE_SAMPLES_KEY = "excludeSamplesFolders";
const EXCLUDE_BACKUP_KEY = "excludeBackupFolders";
const EXCLUDE_FOLDER_PATTERN_ENABLED_KEY = "excludeFolderPatternEnabled";
const EXCLUDE_FOLDER_PATTERN_KEY = "excludeFolderPattern";
const DUPLICATE_MATCH_THRESHOLD_KEY = "duplicateMatchThresholdPercent";

const DEFAULT_DUPLICATE_MATCH_THRESHOLD_PERCENT = 58;
/** Lower bound for the user-configurable duplicate-project match-ratio threshold. */
const MIN_DUPLICATE_MATCH_THRESHOLD_PERCENT = 10;
/** Upper bound for the user-configurable duplicate-project match-ratio threshold. */
const MAX_DUPLICATE_MATCH_THRESHOLD_PERCENT = 100;
/** Pre-filled so enabling the toggle is immediately useful rather than opening onto an empty,
 * no-op field — matches case-sensitively, hence both casings spelled out (see ignoreRules.ts). */
const DEFAULT_EXCLUDE_FOLDER_PATTERN = "Stems|STEMS";

export type ScanSettings = {
  excludeSamplesFolders: boolean;
  excludeBackupFolders: boolean;
  excludeFolderPatternEnabled: boolean;
  excludeFolderPattern: string;
  duplicateMatchThresholdPercent: number;
};

function readBooleanSetting(db: Database.Database, key: string, defaultValue: boolean): boolean {
  const stored = getSetting(db, key);
  return stored === undefined ? defaultValue : stored === "true";
}

function readDuplicateMatchThresholdPercent(db: Database.Database): number {
  const stored = getSetting(db, DUPLICATE_MATCH_THRESHOLD_KEY);
  if (stored === undefined) return DEFAULT_DUPLICATE_MATCH_THRESHOLD_PERCENT;
  const parsed = Number.parseInt(stored, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_DUPLICATE_MATCH_THRESHOLD_PERCENT;
}

/** Scan-time folder exclusion toggles and the duplicate-project detector's match-ratio
 * threshold, persisted so they're remembered across sessions. */
export function getScanSettings(db: Database.Database): ScanSettings {
  return {
    excludeSamplesFolders: readBooleanSetting(db, EXCLUDE_SAMPLES_KEY, true),
    excludeBackupFolders: readBooleanSetting(db, EXCLUDE_BACKUP_KEY, true),
    excludeFolderPatternEnabled: readBooleanSetting(db, EXCLUDE_FOLDER_PATTERN_ENABLED_KEY, false),
    excludeFolderPattern: getSetting(db, EXCLUDE_FOLDER_PATTERN_KEY) ?? DEFAULT_EXCLUDE_FOLDER_PATTERN,
    duplicateMatchThresholdPercent: readDuplicateMatchThresholdPercent(db),
  };
}

/** Validates and persists a patch of scan settings. Validates every provided field up front so
 * the patch is applied atomically: either the whole patch is valid and gets written, or nothing
 * gets written at all (mirrors metricsSettings.ts's setMetricsSettings). */
export function setScanSettings(db: Database.Database, patch: Partial<ScanSettings>): ScanSettings {
  if (patch.excludeSamplesFolders !== undefined && typeof patch.excludeSamplesFolders !== "boolean") {
    throw new Error("excludeSamplesFolders must be a boolean");
  }
  if (patch.excludeBackupFolders !== undefined && typeof patch.excludeBackupFolders !== "boolean") {
    throw new Error("excludeBackupFolders must be a boolean");
  }
  if (patch.excludeFolderPatternEnabled !== undefined && typeof patch.excludeFolderPatternEnabled !== "boolean") {
    throw new Error("excludeFolderPatternEnabled must be a boolean");
  }
  if (patch.excludeFolderPattern !== undefined) {
    if (typeof patch.excludeFolderPattern !== "string" || patch.excludeFolderPattern.trim() === "") {
      throw new Error("excludeFolderPattern must be a non-empty string");
    }
    try {
      new RegExp(patch.excludeFolderPattern);
    } catch {
      throw new Error("excludeFolderPattern must be a valid regular expression");
    }
  }
  if (patch.duplicateMatchThresholdPercent !== undefined) {
    const { duplicateMatchThresholdPercent } = patch;
    if (
      !Number.isInteger(duplicateMatchThresholdPercent) ||
      duplicateMatchThresholdPercent < MIN_DUPLICATE_MATCH_THRESHOLD_PERCENT ||
      duplicateMatchThresholdPercent > MAX_DUPLICATE_MATCH_THRESHOLD_PERCENT
    ) {
      throw new Error(
        `duplicateMatchThresholdPercent must be an integer between ${MIN_DUPLICATE_MATCH_THRESHOLD_PERCENT} and ${MAX_DUPLICATE_MATCH_THRESHOLD_PERCENT}`
      );
    }
  }

  if (patch.excludeSamplesFolders !== undefined) {
    setSetting(db, EXCLUDE_SAMPLES_KEY, String(patch.excludeSamplesFolders));
  }
  if (patch.excludeBackupFolders !== undefined) {
    setSetting(db, EXCLUDE_BACKUP_KEY, String(patch.excludeBackupFolders));
  }
  if (patch.excludeFolderPatternEnabled !== undefined) {
    setSetting(db, EXCLUDE_FOLDER_PATTERN_ENABLED_KEY, String(patch.excludeFolderPatternEnabled));
  }
  if (patch.excludeFolderPattern !== undefined) {
    setSetting(db, EXCLUDE_FOLDER_PATTERN_KEY, patch.excludeFolderPattern);
  }
  if (patch.duplicateMatchThresholdPercent !== undefined) {
    setSetting(db, DUPLICATE_MATCH_THRESHOLD_KEY, String(patch.duplicateMatchThresholdPercent));
  }
  return getScanSettings(db);
}
