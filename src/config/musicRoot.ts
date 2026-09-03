import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { config, expandHome } from "./config.js";
import { getSetting, setSetting } from "../database/repositories/appSettingsRepository.js";
import { setExcludedPaths } from "../database/repositories/scanExclusionRepository.js";

const MUSIC_ROOT_SETTING_KEY = "musicRoot";

/** The music root actually in effect: a user-configured override if one was saved, else the .env/CLI default. */
export function getEffectiveMusicRoot(db: Database.Database): string {
  const override = getSetting(db, MUSIC_ROOT_SETTING_KEY);
  return override ?? config.musicRoot;
}

/**
 * Updates the effective music root, persisting it so it survives restarts.
 * Validates the path exists and is a directory before accepting it.
 * Clears any saved scan exclusions, since they're relative paths meaningful
 * only to the previous root — leaving them would silently misapply to the new one.
 */
export function setMusicRootOverride(db: Database.Database, newRoot: string): string {
  const resolved = path.resolve(expandHome(newRoot.trim()));

  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolved);
  } catch {
    throw new Error(`Path does not exist: ${resolved}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolved}`);
  }

  setSetting(db, MUSIC_ROOT_SETTING_KEY, resolved);
  setExcludedPaths(db, []);
  return resolved;
}
