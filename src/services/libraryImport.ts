import type Database from "better-sqlite3";
import readXlsxFile from "read-excel-file/node";
import { UNKNOWN_STATUS_KEY, type TrackStatus } from "../models/AudioFile.js";
import { isValidScore } from "../models/Score.js";
import type { CustomTabType } from "../models/CustomTab.js";
import type { ImportSummary } from "../models/LibraryImport.js";
import {
  findById as findFileById,
  updateStatus as setFileStatus,
  setScore as setFileScore,
  setNotes as setFileNotes,
  addTagsToFiles,
  saveOrderedTabPositions,
} from "../database/repositories/audioFileRepository.js";
import {
  findById as findProjectById,
  updateStatus as setProjectStatus,
  setScore as setProjectScore,
  setNotes as setProjectNotes,
  addTagsToProjects,
} from "../database/repositories/projectRepository.js";
import { findAll as findAllCustomTabs, create as createCustomTab } from "../database/repositories/customTabRepository.js";
import { findAll as findAllStatuses, create as createStatus } from "../database/repositories/statusRepository.js";
import { createTag, tagExists } from "../database/repositories/tagRepository.js";
import { getExcludedPaths, setExcludedPaths } from "../database/repositories/scanExclusionRepository.js";
import { getSetting } from "../database/repositories/appSettingsRepository.js";
import { getScanSettings, setScanSettings } from "../config/scanSettings.js";
import { getConfirmationSettings, setConfirmationSettings } from "../config/confirmationSettings.js";
import { getPaginationSettings, setPaginationSettings } from "../config/paginationSettings.js";
import { getMetricsSettings, setMetricsSettings } from "../config/metricsSettings.js";
import {
  EXPORT_FORMAT_VERSION,
  EXPORT_MARKER,
  LIST_SEPARATOR,
  LOCATIONS_LABEL,
  SETTINGS,
  SHEET,
  TAB_TYPE_LABEL,
  TRACK_NUMBER_COLUMN,
  UNKNOWN_STATUS_LABEL,
  UNSCORED_LABEL,
} from "./libraryExport.js";

/**
 * Reads a library export (`libraryExport.ts`) back into the database without overwriting
 * anything: whatever the library already has wins, and the file only fills the gaps.
 * - Projects and audio files are matched by id (their path relative to the music folder); rows
 *   for items this library doesn't have are skipped. An unknown status, a missing score or empty
 *   notes are filled in, and tags are added to the item's own (never removed).
 * - Statuses, tags and custom tabs missing from the library are added (a custom tab is matched
 *   by name; an ordered one gets its exported track order).
 * - A setting is applied only if this library still has its default (never changed); scan
 *   exclusions only if this library has none. The music folder is never imported.
 * Everything is applied in one transaction: a file that fails part-way changes nothing.
 */

export class ImportFormatError extends Error {}


type Cell = string | number | boolean | null | unknown;
/** A sheet's data rows as objects keyed by the header row's column names. */
type Records = Record<string, Cell>[];

export async function importLibrary(db: Database.Database, input: Buffer): Promise<ImportSummary> {
  let sheets: { sheet: string; data: Cell[][] }[];
  try {
    sheets = (await readXlsxFile(input)) as { sheet: string; data: Cell[][] }[];
  } catch {
    throw new ImportFormatError("This file isn't an Excel workbook (.xlsx).");
  }
  const byName = new Map(sheets.map((s) => [s.sheet.toLowerCase(), s.data]));
  const records = (name: string): Records => toRecords(byName.get(name.toLowerCase()));

  const about = byName.get(SHEET.about.toLowerCase());
  if (text(about?.[0]?.[0]) !== EXPORT_MARKER) {
    throw new ImportFormatError("This workbook isn't a ProFolder library export.");
  }
  const version = Number(about?.[1]?.[1]);
  if (version > EXPORT_FORMAT_VERSION) {
    throw new ImportFormatError("This export was made by a newer version of ProFolder.");
  }

  return db.transaction((): ImportSummary => {
    const resolveStatus = importStatuses(db, records(SHEET.statuses));
    const summary: ImportSummary = {
      projects: { updated: 0, unchanged: 0, notInLibrary: 0 },
      files: { updated: 0, unchanged: 0, notInLibrary: 0 },
      statusesAdded: resolveStatus.added,
      tagsAdded: importTags(db, records(SHEET.tags)),
      customTabsAdded: 0,
      customTabsKept: 0,
      settingsApplied: 0,
      settingsKept: 0,
      scanExclusionsApplied: false,
    };

    for (const row of records(SHEET.projects)) {
      const id = text(row.Id);
      const current = id ? findProjectById(db, id) : undefined;
      if (!current || current.isRemoved) {
        if (id) summary.projects.notInLibrary++;
        continue;
      }
      const changed = fillGaps(current, row, resolveStatus.key, {
        status: (s) => setProjectStatus(db, current.id, s),
        score: (s) => setProjectScore(db, current.id, s),
        notes: (n) => setProjectNotes(db, current.id, n),
        tags: (t) => addTagsToProjects(db, [current.id], t),
      });
      summary.projects[changed ? "updated" : "unchanged"]++;
    }

    for (const row of records(SHEET.files)) {
      const id = text(row.Id);
      const current = id ? findFileById(db, id) : undefined;
      if (!current || current.isRemoved) {
        if (id) summary.files.notInLibrary++;
        continue;
      }
      const changed = fillGaps(current, row, resolveStatus.key, {
        status: (s) => setFileStatus(db, current.id, s),
        score: (s) => setFileScore(db, current.id, s),
        notes: (n) => setFileNotes(db, current.id, n),
        tags: (t) => addTagsToFiles(db, [current.id], t),
      });
      summary.files[changed ? "updated" : "unchanged"]++;
    }

    const existingTabNames = new Set(findAllCustomTabs(db).map((t) => t.name.toLowerCase()));
    for (const row of records(SHEET.customTabs)) {
      const name = text(row.Name);
      const type = (Object.keys(TAB_TYPE_LABEL) as CustomTabType[]).find((t) => TAB_TYPE_LABEL[t] === text(row.Type));
      if (!name || !type) continue;
      if (existingTabNames.has(name.toLowerCase())) {
        summary.customTabsKept++;
        continue;
      }
      const association = (["associated", "unassociated"] as const).find((a) => LOCATIONS_LABEL[a] === text(row.Locations));
      const tab = createCustomTab(db, {
        name,
        type,
        statuses: list(row.Statuses)
          .map((s) => resolveStatus.key(s))
          .filter((s): s is TrackStatus => s !== undefined),
        scores: list(row.Scores)
          .map((s) => (s.toLowerCase() === UNSCORED_LABEL.toLowerCase() ? "unscored" : Number(s)))
          .filter((s): s is number | "unscored" => s === "unscored" || isValidScore(s)),
        tags: list(row.Tags),
        association: type === "files" ? association : undefined,
        ordered: type === "files" && text(row.Ordered).toLowerCase() === "yes",
      });
      existingTabNames.add(name.toLowerCase());
      summary.customTabsAdded++;

      if (tab.ordered) {
        const tabRows = records(text(row.Sheet))
          .filter((r) => text(r.Id) && Number.isFinite(Number(r[TRACK_NUMBER_COLUMN])))
          .sort((a, b) => Number(a[TRACK_NUMBER_COLUMN]) - Number(b[TRACK_NUMBER_COLUMN]));
        const ids = tabRows.map((r) => text(r.Id)).filter((id) => findFileById(db, id) !== undefined);
        saveOrderedTabPositions(db, tab.id, ids);
      }
    }

    const imported = new Map(records(SHEET.settings).map((r) => [text(r.Setting), r.Value]));
    const effective: Record<string, unknown> = {
      ...getScanSettings(db),
      ...getConfirmationSettings(db),
      ...getPaginationSettings(db),
      ...getMetricsSettings(db),
    };
    for (const setting of SETTINGS) {
      if (!imported.has(setting.field)) continue;
      const value = parseSettingValue(setting.group, imported.get(setting.field));
      // Same value as here already (e.g. both at the default): nothing to do. Writing it would
      // also make it look chosen, so a later import couldn't fill it any more.
      if (value === undefined || JSON.stringify(value) === JSON.stringify(effective[setting.field])) continue;
      if (getSetting(db, setting.storageKey) !== undefined) {
        summary.settingsKept++;
        continue;
      }
      if (applySetting(db, setting.group, setting.field, value)) summary.settingsApplied++;
    }

    const exclusions = records(SHEET.scanExclusions).map((r) => text(r["Excluded folder"])).filter(Boolean);
    if (exclusions.length > 0 && getExcludedPaths(db).length === 0) {
      setExcludedPaths(db, exclusions);
      summary.scanExclusionsApplied = true;
    }

    return summary;
  })();
}

/** Fills an item's unset fields from an imported row; returns whether anything changed. */
function fillGaps(
  current: { status: string; score: number | null; notes: string; tags: string[] },
  row: Record<string, Cell>,
  statusKey: (name: string) => TrackStatus | undefined,
  write: {
    status: (s: TrackStatus) => void;
    score: (s: number) => void;
    notes: (n: string) => void;
    tags: (t: string[]) => void;
  }
): boolean {
  let changed = false;
  const status = statusKey(text(row.Status));
  if (current.status === UNKNOWN_STATUS_KEY && status && status !== UNKNOWN_STATUS_KEY) {
    write.status(status);
    changed = true;
  }
  const score = Number(row.Score);
  if (current.score === null && row.Score !== null && row.Score !== "" && isValidScore(score)) {
    write.score(score);
    changed = true;
  }
  const notes = text(row.Notes);
  if (current.notes === "" && notes !== "") {
    write.notes(notes);
    changed = true;
  }
  const have = new Set(current.tags.map((t) => t.toLowerCase()));
  const missing = list(row.Tags).filter((t) => !have.has(t.toLowerCase()));
  if (missing.length > 0) {
    write.tags(missing);
    changed = true;
  }
  return changed;
}

/**
 * Adds the export's statuses this library doesn't have, and returns a lookup from a status as
 * written in the export (its name, or its key) to this library's key. A status matching one of
 * ours by key or by name maps onto ours (ours wins, name and color included).
 */
function importStatuses(db: Database.Database, rows: Records) {
  const current = findAllStatuses(db);
  const byKey = new Map(current.map((s) => [s.key, s.key]));
  const byName = new Map(current.map((s) => [s.name.toLowerCase(), s.key]));
  let added = 0;
  for (const row of rows) {
    const key = text(row.Key);
    const name = text(row.Name);
    if (!name) continue;
    const existing = byKey.get(key) ?? byName.get(name.toLowerCase());
    if (existing) {
      if (key) byKey.set(key, existing);
      continue;
    }
    const color = /^#[0-9a-fA-F]{6}$/.test(text(row.Color)) ? text(row.Color) : "#94a3b8";
    const created = createStatus(db, name, color);
    if (key) byKey.set(key, created.key);
    byName.set(name.toLowerCase(), created.key);
    added++;
  }
  return {
    added,
    key(value: string): TrackStatus | undefined {
      if (!value) return undefined;
      if (value.toLowerCase() === UNKNOWN_STATUS_LABEL.toLowerCase() || value === UNKNOWN_STATUS_KEY) {
        return UNKNOWN_STATUS_KEY;
      }
      return byName.get(value.toLowerCase()) ?? byKey.get(value);
    },
  };
}

function importTags(db: Database.Database, rows: Records): number {
  let added = 0;
  for (const row of rows) {
    const tag = text(row.Tag);
    if (tag && !tagExists(db, tag)) {
      createTag(db, tag);
      added++;
    }
  }
  return added;
}

/** An imported Settings cell as a setting value; undefined if it can't be read. */
function parseSettingValue(group: (typeof SETTINGS)[number]["group"], raw: Cell): unknown {
  if (group === "metrics") {
    try {
      return JSON.parse(text(raw));
    } catch {
      return undefined;
    }
  }
  // A cell edited in a spreadsheet app can come back as text ("TRUE", "50").
  if (typeof raw === "string" && /^(true|false)$/i.test(raw.trim())) return raw.trim().toLowerCase() === "true";
  if (typeof raw === "string" && /^-?\d+(\.\d+)?$/.test(raw.trim())) return Number(raw);
  return raw ?? undefined;
}

/** Applies one setting through its module's own validation; false if it was rejected. */
function applySetting(db: Database.Database, group: (typeof SETTINGS)[number]["group"], field: string, value: unknown): boolean {
  try {
    if (group === "scan") setScanSettings(db, { [field]: value });
    else if (group === "confirmation") setConfirmationSettings(db, { [field]: value });
    else if (group === "pagination") setPaginationSettings(db, { [field]: value });
    else setMetricsSettings(db, { [field]: value });
    return true;
  } catch {
    return false;
  }
}

function toRecords(data: Cell[][] | undefined): Records {
  if (!data || data.length === 0) return [];
  const header = data[0]!.map((h) => text(h));
  return data.slice(1).map((row) => Object.fromEntries(header.map((h, i) => [h, row[i] ?? null])));
}

function text(value: Cell): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** A list cell ("a, b, c") as its trimmed, non-empty items. */
function list(value: Cell): string[] {
  return text(value)
    .split(LIST_SEPARATOR.trim())
    .map((s) => s.trim())
    .filter(Boolean);
}
