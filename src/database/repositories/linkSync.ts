import type Database from "better-sqlite3";
import { findById as findProjectById, setScore as setProjectScore, setTags as setProjectTags } from "./projectRepository.js";
import { addTagsToFiles } from "./audioFileRepository.js";

/**
 * Score and tags are kept linked between a project and the audio files it contains:
 *  - Editing a FILE's score/tags recomputes its project's score (max of all the
 *    project's files) and tags (union of all the project's files), from scratch —
 *    so the project always reflects the current state of its files, and a value
 *    that's no longer anyone's max/no longer used by any file naturally drops off.
 *  - Editing a PROJECT's score/tags cascades that value onto every file it contains
 *    (score is overwritten to match; tags are added, not replacing a file's own).
 * These are two distinct one-directional operations — neither calls the other —
 * so there's no risk of them ping-ponging into an infinite loop.
 */

/** Recomputes and writes a project's score (max of its active files' scores, or
 * null if it has none/all are unscored) and tags (union of its active files'
 * tags). Call after any audio file's score or tags change. */
export function syncProjectFromFiles(db: Database.Database, projectId: string): void {
  const scoreRow = db
    .prepare(`SELECT MAX(score) AS maxScore FROM audio_files WHERE project_id = ? AND is_removed = 0`)
    .get(projectId) as { maxScore: number | null };

  const tagRows = db
    .prepare(
      `SELECT DISTINCT t.name AS name
       FROM audio_file_tags aft
       JOIN audio_files af ON af.id = aft.audio_file_id
       JOIN tags t ON t.id = aft.tag_id
       WHERE af.project_id = ? AND af.is_removed = 0`
    )
    .all(projectId) as { name: string }[];

  setProjectScore(db, projectId, scoreRow.maxScore);
  setProjectTags(db, projectId, tagRows.map((r) => r.name));
}

/** Overwrites every active audio file in the project with the project's score. */
export function cascadeProjectScoreToFiles(db: Database.Database, projectId: string, score: number | null): void {
  db.prepare(`UPDATE audio_files SET score = ? WHERE project_id = ? AND is_removed = 0`).run(score, projectId);
}

/** Adds the project's tags onto every active audio file in it (union — a file
 * keeps whatever tags of its own it already had). */
export function cascadeProjectTagsToFiles(db: Database.Database, projectId: string, tagNames: string[]): void {
  const fileIds = db
    .prepare(`SELECT id FROM audio_files WHERE project_id = ? AND is_removed = 0`)
    .all(projectId) as { id: string }[];
  addTagsToFiles(db, fileIds.map((f) => f.id), tagNames);
}

/** Applied when a brand-new audio file is first detected inside a project during a
 * scan: if the project already has a score and/or tags, the new file inherits them
 * immediately rather than starting blank. */
export function applyProjectMetadataToNewFile(db: Database.Database, projectId: string, fileId: string): void {
  const project = findProjectById(db, projectId);
  if (!project) return;

  if (project.score !== null) {
    db.prepare(`UPDATE audio_files SET score = ? WHERE id = ?`).run(project.score, fileId);
  }
  addTagsToFiles(db, [fileId], project.tags);
}
