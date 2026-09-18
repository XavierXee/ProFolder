import type Database from "better-sqlite3";
import { getSetting, setSetting } from "../database/repositories/appSettingsRepository.js";
import { MAX_PAGE_SIZE } from "../api/pagination.js";

const ITEMS_PER_PAGE_KEY = "itemsPerPage";
const DEFAULT_ITEMS_PER_PAGE = 50;
const MIN_ITEMS_PER_PAGE = 10;

export type PaginationSettings = {
  itemsPerPage: number;
};

/** User-configurable page size, applied uniformly to every tab (Project Folders, Audio
 * Files, and any custom tabs), persisted so it's remembered across sessions. */
export function getPaginationSettings(db: Database.Database): PaginationSettings {
  const stored = getSetting(db, ITEMS_PER_PAGE_KEY);
  if (stored === undefined) return { itemsPerPage: DEFAULT_ITEMS_PER_PAGE };
  const parsed = Number.parseInt(stored, 10);
  return { itemsPerPage: Number.isFinite(parsed) ? parsed : DEFAULT_ITEMS_PER_PAGE };
}

/** Validates and persists a new items-per-page value. Unlike the boolean scan/confirmation
 * settings, this is a direct user-typed number, so an out-of-range or non-integer value is
 * rejected outright (throws) rather than silently clamped or ignored. */
export function setPaginationSettings(
  db: Database.Database,
  patch: Partial<PaginationSettings>
): PaginationSettings {
  if (patch.itemsPerPage !== undefined) {
    const { itemsPerPage } = patch;
    if (!Number.isInteger(itemsPerPage) || itemsPerPage < MIN_ITEMS_PER_PAGE || itemsPerPage > MAX_PAGE_SIZE) {
      throw new Error(`itemsPerPage must be an integer between ${MIN_ITEMS_PER_PAGE} and ${MAX_PAGE_SIZE}`);
    }
    setSetting(db, ITEMS_PER_PAGE_KEY, String(itemsPerPage));
  }
  return getPaginationSettings(db);
}
