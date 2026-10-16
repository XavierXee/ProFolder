import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runScan } from "../src/scanner/scanner.js";
import { runMigrations } from "../src/database/db.js";
import {
  findAllActive as findAllActiveFiles,
  updateStatus,
  setTags,
  setScoreForFiles,
} from "../src/database/repositories/audioFileRepository.js";
import {
  findAllActive as findAllActiveProjects,
  findAllActivePaged as findAllActiveProjectsPaged,
  findById as findProjectById,
  updateStatus as updateProjectStatus,
  setScore as setProjectScore,
  setTags as setProjectTags,
} from "../src/database/repositories/projectRepository.js";
import { setExcludedPaths } from "../src/database/repositories/scanExclusionRepository.js";
import { setScanSettings } from "../src/config/scanSettings.js";
import { getLastScanRun } from "../src/database/repositories/scanRunRepository.js";

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
    expect(finalTrack?.projectId).toBe(path.join("Ableton Projects", "Track A"));

    const draftTrack = files.find((f) => f.filename === "Track B - Draft.wav");
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
    updateStatus(db, finalTrack.id, "done");
    setTags(db, finalTrack.id, ["electronic", "album"]);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeFile("Ableton Projects/Track A/Exports/Track A - Final.wav", "changed-content-longer");

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.modifiedFiles).toBe(1);
    expect(stats.newFiles).toBe(0);

    const updated = findAllActiveFiles(db).find((f) => f.filename === "Track A - Final.wav")!;
    expect(updated.status).toBe("done");
    expect(updated.tags.sort()).toEqual(["album", "electronic"]);
  });

  it("applies a project's existing score and tags to a newly-detected file inside it", async () => {
    await runScan({ rootPath: tmpRoot }, db);
    const trackAId = path.join("Ableton Projects", "Track A");
    setProjectScore(db, trackAId, 4);
    setProjectTags(db, trackAId, ["reviewed"]);

    await writeFile("Ableton Projects/Track A/Exports/Track A - Alt.wav", "alt-audio");
    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.newFiles).toBe(1);
    const altTrack = findAllActiveFiles(db).find((f) => f.filename === "Track A - Alt.wav")!;
    expect(altTrack.score).toBe(4);
    expect(altTrack.tags).toEqual(["reviewed"]);

    // The project itself is untouched by this — inheritance only flows into the new file.
    expect(findProjectById(db, trackAId)!.score).toBe(4);
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

  it("does not re-count an already-removed file as removed again on a subsequent no-op scan (regression)", async () => {
    // 1. Baseline: two files, both new.
    await runScan({ rootPath: tmpRoot }, db);
    let stats = await runScan({ rootPath: tmpRoot }, db);
    expect(stats.newFiles).toBe(0);
    expect(stats.removedFiles).toBe(0);

    // 2. Delete one file, rescan — exactly one file counted as removed.
    await fs.rm(path.join(tmpRoot, "Sample Library", "Drums", "kick.wav"));
    stats = await runScan({ rootPath: tmpRoot }, db);
    expect(stats.removedFiles).toBe(1);

    // 3. Core regression: rescan again with no filesystem changes since the previous
    // scan. The already-removed file must NOT be counted as removed a second time.
    stats = await runScan({ rootPath: tmpRoot }, db);
    expect(stats.removedFiles).toBe(0);

    // 4. Add a new file (no other changes). newFiles reflects the addition, and the
    // still-removed kick.wav must still not be double-counted, so the total change
    // count (newFiles + removedFiles) is exactly 1, not 2.
    await writeFile("Sample Library/Drums/snare.wav", "snare-audio");
    stats = await runScan({ rootPath: tmpRoot }, db);
    expect(stats.newFiles).toBe(1);
    expect(stats.removedFiles).toBe(0);
  });

  it("does not advance an already-removed file's last_seen_at on a subsequent no-op scan (regression)", async () => {
    await runScan({ rootPath: tmpRoot }, db);
    await fs.rm(path.join(tmpRoot, "Sample Library", "Drums", "kick.wav"));
    await runScan({ rootPath: tmpRoot }, db);

    const beforeRow = db
      .prepare("SELECT last_seen_at, is_removed FROM audio_files WHERE filename = ?")
      .get("kick.wav") as { last_seen_at: string; is_removed: number };
    expect(beforeRow.is_removed).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await runScan({ rootPath: tmpRoot }, db);

    const afterRow = db
      .prepare("SELECT last_seen_at, is_removed FROM audio_files WHERE filename = ?")
      .get("kick.wav") as { last_seen_at: string; is_removed: number };
    expect(afterRow.is_removed).toBe(1);
    expect(afterRow.last_seen_at).toBe(beforeRow.last_seen_at);
  });

  it("reactivates a soft-deleted file that reappears after its folder is un-excluded, without crashing, preserving its prior status/tags/score", async () => {
    // Scan 1: file present, active.
    await runScan({ rootPath: tmpRoot }, db);
    const kick = findAllActiveFiles(db).find((f) => f.filename === "kick.wav")!;
    updateStatus(db, kick.id, "released");
    setTags(db, kick.id, ["drums"]);
    setScoreForFiles(db, [kick.id], 5);

    // Scan 2: exclude its folder — the row is soft-deleted (is_removed = 1), stays in the table.
    setExcludedPaths(db, ["Sample Library"]);
    const scan2 = await runScan({ rootPath: tmpRoot }, db);
    expect(scan2.removedFiles).toBe(1);
    expect(findAllActiveFiles(db).find((f) => f.filename === "kick.wav")).toBeUndefined();
    const removedRow = db.prepare("SELECT * FROM audio_files WHERE id = ?").get(kick.id) as {
      is_removed: number;
    };
    expect(removedRow.is_removed).toBe(1);

    // Scan 3: un-exclude — the file reappears. This must not crash with a UNIQUE
    // constraint error, and the reactivated row must keep its own prior
    // status/tags/score rather than reinitializing as a fresh file.
    setExcludedPaths(db, []);
    const scan3 = await runScan({ rootPath: tmpRoot }, db);

    const reactivated = findAllActiveFiles(db).find((f) => f.filename === "kick.wav")!;
    expect(reactivated).toBeDefined();
    expect(reactivated.status).toBe("released");
    expect(reactivated.tags).toEqual(["drums"]);
    expect(reactivated.score).toBe(5);
    expect(scan3.newFiles).toBe(0);
  });

  it("soft-deletes a whole project folder that disappears from disk instead of hard-deleting it, preserving its status/tags/score", async () => {
    await runScan({ rootPath: tmpRoot }, db);
    const trackAId = path.join("Ableton Projects", "Track A");
    updateProjectStatus(db, trackAId, "done");
    setProjectScore(db, trackAId, 4);
    setProjectTags(db, trackAId, ["reviewed"]);

    await fs.rm(path.join(tmpRoot, "Ableton Projects", "Track A"), { recursive: true, force: true });

    await runScan({ rootPath: tmpRoot }, db);

    const activeProjects = findAllActiveProjects(db);
    expect(activeProjects.find((p) => p.id === trackAId)).toBeUndefined();
    // The file that lived inside it disappeared along with the folder, and must be
    // soft-removed too, not left dangling as active.
    expect(findAllActiveFiles(db).find((f) => f.filename === "Track A - Final.wav")).toBeUndefined();

    const raw = db.prepare("SELECT * FROM projects WHERE id = ?").get(trackAId) as { is_removed: number };
    expect(raw.is_removed).toBe(1);

    // findById() is deliberately not filtered by is_removed (see its doc comment), so
    // this is the same kind of raw, unfiltered read as the SQL above — proving status,
    // score and tags all survive the soft-removal untouched.
    const removedProject = findProjectById(db, trackAId)!;
    expect(removedProject.status).toBe("done");
    expect(removedProject.score).toBe(4);
    expect(removedProject.tags).toEqual(["reviewed"]);
  });

  it("does not re-count an already-removed project as removed again, and does not advance its last_seen_at, on a subsequent no-op scan (regression)", async () => {
    // 1. Baseline scan, then delete the whole project folder and rescan — the project
    // is marked removed.
    await runScan({ rootPath: tmpRoot }, db);
    const trackAId = path.join("Ableton Projects", "Track A");
    await fs.rm(path.join(tmpRoot, "Ableton Projects", "Track A"), { recursive: true, force: true });
    await runScan({ rootPath: tmpRoot }, db);

    const beforeRow = db
      .prepare("SELECT last_seen_at, is_removed FROM projects WHERE id = ?")
      .get(trackAId) as { last_seen_at: string; is_removed: number };
    expect(beforeRow.is_removed).toBe(1);

    // 2. Core regression: rescan again with no filesystem changes since the previous
    // scan. loadActiveProjectIds() only ever returns is_removed = 0 rows, so the
    // already-removed project can never be marked removed a second time — proven here
    // by last_seen_at staying frozen at the value the removal scan set, rather than
    // advancing on every scan forever.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await runScan({ rootPath: tmpRoot }, db);

    const afterRow = db
      .prepare("SELECT last_seen_at, is_removed FROM projects WHERE id = ?")
      .get(trackAId) as { last_seen_at: string; is_removed: number };
    expect(afterRow.is_removed).toBe(1);
    expect(afterRow.last_seen_at).toBe(beforeRow.last_seen_at);
  });

  it("reactivates a soft-deleted project whose folder reappears, without crashing, preserving its prior status/tags/score", async () => {
    // Scan 1: project present, active.
    await runScan({ rootPath: tmpRoot }, db);
    const trackAId = path.join("Ableton Projects", "Track A");
    updateProjectStatus(db, trackAId, "done");
    setProjectScore(db, trackAId, 4);
    setProjectTags(db, trackAId, ["reviewed"]);

    // Scan 2: the whole folder disappears — the row is soft-deleted (is_removed = 1),
    // stays in the table.
    await fs.rm(path.join(tmpRoot, "Ableton Projects", "Track A"), { recursive: true, force: true });
    const scan2 = await runScan({ rootPath: tmpRoot }, db);
    expect(findAllActiveProjects(db).find((p) => p.id === trackAId)).toBeUndefined();
    const removedRow = db.prepare("SELECT is_removed FROM projects WHERE id = ?").get(trackAId) as {
      is_removed: number;
    };
    expect(removedRow.is_removed).toBe(1);
    expect(scan2.errors).toEqual([]);

    // Scan 3: the folder (and its DAW marker file) is recreated — the project
    // reappears. This must not crash, and the reactivated row must keep its own
    // prior status/tags/score rather than reinitializing as a fresh project.
    await writeFile("Ableton Projects/Track A/Track A.als", "als-a");
    const scan3 = await runScan({ rootPath: tmpRoot }, db);

    expect(scan3.errors).toEqual([]);
    const reactivated = findAllActiveProjects(db).find((p) => p.id === trackAId);
    expect(reactivated).toBeDefined();
    expect(reactivated?.status).toBe("done");
    expect(reactivated?.tags).toEqual(["reviewed"]);
    expect(reactivated?.score).toBe(4);
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

  it("does not exclude a Stems folder by default, since excludeFolderPatternEnabled starts off", async () => {
    await writeFile("Ableton Projects/Track A/Stems/vocal.wav", "stem-audio");

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.audioFilesFound).toBe(4);
    const files = findAllActiveFiles(db);
    expect(files.find((f) => f.filename === "vocal.wav" && f.relativePath.includes("Stems"))).toBeDefined();
  });

  it("excludes a Stems folder once excludeFolderPatternEnabled is turned on, using the default pattern", async () => {
    await writeFile("Ableton Projects/Track A/Stems/vocal.wav", "stem-audio");
    setScanSettings(db, { excludeFolderPatternEnabled: true });

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.audioFilesFound).toBe(3);
    const files = findAllActiveFiles(db);
    expect(files.find((f) => f.filename === "vocal.wav" && f.relativePath.includes("Stems"))).toBeUndefined();
  });

  it("excludes folders matching a custom excludeFolderPattern", async () => {
    await writeFile("Ableton Projects/Track A/Render Bounces/mix.wav", "bounce-audio");
    setScanSettings(db, { excludeFolderPatternEnabled: true, excludeFolderPattern: "^Render" });

    const stats = await runScan({ rootPath: tmpRoot }, db);

    expect(stats.audioFilesFound).toBe(3);
    const files = findAllActiveFiles(db);
    expect(files.find((f) => f.filename === "mix.wav")).toBeUndefined();
  });

  it("computes content_modified_at from the DAW marker file's mtime when it's newer than the folder's", async () => {
    await runScan({ rootPath: tmpRoot }, db);
    const trackAId = path.join("Ableton Projects", "Track A");

    const alsPath = path.join(tmpRoot, "Ableton Projects", "Track A", "Track A.als");
    const future = new Date(Date.now() + 10 * 60_000);
    await fs.utimes(alsPath, future, future);

    await runScan({ rootPath: tmpRoot }, db);

    const trackA = findProjectById(db, trackAId)!;
    expect(trackA.contentModifiedAt).not.toBeNull();
    expect(new Date(trackA.contentModifiedAt!).getTime()).toBeGreaterThanOrEqual(future.getTime());
  });

  it("sorts projects by content_modified_at, most recently modified first", async () => {
    await runScan({ rootPath: tmpRoot }, db);

    const older = new Date(Date.now() - 10 * 60_000);
    const newer = new Date(Date.now() + 10 * 60_000);
    await fs.utimes(path.join(tmpRoot, "Ableton Projects", "Track A", "Track A.als"), older, older);
    await fs.utimes(path.join(tmpRoot, "Ableton Projects", "Track B", "Track B.als"), newer, newer);

    await runScan({ rootPath: tmpRoot }, db);

    const { items } = findAllActiveProjectsPaged(db, { sortBy: "modifiedAt", sortDir: "desc", limit: 10, offset: 0 });
    const ids = items.map((p) => p.id);
    const trackAIndex = ids.indexOf(path.join("Ableton Projects", "Track A"));
    const trackBIndex = ids.indexOf(path.join("Ableton Projects", "Track B"));
    expect(trackBIndex).toBeLessThan(trackAIndex);
  });
});

describe("scan run persistence", () => {
  it("persists the returned stats end-to-end, retrievable via getLastScanRun", async () => {
    const stats = await runScan({ rootPath: tmpRoot }, db);

    const persisted = getLastScanRun(db);
    expect(persisted).toEqual(stats);
  });

  it("persists rootPath as the resolved absolute path, not a caller-supplied unnormalized string", async () => {
    // path.join() itself collapses ".." segments, so a value built with it would already be
    // clean before runScan ever sees it (and could not catch a regression in the resolve()
    // call this test is meant to exercise). Concatenate the string manually instead, so a
    // genuinely-unnormalized value actually survives to reach runScan's rootPath handling.
    const unnormalized = `${tmpRoot}/Sample Library/..`;

    const stats = await runScan({ rootPath: unnormalized }, db);

    expect(stats.rootPath).toBe(path.resolve(tmpRoot));
    const persisted = getLastScanRun(db);
    expect(persisted?.rootPath).toBe(path.resolve(tmpRoot));
  });

  it("records startedAt/finishedAt as consistent ISO timestamps with durationMs matching their difference", async () => {
    const stats = await runScan({ rootPath: tmpRoot }, db);

    const startedMs = Date.parse(stats.startedAt);
    const finishedMs = Date.parse(stats.finishedAt);
    expect(Number.isNaN(startedMs)).toBe(false);
    expect(Number.isNaN(finishedMs)).toBe(false);
    expect(startedMs).toBeLessThanOrEqual(finishedMs);
    expect(stats.durationMs).toBeGreaterThanOrEqual(0);
    expect(stats.durationMs).toBe(finishedMs - startedMs);

    const persisted = getLastScanRun(db);
    expect(persisted?.durationMs).toBe(stats.durationMs);
  });

  it("returns the most recent scan run from getLastScanRun, not an earlier one", async () => {
    await runScan({ rootPath: tmpRoot }, db);

    await writeFile("Sample Library/Drums/snare.wav", "snare-audio");
    const stats2 = await runScan({ rootPath: tmpRoot }, db);

    expect(stats2.newFiles).toBe(1);
    const persisted = getLastScanRun(db);
    expect(persisted).toEqual(stats2);
  });

  it("records a per-path EACCES error for an unreadable subdirectory while still indexing a sibling file outside it", async () => {
    const restrictedDir = path.join(tmpRoot, "Restricted");
    await writeFile("Restricted/hidden.wav", "hidden-audio");
    await writeFile("Outside/sibling.wav", "sibling-audio");
    await fs.chmod(restrictedDir, 0o000);

    try {
      const stats = await runScan({ rootPath: tmpRoot }, db);

      const restrictedError = stats.errors.find((e) => e.path === restrictedDir);
      expect(restrictedError).toBeDefined();
      expect(restrictedError?.message).toMatch(/EACCES/);

      const files = findAllActiveFiles(db);
      expect(files.find((f) => f.filename === "sibling.wav")).toBeDefined();
      expect(files.find((f) => f.filename === "hidden.wav")).toBeUndefined();

      const persisted = getLastScanRun(db);
      expect(
        persisted?.errors.some((e) => e.path === restrictedDir && /EACCES/.test(e.message))
      ).toBe(true);
    } finally {
      // Must happen before the top-level afterEach's fs.rm — recursive rm on a tree
      // containing a still-chmod-000 directory fails with EACCES itself.
      await fs.chmod(restrictedDir, 0o755);
    }
  });

  // Confirms the root-unreachable guard below is narrowly scoped: a real, walkable
  // root where a file has genuinely been deleted since the last scan must still mark
  // it removed. Already covered by "soft-deletes files that disappear from disk
  // instead of hard-deleting them" in the `runScan` describe block above, which
  // continues to pass with the guard in place since that scenario has foldersScanned > 0.
  it("does not wipe active files/projects when the scan root itself is unreachable (regression)", async () => {
    await runScan({ rootPath: tmpRoot }, db);
    const filesBefore = findAllActiveFiles(db);
    const projectsBefore = findAllActiveProjects(db);
    expect(filesBefore.length).toBeGreaterThan(0);
    expect(projectsBefore.length).toBeGreaterThan(0);

    const missingRoot = path.join(tmpRoot, "does-not-exist");
    const stats = await runScan({ rootPath: missingRoot }, db);

    expect(stats.foldersScanned).toBe(0);
    expect(stats.removedFiles).toBe(0);
    expect(stats.errors.some((e) => e.path === missingRoot)).toBe(true);

    expect(findAllActiveFiles(db)).toHaveLength(filesBefore.length);
    expect(findAllActiveProjects(db)).toHaveLength(projectsBefore.length);

    const rawFiles = db.prepare("SELECT is_removed FROM audio_files").all() as { is_removed: number }[];
    expect(rawFiles.length).toBeGreaterThan(0);
    expect(rawFiles.every((r) => r.is_removed === 0)).toBe(true);

    const rawProjects = db.prepare("SELECT is_removed FROM projects").all() as { is_removed: number }[];
    expect(rawProjects.length).toBeGreaterThan(0);
    expect(rawProjects.every((r) => r.is_removed === 0)).toBe(true);
  });
});
