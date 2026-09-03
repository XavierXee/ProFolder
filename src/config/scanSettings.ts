import type Database from "better-sqlite3";
import { getSetting, setSetting } from "../database/repositories/appSettingsRepository.js";

const EXCLUDE_SAMPLES_KEY = "excludeSamplesFolders";
const EXCLUDE_BACKUP_KEY = "excludeBackupFolders";

export type ScanSettings = {
  excludeSamplesFolders: boolean;
  excludeBackupFolders: boolean;
};

function readBooleanSetting(db: Database.Database, key: string, defaultValue: boolean): boolean {
  const stored = getSetting(db, key);
  return stored === undefined ? defaultValue : stored === "true";
}

/** Scan-time folder exclusion toggles, persisted so they're remembered across sessions. */
export function getScanSettings(db: Database.Database): ScanSettings {
  return {
    excludeSamplesFolders: readBooleanSetting(db, EXCLUDE_SAMPLES_KEY, true),
    excludeBackupFolders: readBooleanSetting(db, EXCLUDE_BACKUP_KEY, true),
  };
}

export function setScanSettings(db: Database.Database, patch: Partial<ScanSettings>): ScanSettings {
  if (patch.excludeSamplesFolders !== undefined) {
    setSetting(db, EXCLUDE_SAMPLES_KEY, String(patch.excludeSamplesFolders));
  }
  if (patch.excludeBackupFolders !== undefined) {
    setSetting(db, EXCLUDE_BACKUP_KEY, String(patch.excludeBackupFolders));
  }
  return getScanSettings(db);
}
