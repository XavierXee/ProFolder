import path from "node:path";
import type Database from "better-sqlite3";
import { walkDirectory, type WalkEntry } from "./walk.js";
import { isAudioFile, DEFAULT_AUDIO_EXTENSIONS } from "./audioDetector.js";
import { isAbletonProjectFile, findProjectRoot } from "./projectDetector.js";
import { computeExportConfidence } from "./exportClassifier.js";
import type { ScanOptions, ScanStats, ScanError } from "./types.js";
import {
  loadActiveFingerprints,
  insertAudioFile,
  updateAudioFileMetadata,
  touchLastSeen,
  markRemoved as markAudioFilesRemoved,
} from "../database/repositories/audioFileRepository.js";
import {
  loadActiveProjectIds,
  upsertProject,
  markRemoved as markProjectsRemoved,
} from "../database/repositories/projectRepository.js";
import { insertScanRun } from "../database/repositories/scanRunRepository.js";

/** Directories that directly contain a .als file, mapped to the chosen .als path (most recent if several). */
function collectAlsDirs(files: WalkEntry[]): Map<string, { path: string; mtime: Date }> {
  const alsDirs = new Map<string, { path: string; mtime: Date }>();
  for (const file of files) {
    if (!isAbletonProjectFile(file.filename)) continue;
    const dir = path.dirname(file.absolutePath);
    const existing = alsDirs.get(dir);
    if (!existing || file.stats.mtime > existing.mtime) {
      alsDirs.set(dir, { path: file.absolutePath, mtime: file.stats.mtime });
    }
  }
  return alsDirs;
}

export async function runScan(options: ScanOptions, db: Database.Database): Promise<ScanStats> {
  const startedAt = new Date();
  const rootPath = path.resolve(options.rootPath);
  const audioExtensions = options.audioExtensions ?? DEFAULT_AUDIO_EXTENSIONS;

  const { files, foldersScanned, errors } = await walkDirectory(rootPath);
  const audioFiles = files.filter((f) => isAudioFile(f.filename, audioExtensions));
  const alsDirsWithMtime = collectAlsDirs(files);
  const alsDirs = new Map<string, string>(
    [...alsDirsWithMtime.entries()].map(([dir, info]) => [dir, info.path])
  );

  const existingFingerprints = loadActiveFingerprints(db);
  const existingProjectIds = loadActiveProjectIds(db);
  const seenProjectIds = new Set<string>();

  let newFiles = 0;
  let modifiedFiles = 0;
  let likelyExports = 0;
  let likelySamples = 0;
  let unknownConfidence = 0;
  const walkErrors: ScanError[] = [...errors];

  const nowIso = new Date().toISOString();

  const tx = db.transaction(() => {
    for (const file of audioFiles) {
      const id = file.relativePath;
      const association = findProjectRoot(file.absolutePath, rootPath, alsDirs);
      let projectId: string | undefined;

      if (association) {
        projectId = path.relative(rootPath, association.projectPath);
        seenProjectIds.add(projectId);
        upsertProject(db, {
          id: projectId,
          name: path.basename(association.projectPath),
          path: association.projectPath,
          abletonProjectFile: association.abletonProjectFile,
          firstSeenAt: nowIso,
          lastSeenAt: nowIso,
        });
      }

      const { confidence, isExportCandidate } = computeExportConfidence(
        file.relativePath,
        file.filename
      );

      if (isExportCandidate) likelyExports++;
      else if (confidence <= 0.3) likelySamples++;
      else unknownConfidence++;

      const fingerprint = existingFingerprints.get(id);
      const modifiedAtIso = file.stats.mtime.toISOString();

      const record = {
        id,
        path: file.absolutePath,
        relativePath: file.relativePath,
        filename: file.filename,
        extension: path.extname(file.filename).toLowerCase(),
        size: file.stats.size,
        createdAt: file.stats.birthtime.toISOString(),
        modifiedAt: modifiedAtIso,
        containingFolder: path.dirname(file.absolutePath),
        projectId,
        isExportCandidate,
        exportConfidence: confidence,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        isRemoved: false,
      };

      if (!fingerprint) {
        insertAudioFile(db, record);
        newFiles++;
      } else if (fingerprint.size !== file.stats.size || fingerprint.modifiedAt !== modifiedAtIso) {
        updateAudioFileMetadata(db, record);
        modifiedFiles++;
      } else {
        touchLastSeen(db, id, nowIso);
      }
      existingFingerprints.delete(id);
    }

    const removedFileIds = [...existingFingerprints.keys()];
    markAudioFilesRemoved(db, removedFileIds, nowIso);

    const removedProjectIds = [...existingProjectIds].filter((id) => !seenProjectIds.has(id));
    markProjectsRemoved(db, removedProjectIds, nowIso);

    return { removedFileIds };
  });

  const { removedFileIds } = tx();

  const finishedAt = new Date();
  const stats: ScanStats = {
    rootPath,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    foldersScanned,
    audioFilesFound: audioFiles.length,
    abletonProjectsFound: alsDirs.size,
    likelyExports,
    likelySamples,
    unknownConfidence,
    newFiles,
    modifiedFiles,
    removedFiles: removedFileIds.length,
    errors: walkErrors,
  };

  insertScanRun(db, stats);
  return stats;
}
