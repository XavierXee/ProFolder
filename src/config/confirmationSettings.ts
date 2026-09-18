import type Database from "better-sqlite3";
import { getSetting, setSetting } from "../database/repositories/appSettingsRepository.js";

const CONFIRM_TAG_REMOVAL_KEY = "confirmTagRemoval";
const CONFIRM_TAB_DELETION_KEY = "confirmTabDeletion";
const CONFIRM_COPY_KEY = "confirmCopy";
const CONFIRM_MOVE_KEY = "confirmMove";
const CONFIRM_DELETE_KEY = "confirmDelete";

export type ConfirmationSettings = {
  confirmTagRemoval: boolean;
  confirmTabDeletion: boolean;
  confirmCopy: boolean;
  confirmMove: boolean;
  confirmDelete: boolean;
};

function readBooleanSetting(db: Database.Database, key: string, defaultValue: boolean): boolean {
  const stored = getSetting(db, key);
  return stored === undefined ? defaultValue : stored === "true";
}

/** Double text-confirmation toggles for critical actions, persisted so they're remembered across sessions. */
export function getConfirmationSettings(db: Database.Database): ConfirmationSettings {
  return {
    confirmTagRemoval: readBooleanSetting(db, CONFIRM_TAG_REMOVAL_KEY, true),
    confirmTabDeletion: readBooleanSetting(db, CONFIRM_TAB_DELETION_KEY, true),
    confirmCopy: readBooleanSetting(db, CONFIRM_COPY_KEY, true),
    confirmMove: readBooleanSetting(db, CONFIRM_MOVE_KEY, true),
    confirmDelete: readBooleanSetting(db, CONFIRM_DELETE_KEY, true),
  };
}

export function setConfirmationSettings(
  db: Database.Database,
  patch: Partial<ConfirmationSettings>
): ConfirmationSettings {
  if (patch.confirmTagRemoval !== undefined) {
    setSetting(db, CONFIRM_TAG_REMOVAL_KEY, String(patch.confirmTagRemoval));
  }
  if (patch.confirmTabDeletion !== undefined) {
    setSetting(db, CONFIRM_TAB_DELETION_KEY, String(patch.confirmTabDeletion));
  }
  if (patch.confirmCopy !== undefined) {
    setSetting(db, CONFIRM_COPY_KEY, String(patch.confirmCopy));
  }
  if (patch.confirmMove !== undefined) {
    setSetting(db, CONFIRM_MOVE_KEY, String(patch.confirmMove));
  }
  if (patch.confirmDelete !== undefined) {
    setSetting(db, CONFIRM_DELETE_KEY, String(patch.confirmDelete));
  }
  return getConfirmationSettings(db);
}
