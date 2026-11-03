import Database from "better-sqlite3";
import request from "supertest";
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
  moveFile,
  setTags,
  type AudioFileUpsertInput,
} from "../src/database/repositories/audioFileRepository.js";

const MUSIC_ROOT = "/Music";

function makeServerServices(db: Database.Database) {
  return {
    finderService: new MacFinderService(() => getEffectiveMusicRoot(db)),
    folderPickerService: new MacFolderPickerService(),
    trashService: new MacTrashService(() => getEffectiveMusicRoot(db)),
    fileOpsService: new NodeFileOpsService(() => getEffectiveMusicRoot(db)),
    runtimeMode: "web" as const,
  };
}

function makeFile(id: string, durationSeconds: number | null = null): AudioFileUpsertInput {
  const now = new Date().toISOString();
  return {
    id,
    path: `${MUSIC_ROOT}/${id}`,
    relativePath: id,
    filename: id.split("/").pop()!,
    extension: ".wav",
    size: 100,
    durationSeconds,
    modifiedAt: now,
    containingFolder: MUSIC_ROOT,
    firstSeenAt: now,
    lastSeenAt: now,
    isRemoved: false,
  };
}

let db: Database.Database;
let app: ReturnType<typeof createServer>;

/** Adds a file tagged "ep", i.e. a member of the tab created by `createEpTab`. */
function addEpFile(id: string, durationSeconds: number | null = null) {
  insertAudioFile(db, makeFile(id, durationSeconds));
  setTags(db, id, ["ep"]);
}

async function createEpTab(ordered = true): Promise<number> {
  const res = await request(app).post("/api/custom-tabs").send({ name: "EP", type: "files", tags: ["ep"], ordered });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function listing(tabId: number, query: Record<string, string | number> = {}) {
  const res = await request(app).get("/api/files").query({ orderedTab: tabId, ...query });
  expect(res.status).toBe(200);
  return res.body as { files: { id: string; trackNumber?: number }[]; total: number; totalDurationSeconds: number };
}

async function order(tabId: number): Promise<string[]> {
  return (await listing(tabId)).files.map((f) => `${f.trackNumber} ${f.id}`);
}

function move(tabId: number, fileId: string, position: number) {
  return request(app).put(`/api/custom-tabs/${tabId}/files/order`).send({ fileId, position });
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  app = createServer(db, makeServerServices(db));
  addEpFile("EP/b.wav");
  addEpFile("EP/a.wav");
  addEpFile("EP/c.wav");
  insertAudioFile(db, makeFile("Other/not-in-tab.wav"));
});

afterEach(() => {
  db.close();
});

describe("creating an ordered tab", () => {
  it("stores the ordered flag for an Audio Files tab", async () => {
    const tabId = await createEpTab();
    const { body } = await request(app).get("/api/custom-tabs");
    expect(body.tabs.find((t: { id: number }) => t.id === tabId).ordered).toBe(true);
  });

  it("ignores the ordered flag for a Project Folders tab", async () => {
    const res = await request(app).post("/api/custom-tabs").send({ name: "P", type: "projects", ordered: true });
    expect(res.body.ordered).toBe(false);
  });

  it("defaults to not ordered", async () => {
    const res = await request(app).post("/api/custom-tabs").send({ name: "F", type: "files" });
    expect(res.body.ordered).toBe(false);
  });
});

describe("listing an ordered tab", () => {
  it("numbers only the tab's files, by filename until the first reorder", async () => {
    const tabId = await createEpTab();
    expect(await order(tabId)).toEqual(["1 EP/a.wav", "2 EP/b.wav", "3 EP/c.wav"]);
  });

  it("keeps each file's number while searching, and totals only the matches", async () => {
    addEpFile("EP/d.wav", 40);
    db.prepare(`UPDATE audio_files SET duration_seconds = 20 WHERE id = 'EP/c.wav'`).run();
    const tabId = await createEpTab();

    const found = await listing(tabId, { search: "c.wav" });

    expect(found.files.map((f) => [f.trackNumber, f.id])).toEqual([[3, "EP/c.wav"]]);
    expect(found.total).toBe(1);
    expect(found.totalDurationSeconds).toBe(20);
  });

  it("pages through the tab in order", async () => {
    const tabId = await createEpTab();
    const page2 = await listing(tabId, { page: 2, pageSize: 2 });
    expect(page2.files.map((f) => [f.trackNumber, f.id])).toEqual([[3, "EP/c.wav"]]);
    expect(page2.total).toBe(3);
  });

  it("returns 404 for a tab that isn't an ordered Audio Files tab", async () => {
    const plainTabId = await createEpTab(false);
    expect((await request(app).get("/api/files").query({ orderedTab: plainTabId })).status).toBe(404);
    expect((await request(app).get("/api/files").query({ orderedTab: 999 })).status).toBe(404);
  });

  it("leaves the plain files listing un-numbered", async () => {
    await createEpTab();
    const res = await request(app).get("/api/files");
    expect(res.body.files.every((f: { trackNumber?: number }) => f.trackNumber === undefined)).toBe(true);
  });
});

describe("reordering an ordered tab", () => {
  it("moves a file down, shifting the files in between up", async () => {
    const tabId = await createEpTab();
    expect((await move(tabId, "EP/a.wav", 3)).status).toBe(200);
    expect(await order(tabId)).toEqual(["1 EP/b.wav", "2 EP/c.wav", "3 EP/a.wav"]);
  });

  it("moves a file up, shifting the files in between down", async () => {
    const tabId = await createEpTab();
    await move(tabId, "EP/c.wav", 1);
    expect(await order(tabId)).toEqual(["1 EP/c.wav", "2 EP/a.wav", "3 EP/b.wav"]);
  });

  it("clamps a position past the end to the last place", async () => {
    const tabId = await createEpTab();
    await move(tabId, "EP/a.wav", 99);
    expect(await order(tabId)).toEqual(["1 EP/b.wav", "2 EP/c.wav", "3 EP/a.wav"]);
  });

  it("lists a file that joins the tab after a reorder at the end", async () => {
    const tabId = await createEpTab();
    await move(tabId, "EP/c.wav", 1);
    addEpFile("EP/0-new.wav"); // would sort first by filename
    expect(await order(tabId)).toEqual(["1 EP/c.wav", "2 EP/a.wav", "3 EP/b.wav", "4 EP/0-new.wav"]);
  });

  it("keeps a file's place when the file is moved on disk (its id changes)", async () => {
    const tabId = await createEpTab();
    await move(tabId, "EP/c.wav", 1);
    moveFile(db, "EP/c.wav", `${MUSIC_ROOT}/Moved/c.wav`, MUSIC_ROOT);
    expect(await order(tabId)).toEqual(["1 Moved/c.wav", "2 EP/a.wav", "3 EP/b.wav"]);
  });

  it("drops the tab's saved order when the tab is deleted", async () => {
    const tabId = await createEpTab();
    await move(tabId, "EP/c.wav", 1);
    await request(app).delete(`/api/custom-tabs/${tabId}`);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM custom_tab_file_positions`).get()).toEqual({ n: 0 });
  });

  it("rejects a file that isn't in the tab, and bad input", async () => {
    const tabId = await createEpTab();
    expect((await move(tabId, "Other/not-in-tab.wav", 1)).status).toBe(400);
    expect((await move(tabId, "EP/a.wav", 0)).status).toBe(400);
    expect((await move(tabId, "EP/a.wav", 1.5)).status).toBe(400);
    expect((await request(app).put(`/api/custom-tabs/${tabId}/files/order`).send({ position: 1 })).status).toBe(400);
  });

  it("returns 404 for a tab that isn't ordered", async () => {
    const plainTabId = await createEpTab(false);
    expect((await move(plainTabId, "EP/a.wav", 1)).status).toBe(404);
  });

  it("keeps the saved order when the tab is edited, and brings it back if turned off then on again", async () => {
    const tabId = await createEpTab();
    await move(tabId, "EP/c.wav", 1);
    const edit = (ordered: boolean) =>
      request(app).put(`/api/custom-tabs/${tabId}`).send({ name: "Renamed EP", type: "files", tags: ["ep"], ordered });

    expect((await edit(false)).status).toBe(200);
    expect((await request(app).get("/api/files").query({ orderedTab: tabId })).status).toBe(404);

    await edit(true);
    expect(await order(tabId)).toEqual(["1 EP/c.wav", "2 EP/a.wav", "3 EP/b.wav"]);
  });
});
