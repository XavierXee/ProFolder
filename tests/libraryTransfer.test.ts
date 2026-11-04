import Database from "better-sqlite3";
import request from "supertest";
import readXlsxFile from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { createServer } from "../src/api/server.js";
import { MacFinderService } from "../src/services/FinderService.js";
import { MacFolderPickerService } from "../src/services/FolderPickerService.js";
import { MacTrashService } from "../src/services/TrashService.js";
import { NodeFileOpsService } from "../src/services/FileOpsService.js";
import { getEffectiveMusicRoot } from "../src/config/musicRoot.js";
import {
  insertAudioFile,
  findById as findFile,
  setTags as setFileTags,
  setScore as setFileScore,
  setNotes as setFileNotes,
  updateStatus as setFileStatus,
  moveFileInOrderedTab,
  findOrderedTabFilesPaged,
  markRemoved as markFilesRemoved,
  type AudioFileUpsertInput,
} from "../src/database/repositories/audioFileRepository.js";
import {
  upsertProject,
  findById as findProject,
  setTags as setProjectTags,
  updateStatus as setProjectStatus,
} from "../src/database/repositories/projectRepository.js";
import { create as createTab, findAll as findTabs, membershipOf } from "../src/database/repositories/customTabRepository.js";
import { create as createStatus, findAll as findStatuses, update as updateStatusDef } from "../src/database/repositories/statusRepository.js";
import { createTag, listAllTagNames } from "../src/database/repositories/tagRepository.js";
import { getExcludedPaths, setExcludedPaths } from "../src/database/repositories/scanExclusionRepository.js";
import { getPaginationSettings, setPaginationSettings } from "../src/config/paginationSettings.js";
import { getConfirmationSettings, setConfirmationSettings } from "../src/config/confirmationSettings.js";
import { getScanSettings } from "../src/config/scanSettings.js";
import { buildLibraryExport, uniqueSheetName } from "../src/services/libraryExport.js";

const ROOT = "/Music";

function services(db: Database.Database) {
  return {
    finderService: new MacFinderService(() => getEffectiveMusicRoot(db)),
    folderPickerService: new MacFolderPickerService(),
    trashService: new MacTrashService(() => getEffectiveMusicRoot(db)),
    fileOpsService: new NodeFileOpsService(() => getEffectiveMusicRoot(db)),
    runtimeMode: "web" as const,
  };
}

function newDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function addFile(db: Database.Database, id: string, projectId?: string) {
  const now = new Date().toISOString();
  const file: AudioFileUpsertInput = {
    id,
    path: `${ROOT}/${id}`,
    relativePath: id,
    filename: id.split("/").pop()!,
    extension: ".wav",
    size: 1,
    durationSeconds: 75,
    modifiedAt: now,
    containingFolder: `${ROOT}/${id.split("/").slice(0, -1).join("/")}`,
    projectId,
    firstSeenAt: now,
    lastSeenAt: now,
    isRemoved: false,
  };
  insertAudioFile(db, file);
}

function addProject(db: Database.Database, id: string) {
  const now = new Date().toISOString();
  upsertProject(db, { id, name: id, path: `${ROOT}/${id}`, dawType: "ableton", firstSeenAt: now, lastSeenAt: now, hasVideo: false, hasImage: false, contentModifiedAt: null });
}

/** The same scanned library on two machines: one folder with two files, one loose file. */
function seedLibrary(db: Database.Database) {
  addProject(db, "Song");
  addFile(db, "Song/mix.wav", "Song");
  addFile(db, "Song/master.wav", "Song");
  addFile(db, "Exports/single.wav");
}

async function sheetsOf(buffer: Buffer) {
  const sheets = await readXlsxFile(buffer);
  return new Map(sheets.map((s) => [s.sheet, s.data]));
}

let source: Database.Database;
let target: Database.Database;

beforeEach(() => {
  source = newDb();
  target = newDb();
  seedLibrary(source);
  seedLibrary(target);
});

afterEach(() => {
  source.close();
  target.close();
});

async function importInto(db: Database.Database, workbook: Buffer) {
  const res = await request(createServer(db, services(db)))
    .post("/api/library/import")
    .set("Content-Type", "application/octet-stream")
    .send(workbook);
  return res;
}

describe("export", () => {
  it("lays out one sheet per tab, then the custom tab list, catalogs, settings and an About sheet", async () => {
    createTab(source, { name: "Ready", type: "files", statuses: ["done"], scores: [], tags: [] });
    createTab(source, { name: "Folders", type: "projects", statuses: [], scores: [], tags: [] });

    const sheets = await readXlsxFile(await buildLibraryExport(source));

    expect(sheets.map((s) => s.sheet)).toEqual([
      "Project Folders",
      "Audio Files",
      "Ready",
      "Folders",
      "Custom Tabs",
      "Statuses",
      "Tags",
      "Settings",
      "Scan Exclusions",
      "About",
    ]);
  });

  it("lists every item with its status name, tags, score and notes", async () => {
    setFileStatus(source, "Song/mix.wav", "done");
    setFileTags(source, "Song/mix.wav", ["rock", "summer"]);
    setFileScore(source, "Song/mix.wav", 4);
    setFileNotes(source, "Song/mix.wav", "needs a fade");
    setProjectTags(source, "Song", ["rock"]);

    const sheets = await sheetsOf(await buildLibraryExport(source));

    expect(sheets.get("Audio Files")![0]).toEqual(["Id", "Filename", "Project", "Location", "Duration", "Status", "Tags", "Score", "Notes", "Modified"]);
    const mix = sheets.get("Audio Files")!.find((r) => r[0] === "Song/mix.wav")!;
    expect(mix.slice(0, 9)).toEqual(["Song/mix.wav", "mix.wav", "Song", "Song", "1:15", "Done", "rock, summer", 4, "needs a fade"]);
    const song = sheets.get("Project Folders")!.find((r) => r[0] === "Song")!;
    expect(song.slice(0, 8)).toEqual(["Song", "Song", "Ableton", "Unknown", "rock", null, null, 2]);
  });

  it("numbers an ordered tab's sheet in the tab's order and records the tab's definition", async () => {
    setFileTags(source, "Song/mix.wav", ["ep"]);
    setFileTags(source, "Exports/single.wav", ["ep"]);
    const tab = createTab(source, { name: "Summer: EP?", type: "files", statuses: [], scores: [5, "unscored"], tags: ["ep"], ordered: true });
    moveFileInOrderedTab(source, tab.id, membershipOf(tab), "Song/mix.wav", 1);

    const sheets = await sheetsOf(await buildLibraryExport(source));

    expect(sheets.get("Summer EP")!.map((r) => [r[0], r[1]])).toEqual([
      ["#", "Id"],
      [1, "Song/mix.wav"],
      [2, "Exports/single.wav"],
    ]);
    expect(sheets.get("Custom Tabs")![1]).toEqual(["Summer: EP?", "Audio Files", null, "5, Unscored", "ep", "All locations", "Yes", "Summer EP"]);
  });

  it("includes the statuses, tags, settings, scan exclusions and an About marker", async () => {
    createStatus(source, "Mastering", "#e0569b");
    createTag(source, "unused-tag");
    setPaginationSettings(source, { itemsPerPage: 25 });
    setExcludedPaths(source, ["Samples Archive"]);

    const sheets = await sheetsOf(await buildLibraryExport(source));

    expect(sheets.get("Statuses")!.map((r) => r[1])).toContain("Mastering");
    expect(sheets.get("Tags")!.flat()).toContain("unused-tag");
    expect(sheets.get("Settings")!).toContainEqual(["itemsPerPage", 25]);
    expect(sheets.get("Settings")!).toContainEqual(["excludeSamplesFolders", true]);
    expect(sheets.get("Scan Exclusions")!.flat()).toContain("Samples Archive");
    expect(sheets.get("About")![0]![0]).toBe("ProFolder library export");
  });

  it("serves the workbook as a dated .xlsx download", async () => {
    const res = await request(createServer(source, services(source))).get("/api/library/export").buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="ProFolder export \d{4}-\d{2}-\d{2}\.xlsx"$/);
  });
});

describe("uniqueSheetName", () => {
  it("strips characters Excel forbids, caps the length at 31 and avoids duplicates", () => {
    const used = new Set(["Audio Files"]);
    expect(uniqueSheetName("A/B [mix]?", used)).toBe("A B mix");
    expect(uniqueSheetName("audio files", used)).toBe("audio files (2)");
    expect(uniqueSheetName("x".repeat(40), used)).toHaveLength(31);
  });
});

describe("import", () => {
  it("fills in only what the library doesn't have, and adds missing tags without removing any", async () => {
    setFileStatus(source, "Song/mix.wav", "done");
    setFileScore(source, "Song/mix.wav", 4);
    setFileNotes(source, "Song/mix.wav", "from the other machine");
    setFileTags(source, "Song/mix.wav", ["rock", "summer"]);
    setFileStatus(source, "Exports/single.wav", "done");
    setFileScore(source, "Exports/single.wav", 2);
    // The target already has its own values for the loose file: those must win.
    setFileStatus(target, "Exports/single.wav", "draft");
    setFileScore(target, "Exports/single.wav", 5);
    setFileNotes(source, "Exports/single.wav", "their notes");
    setFileNotes(target, "Exports/single.wav", "my notes");
    setFileTags(target, "Song/mix.wav", ["Rock", "local"]);

    const res = await importInto(target, await buildLibraryExport(source));

    expect(res.status).toBe(200);
    const mix = findFile(target, "Song/mix.wav")!;
    expect([mix.status, mix.score, mix.notes]).toEqual(["done", 4, "from the other machine"]);
    expect(mix.tags.sort()).toEqual(["Rock", "local", "summer"]); // "rock" already there as "Rock"
    const single = findFile(target, "Exports/single.wav")!;
    expect([single.status, single.score, single.notes]).toEqual(["draft", 5, "my notes"]);
    expect(res.body.files).toEqual({ updated: 1, unchanged: 2, notInLibrary: 0 });
  });

  it("fills in project folders the same way", async () => {
    setProjectStatus(source, "Song", "released");
    setProjectTags(source, "Song", ["album"]);

    await importInto(target, await buildLibraryExport(source));

    const song = findProject(target, "Song")!;
    expect(song.status).toBe("released");
    expect(song.tags).toEqual(["album"]);
  });

  it("skips and counts items this library doesn't have, without creating them", async () => {
    addFile(source, "Elsewhere/other.wav");
    addProject(source, "Elsewhere");

    const res = await importInto(target, await buildLibraryExport(source));

    expect(findFile(target, "Elsewhere/other.wav")).toBeUndefined();
    expect(res.body.files.notInLibrary).toBe(1);
    expect(res.body.projects.notInLibrary).toBe(1);
  });

  it("treats a tag that differs only in case as already there", async () => {
    setFileTags(source, "Song/mix.wav", ["rock"]);
    setFileTags(target, "Song/mix.wav", ["Rock"]);

    const res = await importInto(target, await buildLibraryExport(source));

    expect(findFile(target, "Song/mix.wav")!.tags).toEqual(["Rock"]);
    expect(res.body.files.updated).toBe(0);
  });

  it("leaves items removed from this library (no longer on disk) alone", async () => {
    setFileStatus(source, "Song/mix.wav", "done");
    markFilesRemoved(target, ["Song/mix.wav"], new Date().toISOString());

    const res = await importInto(target, await buildLibraryExport(source));

    expect(findFile(target, "Song/mix.wav")!.status).toBe("unknown");
    expect(res.body.files.notInLibrary).toBe(1);
  });

  it("adds missing statuses and uses them, matching existing ones by name", async () => {
    const mastering = createStatus(source, "Mastering", "#e0569b");
    setFileStatus(source, "Song/mix.wav", mastering.key);
    // The same status here, under another key (created under another name, then renamed),
    // casing and color.
    const local = createStatus(target, "Final Polish", "#000000");
    updateStatusDef(target, local.key, { name: "mastering" });

    const res = await importInto(target, await buildLibraryExport(source));

    expect(res.body.statusesAdded).toBe(0);
    const targetMastering = findStatuses(target).find((s) => s.name === "mastering")!;
    expect(targetMastering.key).not.toBe(mastering.key);
    expect(targetMastering.color).toBe("#000000");
    expect(findFile(target, "Song/mix.wav")!.status).toBe(targetMastering.key);

    const fresh = newDb();
    seedLibrary(fresh);
    const res2 = await importInto(fresh, await buildLibraryExport(source));
    expect(res2.body.statusesAdded).toBe(1);
    expect(findStatuses(fresh).find((s) => s.name === "Mastering")!.color).toBe("#e0569b");
    fresh.close();
  });

  it("adds missing tags to the catalog", async () => {
    createTag(source, "unused-tag");
    const res = await importInto(target, await buildLibraryExport(source));
    expect(listAllTagNames(target)).toContain("unused-tag");
    expect(res.body.tagsAdded).toBe(1);
  });

  it("adds missing custom tabs (with an ordered tab's order) and keeps same-named ones as they are", async () => {
    for (const db of [source, target]) {
      for (const id of ["Song/mix.wav", "Exports/single.wav"]) {
        setFileTags(db, id, ["ep"]);
        setFileStatus(db, id, "done");
        setFileScore(db, id, 5);
      }
    }
    const ep = createTab(source, { name: "Summer EP", type: "files", statuses: ["done"], scores: [5], tags: ["ep"], ordered: true });
    // Saved order differs from the filename order ("mix.wav" < "single.wav") the tab would fall back to.
    moveFileInOrderedTab(source, ep.id, membershipOf(ep), "Exports/single.wav", 1);
    createTab(source, { name: "Loose", type: "files", statuses: [], scores: [], tags: [], association: "unassociated" });
    createTab(source, { name: "Ready", type: "files", statuses: ["done"], scores: [], tags: [] });
    createTab(target, { name: "ready", type: "projects", statuses: [], scores: [], tags: [] });

    const res = await importInto(target, await buildLibraryExport(source));

    expect(res.body.customTabsAdded).toBe(2);
    expect(res.body.customTabsKept).toBe(1);
    const tabs = findTabs(target);
    expect(tabs.find((t) => t.name === "ready")!.type).toBe("projects");
    expect(tabs.find((t) => t.name === "Loose")).toMatchObject({ type: "files", association: "unassociated", ordered: false });
    const imported = tabs.find((t) => t.name === "Summer EP")!;
    expect(imported).toMatchObject({ type: "files", statuses: ["done"], scores: [5], tags: ["ep"], ordered: true });
    const order = findOrderedTabFilesPaged(target, imported.id, membershipOf(imported)).items.map((f) => f.id);
    expect(order).toEqual(["Exports/single.wav", "Song/mix.wav"]);
  });

  it("applies a setting only where this library still has the default", async () => {
    setPaginationSettings(source, { itemsPerPage: 25 });
    setConfirmationSettings(source, { confirmCopy: false, confirmMove: false });
    setConfirmationSettings(target, { confirmMove: true }); // explicitly chosen here: kept

    const res = await importInto(target, await buildLibraryExport(source));

    expect(getPaginationSettings(target).itemsPerPage).toBe(25);
    expect(getConfirmationSettings(target).confirmCopy).toBe(false);
    expect(getConfirmationSettings(target).confirmMove).toBe(true);
    expect(res.body.settingsKept).toBe(1);
  });

  it("imports scan exclusions only into a library that has none", async () => {
    setExcludedPaths(source, ["Archive"]);
    await importInto(target, await buildLibraryExport(source));
    expect(getExcludedPaths(target)).toEqual(["Archive"]);

    setExcludedPaths(source, ["Other"]);
    const res = await importInto(target, await buildLibraryExport(source));
    expect(getExcludedPaths(target)).toEqual(["Archive"]);
    expect(res.body.scanExclusionsApplied).toBe(false);
  });

  it("changes nothing when a library imports its own export", async () => {
    setFileStatus(source, "Song/mix.wav", "done");
    setFileTags(source, "Song/mix.wav", ["rock"]);
    createTab(source, { name: "Ready", type: "files", statuses: ["done"], scores: [], tags: [] });

    const res = await importInto(source, await buildLibraryExport(source));

    expect(res.body).toMatchObject({
      files: { updated: 0, unchanged: 3, notInLibrary: 0 },
      projects: { updated: 0, unchanged: 1, notInLibrary: 0 },
      statusesAdded: 0,
      tagsAdded: 0,
      customTabsAdded: 0,
      customTabsKept: 1,
      settingsApplied: 0,
    });
  });

  it("ignores an invalid setting value instead of failing the import", async () => {
    const workbook = await editedExport(source, (sheets) => {
      sheets.get("Settings")!.push(["excludeFolderPattern", "("]); // not a valid regular expression
    });
    const res = await importInto(target, workbook);
    expect(res.status).toBe(200);
    expect(getScanSettings(target).excludeFolderPattern).not.toBe("(");
  });

  it("rejects a file that isn't a workbook, or a workbook that isn't a ProFolder export", async () => {
    const notXlsx = await importInto(target, Buffer.from("Id,Status\nSong/mix.wav,Done\n"));
    expect(notXlsx.status).toBe(400);
    expect(notXlsx.body.error).toMatch(/isn't an Excel workbook/);

    const otherWorkbook = await writeXlsxFile([{ sheet: "Sheet1", data: [["hello"]] }]).toBuffer();
    const foreign = await importInto(target, otherWorkbook);
    expect(foreign.status).toBe(400);
    expect(foreign.body.error).toMatch(/isn't a ProFolder library export/);
  });

  it("rejects an empty upload", async () => {
    const res = await request(createServer(target, services(target)))
      .post("/api/library/import")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.alloc(0));
    expect(res.status).toBe(400);
  });
});

/** Exports `db`, lets `edit` change the sheets' rows, and writes the workbook again. */
async function editedExport(db: Database.Database, edit: (sheets: Map<string, unknown[][]>) => void): Promise<Buffer> {
  const sheets = await readXlsxFile(await buildLibraryExport(db));
  const byName = new Map(sheets.map((s) => [s.sheet, s.data as unknown[][]]));
  edit(byName);
  return writeXlsxFile(
    sheets.map((s) => ({ sheet: s.sheet, data: byName.get(s.sheet)!.map((row) => row.map((v) => (v === null ? null : (v as string | number | boolean)))) }))
  ).toBuffer();
}
