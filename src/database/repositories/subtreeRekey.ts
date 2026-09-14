import path from "node:path";
import type Database from "better-sqlite3";
import { findById as findProjectById } from "./projectRepository.js";
import type { DawType } from "../../scanner/dawDetector.js";

/**
 * Move/copy an entire PROJECT FOLDER's subtree — the project itself, every nested
 * sub-project inside it, and every audio file inside any of those — as one atomic
 * DB operation, mirroring `moveFile`/`cloneFile` in `audioFileRepository.ts` (see that
 * file's doc comments for the single-file version of this pattern) but scoped to a
 * whole folder subtree instead of one file.
 *
 * This module is DB-only: it assumes a physical filesystem move/copy of the whole
 * folder has already happened (via a later, composing task using `FileOpsService`).
 * It does not touch the filesystem.
 *
 * ## Two distinct prefixes
 * Every affected row has both an absolute filesystem-path prefix (`projects.path`,
 * `projects.marker_path`, `audio_files.path`, `audio_files.containing_folder`) and a
 * root-relative id prefix (`projects.id`, `audio_files.id`, `audio_files.relative_path`,
 * `audio_files.project_id`). A subtree move/copy changes both prefixes consistently,
 * but they are different strings and each column is rewritten using the prefix that
 * actually applies to it — never conflated.
 *
 * ## Why plain substring matching, not SQL LIKE
 * `id LIKE @prefix || '/%'` is wrong for subtree-prefix matching: `%`/`_` are LIKE
 * wildcards, so a folder literally named e.g. `50%_Off` would silently mismatch/miss
 * sibling folders whose name happens to fit the wildcard pattern. `isSelfOrDescendant`
 * below does a literal, non-wildcard comparison instead.
 *
 * ## Why no file-to-project association recompute is needed after a move
 * A whole-subtree move does not change any audio file's project association, and does
 * not require reaching out to `findNearestAncestorProjectId` (used by the single-file
 * `moveFile`) at all. This follows from how the scanner itself constructs `projects`
 * rows (see `docs/REQUIREMENTS.md` §2.5/§2.6 and `scanner/scanner.ts`'s per-directory
 * loop): a plain (non-DAW) folder nested inside a recognized DAW project is omitted
 * from the `projects` table entirely (no row), and — transitively — a plain folder can
 * only ever have its own row if NONE of its ancestors are a recognized DAW project. A
 * DAW-classified project, meanwhile, is always the nearest ancestor for any file
 * directly inside it (the association walk stops at the first DAW-classified ancestor
 * it finds, which is the project's own directory for a file living right inside it).
 * Combined, these two facts mean: for any audio file inside a moved subtree whose
 * `project_id` is non-null, that project_id is *always* itself part of the same
 * moved subtree (self-or-descendant of the moved project's own id) — it can never
 * point at some outer project the subtree happens to be currently nested inside, nor
 * can moving the subtree ever cause an in-subtree file to newly need association with
 * an outer project. So a subtree move only ever needs to rename `project_id` values by
 * the same prefix substitution used for `id`/`path` — never a fresh nearest-ancestor
 * recompute, and never a `syncProjectFromFiles` call on some OTHER (non-subtree)
 * project, because no other project's own file set is ever added to or removed from by
 * this operation (files outside the subtree aren't touched, and files inside it were
 * never associated with an outer project to begin with).
 *
 * A defensive fallback (leave `project_id` unchanged) is kept below in case that
 * invariant is ever violated by a hand-built row (e.g. in a test fixture) that a real
 * scan would never produce — this avoids ever corrupting an out-of-subtree project's
 * association even if the assumption above somehow doesn't hold for a given row.
 *
 * Note: `projects` rows have no "containing project" column of their own (no
 * parent-project foreign key in the schema — nesting is purely an id/path prefix
 * relationship, not a stored reference), so there is nothing to update on a project's
 * own row when its outer containing project (if any) changes at the new location.
 *
 * One known, accepted edge case (shared with the rest of this move/copy feature's
 * "rekey in place rather than rescan" design, already signed off for Tasks 3-4): if a
 * move/copy relocates a *plain* (non-DAW) project's folder to a destination newly
 * nested inside a DAW-classified project, a fresh scan would fold that plain folder's
 * row away entirely and re-associate its files with the new outer DAW project — this
 * function does not attempt to replicate that reclassification; the plain folder's row
 * and its files' associations are simply rekeyed as-is, and would only reconcile to
 * scanner-produced shape on the next rescan.
 */

type ProjectRow = {
  id: string;
  name: string;
  path: string;
  marker_path: string | null;
  daw_type: DawType | null;
  detected_via: string | null;
  has_video: number;
  has_image: number;
  status: string;
  score: number | null;
  first_seen_at: string;
  last_seen_at: string;
  is_removed: number;
  content_modified_at: string | null;
};

type AudioFileRow = {
  id: string;
  path: string;
  relative_path: string;
  filename: string;
  extension: string;
  size: number;
  created_at: string | null;
  modified_at: string;
  containing_folder: string;
  project_id: string | null;
  status: string;
  score: number | null;
  first_seen_at: string;
  last_seen_at: string;
  is_removed: number;
};

/** Literal (non-LIKE-wildcard) "is this id the prefix itself, or nested under it"
 * check — see the module doc comment for why this must never be expressed via SQL LIKE. */
function isSelfOrDescendant(value: string, prefix: string): boolean {
  return value === prefix || value.startsWith(`${prefix}${path.sep}`);
}

/** Replaces a matched prefix (previously confirmed via `isSelfOrDescendant`) with the
 * new prefix, keeping whatever comes after it (if anything) unchanged. */
function replacePrefix(value: string, oldPrefix: string, newPrefix: string): string {
  if (value === oldPrefix) return newPrefix;
  return newPrefix + value.slice(oldPrefix.length);
}

/** Resolves `newAbsolutePath` against `musicRoot` into the new absolute/relative id
 * prefixes, rejecting a destination that doesn't resolve inside `musicRoot` (same
 * out-of-root guard as `deriveLocationFields` in `audioFileRepository.ts`). */
function deriveNewPrefixes(
  musicRoot: string,
  newAbsolutePath: string
): { newAbsPrefix: string; newRelPrefix: string } {
  const resolvedRoot = path.resolve(musicRoot);
  const newAbsPrefix = path.resolve(newAbsolutePath);
  const newRelPrefix = path.relative(resolvedRoot, newAbsPrefix);
  if (
    newRelPrefix === "" ||
    newRelPrefix === ".." ||
    newRelPrefix.startsWith(`..${path.sep}`) ||
    path.isAbsolute(newRelPrefix)
  ) {
    throw new Error(
      `subtreeRekey: "${newAbsolutePath}" resolves outside musicRoot "${musicRoot}" (or is the root itself)`
    );
  }
  return { newAbsPrefix, newRelPrefix };
}

function loadSubtreeProjects(db: Database.Database, oldRelPrefix: string): ProjectRow[] {
  const rows = db.prepare(`SELECT * FROM projects`).all() as ProjectRow[];
  return rows.filter((row) => isSelfOrDescendant(row.id, oldRelPrefix));
}

function loadSubtreeFiles(db: Database.Database, oldRelPrefix: string): AudioFileRow[] {
  const rows = db.prepare(`SELECT * FROM audio_files`).all() as AudioFileRow[];
  return rows.filter((row) => isSelfOrDescendant(row.id, oldRelPrefix));
}

/** See the module doc comment's "why no recompute" section — always a plain prefix
 * rename when in-subtree, with a defensive no-op fallback otherwise. */
function rekeyProjectId(projectId: string | null, oldRelPrefix: string, newRelPrefix: string): string | null {
  if (projectId == null) return null;
  if (!isSelfOrDescendant(projectId, oldRelPrefix)) return projectId;
  return replacePrefix(projectId, oldRelPrefix, newRelPrefix);
}

/**
 * Rekeys an entire project subtree in place (the project itself, every nested
 * sub-project, and every audio file inside any of those) to reflect a physical folder
 * move that has already happened. `projectId` is the current (pre-move) project id;
 * `newAbsolutePath` is where the project folder now physically lives.
 *
 * Preserves status/tags/score on every affected row — only id/path/relative_path/
 * containing_folder/marker_path/project_id (the location-derived fields) change.
 *
 * `project_tags`/`audio_file_tags` reference `projects.id`/`audio_files.id` with no
 * `ON UPDATE CASCADE`, and this project rekeys `projects.id` before every affected
 * `audio_files.project_id` referencing it has caught up — `PRAGMA defer_foreign_keys =
 * ON` postpones FK checks to COMMIT (mirroring `moveFile`'s use of the same pragma),
 * giving the rest of the transaction a chance to catch up first.
 */
export function moveProjectSubtree(
  db: Database.Database,
  projectId: string,
  newAbsolutePath: string,
  musicRoot: string
): void {
  const project = findProjectById(db, projectId);
  if (!project) {
    throw new Error(`moveProjectSubtree: no project found with id "${projectId}"`);
  }

  const oldRelPrefix = projectId;
  const oldAbsPrefix = project.path;
  const { newAbsPrefix, newRelPrefix } = deriveNewPrefixes(musicRoot, newAbsolutePath);

  const affectedProjects = loadSubtreeProjects(db, oldRelPrefix);
  const affectedFiles = loadSubtreeFiles(db, oldRelPrefix);

  const tx = db.transaction(() => {
    db.pragma("defer_foreign_keys = ON");

    for (const row of affectedProjects) {
      const newId = replacePrefix(row.id, oldRelPrefix, newRelPrefix);
      const newPath = replacePrefix(row.path, oldAbsPrefix, newAbsPrefix);
      const newMarkerPath =
        row.marker_path == null ? null : replacePrefix(row.marker_path, oldAbsPrefix, newAbsPrefix);

      db.prepare(
        `UPDATE projects SET id = @newId, path = @newPath, marker_path = @newMarkerPath WHERE id = @oldId`
      ).run({ newId, newPath, newMarkerPath, oldId: row.id });

      db.prepare(`UPDATE project_tags SET project_id = ? WHERE project_id = ?`).run(newId, row.id);
    }

    for (const row of affectedFiles) {
      const newId = replacePrefix(row.id, oldRelPrefix, newRelPrefix);
      const newPath = replacePrefix(row.path, oldAbsPrefix, newAbsPrefix);
      const newRelativePath = replacePrefix(row.relative_path, oldRelPrefix, newRelPrefix);
      const newContainingFolder = replacePrefix(row.containing_folder, oldAbsPrefix, newAbsPrefix);
      const newProjectId = rekeyProjectId(row.project_id, oldRelPrefix, newRelPrefix);

      db.prepare(
        `UPDATE audio_files SET
          id = @newId, path = @newPath, relative_path = @newRelativePath,
          containing_folder = @newContainingFolder, project_id = @newProjectId
        WHERE id = @oldId`
      ).run({ newId, newPath, newRelativePath, newContainingFolder, newProjectId, oldId: row.id });

      db.prepare(`UPDATE audio_file_tags SET audio_file_id = ? WHERE audio_file_id = ?`).run(newId, row.id);
    }
  });
  tx();
}

/**
 * Clones an entire project subtree (the project itself, every nested sub-project, and
 * every audio file inside any of those) into fresh rows at `newAbsolutePath`, carrying
 * over status/tags/score — the source subtree is left completely untouched. Tag join
 * rows on the clones point at the SAME existing `tags` rows as the source (never
 * duplicating the `tags` table), same as `cloneFile`.
 *
 * Content-derived fields (`size`/`createdAt`/`modifiedAt`/`contentModifiedAt`/
 * `dawType`/`detectedVia`/`hasVideo`/`hasImage`) are carried over from the source,
 * since this function has no filesystem access to re-stat the copy. The clones are
 * brand-new library entities, so `firstSeenAt`/`lastSeenAt` are set to now, not carried
 * over (matching `cloneFile`).
 *
 * Projects are inserted before audio files (and before their own `project_tags`
 * clones), so every foreign key an inserted row needs already exists by the time it's
 * inserted — no `defer_foreign_keys` pragma needed here, unlike `moveProjectSubtree`
 * (which rekeys existing rows in place instead of inserting in dependency order).
 */
export function cloneProjectSubtree(
  db: Database.Database,
  projectId: string,
  newAbsolutePath: string,
  musicRoot: string
): void {
  const project = findProjectById(db, projectId);
  if (!project) {
    throw new Error(`cloneProjectSubtree: no project found with id "${projectId}"`);
  }

  const oldRelPrefix = projectId;
  const oldAbsPrefix = project.path;
  const { newAbsPrefix, newRelPrefix } = deriveNewPrefixes(musicRoot, newAbsolutePath);

  const affectedProjects = loadSubtreeProjects(db, oldRelPrefix);
  const affectedFiles = loadSubtreeFiles(db, oldRelPrefix);
  const nowIso = new Date().toISOString();

  const tx = db.transaction(() => {
    for (const row of affectedProjects) {
      const newId = replacePrefix(row.id, oldRelPrefix, newRelPrefix);
      const newPath = replacePrefix(row.path, oldAbsPrefix, newAbsPrefix);
      const newMarkerPath =
        row.marker_path == null ? null : replacePrefix(row.marker_path, oldAbsPrefix, newAbsPrefix);

      db.prepare(
        `INSERT INTO projects (
          id, name, path, marker_path, daw_type, detected_via, has_video, has_image, status, score,
          first_seen_at, last_seen_at, is_removed, content_modified_at
        ) VALUES (
          @id, @name, @path, @markerPath, @dawType, @detectedVia, @hasVideo, @hasImage, @status, @score,
          @firstSeenAt, @lastSeenAt, 0, @contentModifiedAt
        )`
      ).run({
        id: newId,
        name: row.name,
        path: newPath,
        markerPath: newMarkerPath,
        dawType: row.daw_type,
        detectedVia: row.detected_via,
        hasVideo: row.has_video,
        hasImage: row.has_image,
        status: row.status,
        score: row.score,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        contentModifiedAt: row.content_modified_at,
      });

      const sourceTagRows = db
        .prepare(`SELECT tag_id FROM project_tags WHERE project_id = ?`)
        .all(row.id) as { tag_id: number }[];
      const insertTag = db.prepare(`INSERT INTO project_tags (project_id, tag_id) VALUES (?, ?)`);
      for (const tagRow of sourceTagRows) insertTag.run(newId, tagRow.tag_id);
    }

    for (const row of affectedFiles) {
      const newId = replacePrefix(row.id, oldRelPrefix, newRelPrefix);
      const newPath = replacePrefix(row.path, oldAbsPrefix, newAbsPrefix);
      const newRelativePath = replacePrefix(row.relative_path, oldRelPrefix, newRelPrefix);
      const newContainingFolder = replacePrefix(row.containing_folder, oldAbsPrefix, newAbsPrefix);
      const newProjectId = rekeyProjectId(row.project_id, oldRelPrefix, newRelPrefix);

      db.prepare(
        `INSERT INTO audio_files (
          id, path, relative_path, filename, extension, size, created_at, modified_at,
          containing_folder, project_id, status, score,
          first_seen_at, last_seen_at, is_removed
        ) VALUES (
          @id, @path, @relativePath, @filename, @extension, @size, @createdAt, @modifiedAt,
          @containingFolder, @projectId, @status, @score,
          @firstSeenAt, @lastSeenAt, 0
        )`
      ).run({
        id: newId,
        path: newPath,
        relativePath: newRelativePath,
        filename: row.filename,
        extension: row.extension,
        size: row.size,
        createdAt: row.created_at,
        modifiedAt: row.modified_at,
        containingFolder: newContainingFolder,
        projectId: newProjectId,
        status: row.status,
        score: row.score,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
      });

      const sourceTagRows = db
        .prepare(`SELECT tag_id FROM audio_file_tags WHERE audio_file_id = ?`)
        .all(row.id) as { tag_id: number }[];
      const insertTag = db.prepare(`INSERT INTO audio_file_tags (audio_file_id, tag_id) VALUES (?, ?)`);
      for (const tagRow of sourceTagRows) insertTag.run(newId, tagRow.tag_id);
    }
  });
  tx();
}
