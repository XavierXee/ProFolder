import path from "node:path";
import type Database from "better-sqlite3";
import { walkDirectory } from "./walk.js";
import { isAudioFile, DEFAULT_AUDIO_EXTENSIONS } from "./audioDetector.js";
import { findProjectRoot } from "./projectDetector.js";
import { classifyFolders } from "./dawDetector.js";
import { findMediaAncestors } from "./mediaDetector.js";
import type { ScanOptions, ScanStats, ScanError } from "./types.js";
import {
  loadFingerprints,
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
import { getExcludedPaths } from "../database/repositories/scanExclusionRepository.js";
import { applyProjectMetadataToNewFile } from "../database/repositories/linkSync.js";
import { getScanSettings } from "../config/scanSettings.js";

export async function runScan(options: ScanOptions, db: Database.Database): Promise<ScanStats> {
  const startedAt = new Date();
  const rootPath = path.resolve(options.rootPath);
  const audioExtensions = options.audioExtensions ?? DEFAULT_AUDIO_EXTENSIONS;

  const excludedPaths = new Set(getExcludedPaths(db));
  const scanSettings = getScanSettings(db);
  const { files, directories, foldersScanned, errors } = await walkDirectory(rootPath, excludedPaths, scanSettings);
  const audioFiles = files.filter((f) => isAudioFile(f.filename, audioExtensions));

  // Every visited folder gets a row (so the UI can list plain folders alongside DAW
  // projects); the subset actually recognized as a DAW project is used separately to
  // associate audio files with their nearest containing project, and to omit plain
  // subfolders nested inside a project from the folder list.
  const dawClassifications = classifyFolders(files, directories);
  const projectDirsForAssociation = new Map(
    [...dawClassifications.entries()].map(([dir, c]) => [dir, c.markerPath])
  );
  const { hasVideo, hasImage } = findMediaAncestors(files, rootPath);
  const fileByPath = new Map(files.map((f) => [f.absolutePath, f]));

  const existingFingerprints = loadFingerprints(db);
  const existingProjectIds = loadActiveProjectIds(db);

  let newFiles = 0;
  let modifiedFiles = 0;
  const walkErrors: ScanError[] = [...errors];

  const nowIso = new Date().toISOString();

  const tx = db.transaction(() => {
    const seenProjectIds = new Set<string>();

    // Register every visited folder (except the root itself), classified as a DAW
    // project where recognized (including package-style ones like .logicx, which the
    // walker visits like any other directory), otherwise a plain folder. Plain
    // subfolders nested inside a recognized project are omitted entirely — once a
    // folder is a project, its internal structure (Exports/, Samples/, etc.) isn't
    // useful noise in the folder list. A project nested inside another project still
    // gets its own row, since that's a distinct project, not just a subfolder.
    for (const dir of directories) {
      if (dir.relativePath === "") continue;
      const classification = dawClassifications.get(dir.absolutePath);
      if (!classification && findProjectRoot(dir.absolutePath, rootPath, projectDirsForAssociation)) {
        continue;
      }
      seenProjectIds.add(dir.relativePath);

      // "Last worked on" = whichever is more recent: the folder's own mtime (changes
      // when a file is directly added/removed/renamed inside it) or its DAW marker
      // file's mtime (changes on every save in the DAW, e.g. the .als file).
      const markerMtime = classification?.markerPath
        ? fileByPath.get(classification.markerPath)?.stats.mtime
        : undefined;
      const contentModifiedAt = (markerMtime && markerMtime > dir.mtime ? markerMtime : dir.mtime).toISOString();

      upsertProject(db, {
        id: dir.relativePath,
        name: path.basename(dir.absolutePath),
        path: dir.absolutePath,
        markerPath: classification?.markerPath ?? undefined,
        dawType: classification?.dawType,
        detectedVia: classification?.detectedVia,
        hasVideo: hasVideo.has(dir.absolutePath),
        hasImage: hasImage.has(dir.absolutePath),
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        contentModifiedAt,
      });
    }

    for (const file of audioFiles) {
      const id = file.relativePath;
      const association = findProjectRoot(file.absolutePath, rootPath, projectDirsForAssociation);
      const projectId = association ? path.relative(rootPath, association.projectPath) : undefined;

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
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        isRemoved: false,
      };

      if (!fingerprint) {
        insertAudioFile(db, record);
        // A newly-detected file inherits its project's score/tags immediately,
        // rather than starting blank while every sibling file already carries them.
        if (projectId) applyProjectMetadataToNewFile(db, projectId, id);
        newFiles++;
      } else if (fingerprint.isRemoved) {
        // Row already occupies this id/path (soft-removed, not gone) — reactivate it
        // rather than INSERT (which would hit UNIQUE constraint failed). The file keeps
        // its own prior status/tags/score; it is not treated as a fresh file, so no
        // applyProjectMetadataToNewFile here.
        updateAudioFileMetadata(db, record);
        modifiedFiles++;
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
    dawProjectsFound: dawClassifications.size,
    newFiles,
    modifiedFiles,
    removedFiles: removedFileIds.length,
    errors: walkErrors,
  };

  insertScanRun(db, stats);
  return stats;
}
