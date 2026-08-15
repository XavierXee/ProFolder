import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runScan } from "../src/scanner/scanner.js";
import { runMigrations } from "../src/database/db.js";
import { findAllActive as findAllActiveFiles, updateStatus, setTags } from "../src/database/repositories/audioFileRepository.js";
import { findAllActive as findAllActiveProjects } from "../src/database/repositories/projectRepository.js";

let tmpRoot: string;
let db: Database.Database;

async function writeFile(relPath: string, content = ""): Promise<void> {
  const absPath = path.join(tmpRoot, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content);
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "music-scan-test-"));
  db = new Database(":memory:");
  runMigrations(db);

  await writeFile("Ableton Projects/Track A/Track A.als", "als-a");
  await writeFile("Ableton Projects/Track A/Exports/Track A - Final.wav", "final-audio");
  await writeFile("Ableton Projects/Track B/Track B.als", "als-b");
  await writeFile("Ableton Projects/Track B/Bounce/Track B - Draft.wav", "draft-audio");
  await writeFile("Sample Library/Drums/kick.wav", "kick-audio");
});

afterEach(async () => {
  db.close();
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("runScan", () => {
  it("scans a fixture tree and correctly classifies/associates files", async () => {
    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.audioFilesFound).toBe(3);
    expect(stats.abletonProjectsFound).toBe(2);
    expect(stats.newFiles).toBe(3);
    expect(stats.modifiedFiles).toBe(0);
    expect(stats.removedFiles).toBe(0);

    const files = findAllActiveFiles(db);
    expect(files).toHaveLength(3);

    const finalTrack = files.find((f) => f.filename === "Track A - Final.wav");
    expect(finalTrack?.isExportCandidate).toBe(true);
    expect(finalTrack?.projectId).toBe(path.join("Ableton Projects", "Track A"));

    const draftTrack = files.find((f) => f.filename === "Track B - Draft.wav");
    expect(draftTrack?.isExportCandidate).toBe(false);
    expect(draftTrack?.projectId).toBe(path.join("Ableton Projects", "Track B"));

    const kick = files.find((f) => f.filename === "kick.wav");
    expect(kick?.projectId).toBeUndefined();

    const projects = findAllActiveProjects(db);
    expect(projects).toHaveLength(2);
  });

  it("does not create duplicate records on a rescan with no filesystem changes", async () => {
    await runScan({ rootPath: tmpRoot }, db);
    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.newFiles).toBe(0);
    expect(stats.modifiedFiles).toBe(0);
    expect(stats.removedFiles).toBe(0);
    expect(findAllActiveFiles(db)).toHaveLength(3);
  });

  it("detects modified files while preserving user-set status and tags", async () => {
    await runScan({ rootPath: tmpRoot }, db);
    const files = findAllActiveFiles(db);
    const finalTrack = files.find((f) => f.filename === "Track A - Final.wav")!;
    updateStatus(db, finalTrack.id, "finished");
    setTags(db, finalTrack.id, ["electronic", "album"]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeFile("Ableton Projects/Track A/Exports/Track A - Final.wav", "changed-content-longer");

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.modifiedFiles).toBe(1);
    expect(stats.newFiles).toBe(0);

    const updated = findAllActiveFiles(db).find((f) => f.filename === "Track A - Final.wav")!;
    expect(updated.status).toBe("finished");
    expect(updated.tags.sort()).toEqual(["album", "electronic"]);
  });

  it("soft-deletes files that disappear from disk instead of hard-deleting them", async () => {
    await runScan({ rootPath: tmpRoot }, db);
    await fs.rm(path.join(tmpRoot, "Sample Library", "Drums", "kick.wav"));

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.removedFiles).toBe(1);
    const activeFiles = findAllActiveFiles(db);
    expect(activeFiles.find((f) => f.filename === "kick.wav")).toBeUndefined();

    const raw = db.prepare("SELECT * FROM audio_files WHERE filename = ?").get("kick.wav") as
      | { is_removed: number }
      | undefined;
    expect(raw?.is_removed).toBe(1);
  });
});
