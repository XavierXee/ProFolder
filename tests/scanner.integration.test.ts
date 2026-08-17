import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runScan } from "../src/scanner/scanner.js";
import { runMigrations } from "../src/database/db.js";
import { findAllActive as findAllActiveFiles, updateStatus, setTags } from "../src/database/repositories/audioFileRepository.js";
import { findAllActive as findAllActiveProjects } from "../src/database/repositories/projectRepository.js";
import { setExcludedPaths } from "../src/database/repositories/scanExclusionRepository.js";
import { setScanSettings } from "../src/config/scanSettings.js";

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
    expect(stats.dawProjectsFound).toBe(2);
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

    // Every visited folder is listed, except plain subfolders nested inside a project
    // (Track A/Exports and Track B/Bounce are omitted since their parent is a project):
    // Ableton Projects, Track A, Track B, Sample Library, Sample Library/Drums.
    const projects = findAllActiveProjects(db);
    expect(projects).toHaveLength(5);
    expect(projects.find((p) => p.id === path.join("Ableton Projects", "Track A", "Exports"))).toBeUndefined();
    expect(projects.find((p) => p.id === path.join("Ableton Projects", "Track B", "Bounce"))).toBeUndefined();

    const dawProjects = projects.filter((p) => p.dawType);
    expect(dawProjects).toHaveLength(2);
    expect(dawProjects.every((p) => p.dawType === "ableton")).toBe(true);

    const plainFolder = projects.find((p) => p.id === "Sample Library");
    expect(plainFolder?.dawType).toBeUndefined();
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

  it("skips excluded folders entirely and their contents never appear", async () => {
    setExcludedPaths(db, ["Sample Library"]);

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.audioFilesFound).toBe(2);
    const files = findAllActiveFiles(db);
    expect(files.find((f) => f.filename === "kick.wav")).toBeUndefined();
  });

  it("soft-deletes files that fall under a newly-added exclusion on a rescan", async () => {
    await runScan({ rootPath: tmpRoot }, db);
    expect(findAllActiveFiles(db)).toHaveLength(3);

    setExcludedPaths(db, [path.join("Ableton Projects", "Track B")]);
    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.audioFilesFound).toBe(2);
    expect(stats.removedFiles).toBe(1);
    const activeFiles = findAllActiveFiles(db);
    expect(activeFiles.find((f) => f.filename === "Track B - Draft.wav")).toBeUndefined();
    expect(activeFiles.find((f) => f.filename === "Track A - Final.wav")).toBeDefined();
  });

  it("recognizes a project folder with an Ableton Project Info subfolder but no .als file", async () => {
    await writeFile("Ableton Projects/Track C/Ableton Project Info/Project.cfg", "cfg");
    await writeFile("Ableton Projects/Track C/Bounce/Track C - Bounce.wav", "bounce-audio");

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.dawProjectsFound).toBe(3);
    const files = findAllActiveFiles(db);
    const bounce = files.find((f) => f.filename === "Track C - Bounce.wav");
    expect(bounce?.projectId).toBe(path.join("Ableton Projects", "Track C"));

    const projects = findAllActiveProjects(db);
    const trackC = projects.find((p) => p.id === path.join("Ableton Projects", "Track C"));
    expect(trackC).toBeDefined();
    expect(trackC?.dawType).toBe("ableton");
    expect(trackC?.detectedVia).toBe("Ableton Project Info folder");
    expect(trackC?.markerPath).toBeUndefined();
  });

  it("lists a project folder even when it has no audio files at all", async () => {
    await writeFile("Ableton Projects/Empty Idea/Ableton Project Info/Project.cfg", "cfg");

    await runScan({ rootPath: tmpRoot }, db);

    const projects = findAllActiveProjects(db);
    expect(projects.find((p) => p.id === path.join("Ableton Projects", "Empty Idea"))).toBeDefined();
  });

  it("recognizes multiple DAW types in the same library alongside plain folders", async () => {
    await writeFile("Cubase Projects/My Song/My Song.cpr", "cpr");
    await writeFile("FL Studio Projects/Beat One/Beat One.flp", "flp");
    await writeFile("Notes/todo.txt", "todo");

    await runScan({ rootPath: tmpRoot }, db);

    const projects = findAllActiveProjects(db);
    expect(projects.find((p) => p.id === path.join("Cubase Projects", "My Song"))?.dawType).toBe("cubase");
    expect(projects.find((p) => p.id === path.join("FL Studio Projects", "Beat One"))?.dawType).toBe("flstudio");
    expect(projects.find((p) => p.id === "Notes")?.dawType).toBeUndefined();
  });

  it("excludes plain subfolders nested inside a project from the folder list", async () => {
    await writeFile("Ableton Projects/Track A/Samples/Imported/loop.wav", "loop-audio");

    await runScan({ rootPath: tmpRoot }, db);

    const projects = findAllActiveProjects(db);
    // Track A itself is listed, but nothing beneath it is.
    expect(projects.find((p) => p.id === path.join("Ableton Projects", "Track A"))).toBeDefined();
    expect(projects.find((p) => p.id === path.join("Ableton Projects", "Track A", "Exports"))).toBeUndefined();
    expect(projects.find((p) => p.id === path.join("Ableton Projects", "Track A", "Samples"))).toBeUndefined();
    expect(
      projects.find((p) => p.id === path.join("Ableton Projects", "Track A", "Samples", "Imported"))
    ).toBeUndefined();
    // Folders outside any project are unaffected.
    expect(projects.find((p) => p.id === "Sample Library")).toBeDefined();
  });

  it("flags a project's row as having video/image media even when the file is buried in an unlisted subfolder", async () => {
    await writeFile("Ableton Projects/Track A/Extras/Media/behind-the-scenes.mp4", "video");
    await writeFile("Ableton Projects/Track A/cover.jpg", "image");
    await writeFile("Sample Library/kick.wav", "audio-only");

    await runScan({ rootPath: tmpRoot }, db);

    const projects = findAllActiveProjects(db);
    const trackA = projects.find((p) => p.id === path.join("Ableton Projects", "Track A"))!;
    expect(trackA.hasVideo).toBe(true);
    expect(trackA.hasImage).toBe(true);

    const sampleLibrary = projects.find((p) => p.id === "Sample Library")!;
    expect(sampleLibrary.hasVideo).toBe(false);
    expect(sampleLibrary.hasImage).toBe(false);
  });

  it("still lists a project nested inside another project's folder, not just its subfolders", async () => {
    await writeFile("Ableton Projects/Track A/Nested Cubase/Song.cpr", "cpr");

    await runScan({ rootPath: tmpRoot }, db);

    const projects = findAllActiveProjects(db);
    const nested = projects.find((p) => p.id === path.join("Ableton Projects", "Track A", "Nested Cubase"));
    expect(nested?.dawType).toBe("cubase");
  });

  it("never scans anything inside a project's Backup folder", async () => {
    await writeFile("Ableton Projects/Track A/Backup/Track A [2026-01-01 120000].als", "old-als");
    await writeFile("Ableton Projects/Track A/Backup/old-bounce.wav", "old-bounce-audio");

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.audioFilesFound).toBe(3);
    const files = findAllActiveFiles(db);
    expect(files.find((f) => f.filename === "old-bounce.wav")).toBeUndefined();
  });

  it("scans a Backup folder once excludeBackupFolders is turned off", async () => {
    await writeFile("Ableton Projects/Track A/Backup/old-bounce.wav", "old-bounce-audio");
    setScanSettings(db, { excludeBackupFolders: false });

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.audioFilesFound).toBe(4);
    const files = findAllActiveFiles(db);
    expect(files.find((f) => f.filename === "old-bounce.wav")).toBeDefined();
  });

  it("excludes a project's Samples folder from scanning by default", async () => {
    await writeFile("Ableton Projects/Track A/Samples/kick.wav", "sample-audio");

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.audioFilesFound).toBe(3);
    const files = findAllActiveFiles(db);
    expect(files.find((f) => f.filename === "kick.wav" && f.relativePath.includes("Samples"))).toBeUndefined();
  });

  it("scans a Samples folder once excludeSamplesFolders is turned off", async () => {
    await writeFile("Ableton Projects/Track A/Samples/kick.wav", "sample-audio");
    setScanSettings(db, { excludeSamplesFolders: false });

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.audioFilesFound).toBe(4);
    const files = findAllActiveFiles(db);
    expect(files.find((f) => f.filename === "kick.wav" && f.relativePath.includes("Samples"))).toBeDefined();
  });
});
