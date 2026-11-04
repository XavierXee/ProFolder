import type Database from "better-sqlite3";
import writeXlsxFile, { type Row, type Sheet } from "write-excel-file/node";
import type { AudioFile } from "../models/AudioFile.js";
import { UNKNOWN_STATUS_KEY } from "../models/AudioFile.js";
import type { Project } from "../models/Project.js";
import type { CustomTab } from "../models/CustomTab.js";
import { DAW_LABELS } from "../scanner/dawTypes.js";
import {
  findAllActive as findAllActiveFiles,
  findAllActivePaged as findFilesPaged,
  findOrderedTabFilesPaged,
} from "../database/repositories/audioFileRepository.js";
import {
  findAllActive as findAllActiveProjects,
  findAllActivePaged as findProjectsPaged,
} from "../database/repositories/projectRepository.js";
import { findAll as findAllCustomTabs, membershipOf } from "../database/repositories/customTabRepository.js";
import { findAll as findAllStatuses } from "../database/repositories/statusRepository.js";
import { listAllTagNames } from "../database/repositories/tagRepository.js";
import { getExcludedPaths } from "../database/repositories/scanExclusionRepository.js";
import { getScanSettings } from "../config/scanSettings.js";
import { getConfirmationSettings } from "../config/confirmationSettings.js";
import { getPaginationSettings } from "../config/paginationSettings.js";
import { getMetricsSettings } from "../config/metricsSettings.js";
import { getEffectiveMusicRoot } from "../config/musicRoot.js";

/**
 * The library export: one Excel workbook (.xlsx) holding everything in the database, laid out
 * so each tab and each kind of setting opens as its own sheet. `libraryImport.ts` reads the same
 * layout back, matching sheets and columns by their names, so the names below are part of the
 * file format.
 */

export const EXPORT_MARKER = "ProFolder library export";
export const EXPORT_FORMAT_VERSION = 1;

export const SHEET = {
  projects: "Project Folders",
  files: "Audio Files",
  customTabs: "Custom Tabs",
  statuses: "Statuses",
  tags: "Tags",
  settings: "Settings",
  scanExclusions: "Scan Exclusions",
  about: "About",
} as const;

export const PROJECT_COLUMNS = ["Id", "Name", "Type", "Status", "Tags", "Score", "Notes", "Audio Files", "Modified"] as const;
export const FILE_COLUMNS = ["Id", "Filename", "Project", "Location", "Duration", "Status", "Tags", "Score", "Notes", "Modified"] as const;
export const TRACK_NUMBER_COLUMN = "#";
export const CUSTOM_TAB_COLUMNS = ["Name", "Type", "Statuses", "Scores", "Tags", "Locations", "Ordered", "Sheet"] as const;
export const STATUS_COLUMNS = ["Key", "Name", "Color"] as const;

export const TAB_TYPE_LABEL = { files: "Audio Files", projects: "Project Folders" } as const;
export const LOCATIONS_LABEL = {
  all: "All locations",
  associated: "Only files within project folders",
  unassociated: "Only files outside of project folders",
} as const;
export const UNSCORED_LABEL = "Unscored";
export const UNKNOWN_STATUS_LABEL = "Unknown";
/** Separator for list cells (tags, statuses, scores). */
export const LIST_SEPARATOR = ", ";

/** Each exported setting: the field name used in the Settings sheet and the app_settings key that
 * holds it (the import only applies a setting whose key was never stored, i.e. still default). */
export const SETTINGS = [
  { group: "scan", field: "excludeSamplesFolders", storageKey: "excludeSamplesFolders" },
  { group: "scan", field: "excludeBackupFolders", storageKey: "excludeBackupFolders" },
  { group: "scan", field: "excludeFolderPatternEnabled", storageKey: "excludeFolderPatternEnabled" },
  { group: "scan", field: "excludeFolderPattern", storageKey: "excludeFolderPattern" },
  { group: "scan", field: "duplicateMatchThresholdPercent", storageKey: "duplicateMatchThresholdPercent" },
  { group: "confirmation", field: "confirmTabDeletion", storageKey: "confirmTabDeletion" },
  { group: "confirmation", field: "confirmCopy", storageKey: "confirmCopy" },
  { group: "confirmation", field: "confirmMove", storageKey: "confirmMove" },
  { group: "confirmation", field: "confirmDelete", storageKey: "confirmDelete" },
  { group: "confirmation", field: "confirmStatusDeletion", storageKey: "confirmStatusDeletion" },
  { group: "confirmation", field: "confirmTagDeletion", storageKey: "confirmTagDeletion" },
  { group: "pagination", field: "itemsPerPage", storageKey: "itemsPerPage" },
  { group: "metrics", field: "projectsMetrics", storageKey: "metricsProjects" },
  { group: "metrics", field: "filesMetrics", storageKey: "metricsFiles" },
] as const;

/** Builds the export workbook for the whole library. */
export async function buildLibraryExport(db: Database.Database, exportedAt = new Date()): Promise<Buffer> {
  const statusNames = new Map(findAllStatuses(db).map((s) => [s.key, s.name]));
  const statusLabel = (key: string) =>
    key === UNKNOWN_STATUS_KEY ? UNKNOWN_STATUS_LABEL : (statusNames.get(key) ?? key);

  const files = findAllActiveFiles(db);
  const fileCountByProject = new Map<string, number>();
  for (const f of files) if (f.projectId) fileCountByProject.set(f.projectId, (fileCountByProject.get(f.projectId) ?? 0) + 1);

  const projectRow = (p: Project): Row => [
    p.id,
    p.name,
    p.dawType ? DAW_LABELS[p.dawType] : "Folder",
    statusLabel(p.status),
    p.tags.join(LIST_SEPARATOR),
    p.score,
    p.notes,
    fileCountByProject.get(p.id) ?? 0,
    p.contentModifiedAt ?? "",
  ];
  const fileRow = (f: AudioFile): Row => [
    f.id,
    f.filename,
    f.projectId ?? "",
    f.relativePath.split("/").slice(0, -1).join("/"),
    f.durationSeconds === null ? "" : formatDuration(f.durationSeconds),
    statusLabel(f.status),
    f.tags.join(LIST_SEPARATOR),
    f.score,
    f.notes,
    f.modifiedAt,
  ];

  const sheets: Sheet<never>[] = [
    table(SHEET.projects, PROJECT_COLUMNS, findAllActiveProjects(db).map(projectRow)),
    table(SHEET.files, FILE_COLUMNS, files.map(fileRow)),
  ];

  const tabs = findAllCustomTabs(db);
  const usedNames = new Set<string>(Object.values(SHEET));
  const tabSheetNames = new Map<number, string>();
  for (const tab of tabs) {
    const name = uniqueSheetName(tab.name, usedNames);
    tabSheetNames.set(tab.id, name);
    sheets.push(customTabSheet(db, tab, name, projectRow, fileRow));
  }

  sheets.push(
    table(
      SHEET.customTabs,
      CUSTOM_TAB_COLUMNS,
      tabs.map((tab) => [
        tab.name,
        TAB_TYPE_LABEL[tab.type],
        tab.statuses.map(statusLabel).join(LIST_SEPARATOR),
        tab.scores.map((s) => (s === "unscored" ? UNSCORED_LABEL : String(s))).join(LIST_SEPARATOR),
        tab.tags.join(LIST_SEPARATOR),
        tab.type === "files" ? LOCATIONS_LABEL[tab.association ?? "all"] : "",
        tab.type === "files" ? (tab.ordered ? "Yes" : "No") : "",
        tabSheetNames.get(tab.id)!,
      ])
    ),
    table(
      SHEET.statuses,
      STATUS_COLUMNS,
      findAllStatuses(db).map((s) => [s.key, s.name, s.color])
    ),
    table(SHEET.tags, ["Tag"], listAllTagNames(db).map((t) => [t])),
    table(SHEET.settings, ["Setting", "Value"], settingsRows(db)),
    table(SHEET.scanExclusions, ["Excluded folder"], getExcludedPaths(db).map((p) => [p])),
    {
      sheet: SHEET.about,
      columns: [{ width: 22 }, { width: 70 }],
      data: [
        [EXPORT_MARKER, null],
        ["Format version", EXPORT_FORMAT_VERSION],
        ["Exported at", exportedAt.toISOString()],
        ["Music folder", getEffectiveMusicRoot(db)],
        [
          "Notes",
          "Ids are paths relative to the music folder. Importing this file fills in missing data " +
            "only: anything already set in the library is kept. The music folder isn't imported.",
        ],
      ],
    }
  );

  return writeXlsxFile(sheets).toBuffer();
}

/** One sheet listing a custom tab's items, as the tab shows them (ordered tabs in their order,
 * numbered in a leading "#" column). */
function customTabSheet(
  db: Database.Database,
  tab: CustomTab,
  sheetName: string,
  projectRow: (p: Project) => Row,
  fileRow: (f: AudioFile) => Row
): Sheet<never> {
  const membership = membershipOf(tab);
  if (tab.type === "projects") {
    return table(sheetName, PROJECT_COLUMNS, findProjectsPaged(db, membership).items.map(projectRow));
  }
  if (tab.ordered) {
    const { items } = findOrderedTabFilesPaged(db, tab.id, membership);
    return table(sheetName, [TRACK_NUMBER_COLUMN, ...FILE_COLUMNS], items.map((f) => [f.trackNumber ?? null, ...fileRow(f)]));
  }
  return table(sheetName, FILE_COLUMNS, findFilesPaged(db, membership).items.map(fileRow));
}

function settingsRows(db: Database.Database): Row[] {
  const values: Record<string, unknown> = {
    ...getScanSettings(db),
    ...getConfirmationSettings(db),
    ...getPaginationSettings(db),
    ...getMetricsSettings(db),
  };
  const rows: Row[] = SETTINGS.map(({ field }) => {
    const value = values[field];
    return [field, typeof value === "object" ? JSON.stringify(value) : (value as string | number | boolean)];
  });
  return rows;
}

/** A sheet with a bold, frozen header row. */
function table(sheet: string, header: readonly string[], rows: Row[]): Sheet<never> {
  return {
    sheet,
    stickyRowsCount: 1,
    columns: header.map((h) => ({ width: h === "Notes" || h === "Id" ? 40 : h === "#" ? 5 : 18 })),
    data: [header.map((value) => ({ value, fontWeight: "bold" as const })), ...rows],
  };
}

/** Excel sheet names: at most 31 characters, none of []:*?/\, unique (case-insensitively). */
export function uniqueSheetName(wanted: string, used: Set<string>): string {
  const base = wanted.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Tab";
  const taken = (name: string) => [...used].some((u) => u.toLowerCase() === name.toLowerCase());
  let name = base;
  for (let n = 2; taken(name); n++) {
    const suffix = ` (${n})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name);
  return name;
}

function formatDuration(seconds: number): string {
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
