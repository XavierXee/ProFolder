import fs from "node:fs/promises";
import path from "node:path";
import {
  IGNORED_DIR_NAMES,
  SAMPLES_DIR_NAMES_CASE_INSENSITIVE,
  BACKUP_DIR_NAMES_CASE_INSENSITIVE,
} from "./ignoreRules.js";
import { walkDirectory } from "./walk.js";
import type { Project } from "../models/Project.js";
import type { MatchReason, ProjectDuplicateMatch } from "../models/ProjectDuplicate.js";

export type SampleFileSignature = {
  relativePath: string;
  filename: string;
  size: number;
};

/** Minimum number of matching sample files, and minimum overlap ratio (of the smaller
 * project's sample count), required before two projects are flagged as potential
 * duplicates. Both thresholds guard against false positives from projects that just
 * happen to share a couple of common one-shots. */
const MIN_MATCHING_SAMPLES = 3;

/**
 * Fixed 10-percentage-point relaxation applied to the (now caller-supplied) base match
 * ratio for same-named project pairs — preserves the exact 0.6→0.5 relationship the
 * name-gated relaxation originally shipped with, now that the base threshold is
 * configurable elsewhere in this cycle rather than a hardcoded 0.6. The relaxed
 * threshold is derived as `Math.max(0, minMatchRatio - MIN_MATCH_RATIO_SAME_NAME_OFFSET)`
 * in `findDuplicateMatches` below, so by construction it can never exceed or equal the
 * base threshold — structurally ruling out an "inversion" where same-named pairs would
 * need to clear a *stricter* bar than the general case if a user configures a very low
 * base threshold.
 */
const MIN_MATCH_RATIO_SAME_NAME_OFFSET = 0.1;

const MAX_DEPTH = 8;

/** Only recognized as a sample folder when it's a *direct child of the project root* —
 * unlike "Samples", "Imported" also shows up deep inside Ableton's own bookkeeping
 * (e.g. `Presets/Audio Effects/Max Audio Effect/Imported`, a Max-for-Live device cache
 * that's identical across nearly every project). Matching that recursively would flood
 * duplicate detection with false positives from every project using the same stock
 * devices, so it's only trusted at the top level, where it means actual imported audio. */
const TOP_LEVEL_ONLY_DIR_NAMES_CASE_INSENSITIVE = new Set(["imported"]);

/** Finds every directory recognized as sample content under a project folder: any
 * "Samples" folder (case-insensitive, any depth — covers the standard Ableton
 * `Samples/Imported`, `Samples/Recorded`, etc. layout), plus a top-level "Imported"
 * folder if the project keeps one directly under its root instead. Doesn't descend
 * into Backup folders or into a matched folder once found — its contents are collected
 * separately via `collectSampleFiles`. */
async function findSamplesDirs(rootPath: string, depth = 0): Promise<string[]> {
  if (depth >= MAX_DEPTH) return [];

  let entries;
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || IGNORED_DIR_NAMES.has(entry.name)) continue;
    const lowerName = entry.name.toLowerCase();
    const absolutePath = path.join(rootPath, entry.name);

    if (SAMPLES_DIR_NAMES_CASE_INSENSITIVE.has(lowerName)) {
      found.push(absolutePath);
      continue;
    }
    if (depth === 0 && TOP_LEVEL_ONLY_DIR_NAMES_CASE_INSENSITIVE.has(lowerName)) {
      found.push(absolutePath);
      continue;
    }
    if (BACKUP_DIR_NAMES_CASE_INSENSITIVE.has(lowerName)) continue;

    found.push(...(await findSamplesDirs(absolutePath, depth + 1)));
  }
  return found;
}

/**
 * Collects (filename, size) signatures for every file under a project's Samples
 * folder(s) — regardless of the user's excludeSamplesFolders scan setting, since
 * duplicate detection needs to look inside Samples folders even when the regular
 * library scan skips them.
 */
export async function collectSampleFiles(projectPath: string): Promise<SampleFileSignature[]> {
  const samplesDirs = await findSamplesDirs(projectPath);
  const signatures: SampleFileSignature[] = [];

  for (const samplesDir of samplesDirs) {
    const { files } = await walkDirectory(samplesDir, new Set(), {
      excludeBackupFolders: true,
      excludeSamplesFolders: true,
    });
    for (const file of files) {
      signatures.push({
        relativePath: path.join(path.relative(projectPath, samplesDir), file.relativePath),
        filename: file.filename,
        size: file.stats.size,
      });
    }
  }

  return signatures;
}

function sampleKey(sample: SampleFileSignature): string {
  return `${sample.filename.toLowerCase()}::${sample.size}`;
}

/** Normalizes a project name for exact (not fuzzy) name-match comparisons: trims
 * surrounding whitespace and lowercases. Punctuation/spacing differences (e.g. "Song A"
 * vs "Song A (copy)" or "Almost Summer Project" vs "Almost-Summer-Project") are
 * deliberately NOT treated as equivalent — that's out of scope for this cycle. */
function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase();
}

/** Number of distinct (filename, size) sample signatures — the same dedup key each
 * match's own `sampleCount`/`matchingSampleCount` is computed against in
 * `findDuplicateMatches` below, so a caller reporting a project's own sample count
 * (e.g. the `/duplicates` route's top-level `sampleCount`) stays internally consistent
 * with the match percentages it displays alongside it, rather than reporting a raw,
 * un-deduplicated file count (docs/TODO.md item 19). */
export function countUniqueSamples(samples: SampleFileSignature[]): number {
  return new Set(samples.map(sampleKey)).size;
}

/** True if one path is an ancestor of (or equal to) the other. The `projects` table
 * includes plain container folders alongside real DAW projects, and a container's own
 * Samples search recurses into everything nested beneath it — so a parent folder would
 * otherwise "match" 100% against every project it contains. That's containment, not
 * duplication, so such pairs must never be compared. */
function isNestedPath(a: string, b: string): boolean {
  const rel = path.relative(a, b);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Compares a target project's sample signatures against candidate projects' signatures
 * and returns the ones sharing enough identically named/sized sample files to suggest
 * one project's Samples folder was copied from (or into) the other.
 *
 * Only projects made with the same DAW as the target are ever compared — a plain
 * container folder (no `dawType`) or a project from a different DAW is never a
 * meaningful "duplicate", regardless of sample overlap.
 */
export function findDuplicateMatches(
  targetSamples: SampleFileSignature[],
  targetProject: Project,
  candidates: { project: Project; samples: SampleFileSignature[] }[],
  minMatchRatio: number
): ProjectDuplicateMatch[] {
  if (targetSamples.length === 0 || !targetProject.dawType) return [];
  const targetKeys = new Set(targetSamples.map(sampleKey));
  const sameNameRatio = Math.max(0, minMatchRatio - MIN_MATCH_RATIO_SAME_NAME_OFFSET);

  const matches: ProjectDuplicateMatch[] = [];
  for (const { project, samples } of candidates) {
    if (samples.length === 0) continue;
    if (project.dawType !== targetProject.dawType) continue;
    if (isNestedPath(targetProject.path, project.path) || isNestedPath(project.path, targetProject.path)) continue;
    const candidateKeys = new Set(samples.map(sampleKey));

    let matchingSampleCount = 0;
    for (const key of targetKeys) {
      if (candidateKeys.has(key)) matchingSampleCount++;
    }

    const matchRatio = matchingSampleCount / Math.min(targetKeys.size, candidateKeys.size);

    const sameName =
      normalizeProjectName(targetProject.name) === normalizeProjectName(project.name) &&
      normalizeProjectName(targetProject.name) !== "";
    const qualifiesByOverlap = matchingSampleCount >= MIN_MATCHING_SAMPLES && matchRatio >= minMatchRatio;
    const qualifiesByRelaxedName =
      sameName && matchingSampleCount >= MIN_MATCHING_SAMPLES && matchRatio >= sameNameRatio;

    if (qualifiesByOverlap || qualifiesByRelaxedName) {
      const matchReasons: MatchReason[] = [];
      if (sameName) matchReasons.push("sameName");
      if (qualifiesByOverlap) matchReasons.push("sampleOverlap");

      matches.push({
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        matchingSampleCount,
        sampleCount: candidateKeys.size,
        matchRatio,
        matchReasons,
      });
    }
  }

  matches.sort((a, b) => b.matchRatio - a.matchRatio);
  return matches;
}
