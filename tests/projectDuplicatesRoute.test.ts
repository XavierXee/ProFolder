import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { upsertProject, markRemoved } from "../src/database/repositories/projectRepository.js";
import { setExcludedPaths } from "../src/database/repositories/scanExclusionRepository.js";
import { createServer } from "../src/api/server.js";
import type { DawType } from "../src/scanner/dawTypes.js";

// Covers docs/TODO.md's "Task 9 follow-ups" item 2: GET /api/projects/:id/duplicates had zero
// HTTP-level test coverage. The underlying pure matching functions (`collectSampleFiles`,
// `findDuplicateMatches`) are already unit-tested in tests/duplicateDetector.test.ts — this
// file specifically exercises the ROUTE: real DB rows via upsertProject/markRemoved/
// setExcludedPaths, real filesystem IO against real temp-dir project folders (the route's
// `collectSampleFiles` walks the actual disk unconditionally, ignoring the
// excludeSamplesFolders scan setting), and the route's own glue logic (404 handling,
// no-dawType short-circuit, same-DAW/exclusion/active-only candidate filtering).

// Same base thresholds as src/scanner/duplicateDetector.ts (module-private there, so
// mirrored here as literals rather than imported): a candidate needs at least 3 matching
// sample files (by lowercased filename + byte size) AND a matchRatio of at least 0.6
// (matchingSampleCount / min(target sample count, candidate sample count)) to be reported.

type SampleSpec = { filename: string; size: number };

/** Writes each sample under `<projectDir>/Samples/<filename>`, with content whose length
 * is exactly `size` bytes — sample matching is keyed on (lowercased filename, byte size),
 * not content, so this is sufficient to control matching precisely. */
function writeSamples(projectDir: string, samples: SampleSpec[]): void {
  const samplesDir = path.join(projectDir, "Samples");
  fs.mkdirSync(samplesDir, { recursive: true });
  for (const s of samples) {
    fs.writeFileSync(path.join(samplesDir, s.filename), "x".repeat(s.size));
  }
}

describe("GET /api/projects/:id/duplicates", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createServer>;
  let root: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    root = fs.mkdtempSync(path.join(os.tmpdir(), "project-duplicates-route-test-"));
    app = createServer(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Seeds a `projects` row. `projectPath` should be a real directory under `root` — the
   * route does live filesystem IO regardless of DB state. `id` doubles as the relative
   * path used by the route's exclusion-prefix check, matching how real project ids work. */
  function seedProject(overrides: { id: string; projectPath: string; dawType?: DawType }): void {
    const now = new Date().toISOString();
    fs.mkdirSync(overrides.projectPath, { recursive: true });
    upsertProject(db, {
      id: overrides.id,
      name: overrides.id,
      path: overrides.projectPath,
      dawType: overrides.dawType,
      hasVideo: false,
      hasImage: false,
      firstSeenAt: now,
      lastSeenAt: now,
      contentModifiedAt: null,
    });
  }

  it("returns 404 for an unknown/nonexistent project id", async () => {
    const res = await request(app).get("/api/projects/does-not-exist/duplicates");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Project not found" });
  });

  it("returns sampleCount 0 and empty matches for a project with no dawType (§10.4: plain folders are never candidate/target)", async () => {
    const targetPath = path.join(root, "Plain Folder");
    seedProject({ id: "Plain Folder", projectPath: targetPath }); // no dawType
    writeSamples(targetPath, [
      { filename: "kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
    ]);
    const candidatePath = path.join(root, "Ableton Track");
    seedProject({ id: "Ableton Track", projectPath: candidatePath, dawType: "ableton" });
    writeSamples(candidatePath, [
      { filename: "kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
    ]);

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Plain Folder")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ projectId: "Plain Folder", sampleCount: 0, matches: [] });
  });

  it("reports a genuine match with all six per-match fields, plus the top-level sampleCount", async () => {
    const targetSamples: SampleSpec[] = [
      { filename: "kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
      { filename: "clap.wav", size: 75 },
      { filename: "perc.wav", size: 60 },
    ];
    const targetPath = path.join(root, "Track A");
    seedProject({ id: "Track A", projectPath: targetPath, dawType: "ableton" });
    writeSamples(targetPath, targetSamples);

    const candidatePath = path.join(root, "Track A Copy");
    seedProject({ id: "Track A Copy", projectPath: candidatePath, dawType: "ableton" });
    writeSamples(candidatePath, targetSamples);

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe("Track A");

    // The top-level `sampleCount` is deduplicated by (lowercased filename, size) — the same
    // key `findDuplicateMatches` uses for its own per-match counts (docs/TODO.md item 19) —
    // via `countUniqueSamples`. No duplicate filename+size pairs in this fixture, so the
    // deduped and raw counts happen to coincide; see the dedicated test below for a fixture
    // that actually distinguishes them.
    expect(res.body.sampleCount).toBe(5);

    expect(res.body.matches).toEqual([
      {
        projectId: "Track A Copy",
        projectName: "Track A Copy",
        projectPath: candidatePath,
        matchingSampleCount: 5,
        sampleCount: 5,
        matchRatio: 1,
      },
    ]);
  });

  it("deduplicates the top-level sampleCount by (filename, size) across multiple Samples subfolders (docs/TODO.md item 19)", async () => {
    const targetPath = path.join(root, "Track Dup");
    seedProject({ id: "Track Dup", projectPath: targetPath, dawType: "ableton" });
    // Same (filename, size) pair written into two distinct "Samples" folders the scanner
    // recognizes independently — a raw file count would see 2 files; the deduped count
    // (matching how `findDuplicateMatches` itself counts) sees 1 unique signature.
    writeSamples(targetPath, [{ filename: "kick.wav", size: 100 }]);
    writeSamples(path.join(targetPath, "Nested"), [{ filename: "kick.wav", size: 100 }]);

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Track Dup")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body.sampleCount).toBe(1);
  });

  it("orders matches descending by matchRatio when multiple candidates qualify", async () => {
    const targetSamples: SampleSpec[] = [
      { filename: "kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
      { filename: "clap.wav", size: 75 },
      { filename: "perc.wav", size: 60 },
    ];
    const targetPath = path.join(root, "Track A");
    seedProject({ id: "Track A", projectPath: targetPath, dawType: "ableton" });
    writeSamples(targetPath, targetSamples);

    // Full match: all 5 shared, none extra -> matchRatio 5/min(5,5) = 1.0
    const highPath = path.join(root, "Track High");
    seedProject({ id: "Track High", projectPath: highPath, dawType: "ableton" });
    writeSamples(highPath, targetSamples);

    // Partial match: shares only the first 3, plus 2 of its own unrelated samples
    // (5 total) -> matchingSampleCount 3, matchRatio 3/min(5,5) = 0.6 (right at threshold).
    const lowPath = path.join(root, "Track Low");
    seedProject({ id: "Track Low", projectPath: lowPath, dawType: "ableton" });
    writeSamples(lowPath, [
      ...targetSamples.slice(0, 3),
      { filename: "unique1.wav", size: 11 },
      { filename: "unique2.wav", size: 22 },
    ]);

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body.matches.map((m: { projectId: string }) => m.projectId)).toEqual(["Track High", "Track Low"]);
    expect(res.body.matches[0].matchRatio).toBe(1);
    expect(res.body.matches[1].matchRatio).toBe(0.6);
  });

  it("excludes a candidate that shares samples but falls below the minimum shared-sample COUNT (2 shared, need 3+)", async () => {
    const targetSamples: SampleSpec[] = [
      { filename: "kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
      { filename: "clap.wav", size: 75 },
      { filename: "perc.wav", size: 60 },
    ];
    const targetPath = path.join(root, "Track A");
    seedProject({ id: "Track A", projectPath: targetPath, dawType: "ableton" });
    writeSamples(targetPath, targetSamples);

    // Only 2 shared, no other samples -> matchRatio would be 2/min(5,2) = 1.0 (well above
    // the ratio threshold), but matchingSampleCount (2) is below MIN_MATCHING_SAMPLES (3).
    const candidatePath = path.join(root, "Track Sparse");
    seedProject({ id: "Track Sparse", projectPath: candidatePath, dawType: "ableton" });
    writeSamples(candidatePath, targetSamples.slice(0, 2));

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body.matches).toEqual([]);
  });

  it("excludes a candidate that meets the minimum count but falls below the minimum match RATIO (3 shared out of 10 = 0.3, need 0.6+)", async () => {
    const targetSamples: SampleSpec[] = Array.from({ length: 10 }, (_, i) => ({
      filename: `sample${i}.wav`,
      size: 10 + i,
    }));
    const targetPath = path.join(root, "Track A");
    seedProject({ id: "Track A", projectPath: targetPath, dawType: "ableton" });
    writeSamples(targetPath, targetSamples);

    // Shares only 3 of the target's 10 samples, plus 7 of its own unrelated ones (10
    // total) -> matchingSampleCount 3 (meets the count minimum) but matchRatio
    // 3/min(10,10) = 0.3, below MIN_MATCH_RATIO (0.6).
    const candidatePath = path.join(root, "Track Diluted");
    seedProject({ id: "Track Diluted", projectPath: candidatePath, dawType: "ableton" });
    writeSamples(candidatePath, [
      ...targetSamples.slice(0, 3),
      ...Array.from({ length: 7 }, (_, i) => ({ filename: `unrelated${i}.wav`, size: 900 + i })),
    ]);

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body.matches).toEqual([]);
  });

  it("excludes a candidate made with a different DAW than the target, even with a full sample match", async () => {
    const targetSamples: SampleSpec[] = [
      { filename: "kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
    ];
    const targetPath = path.join(root, "Track A");
    seedProject({ id: "Track A", projectPath: targetPath, dawType: "ableton" });
    writeSamples(targetPath, targetSamples);

    const candidatePath = path.join(root, "Track B Logic");
    seedProject({ id: "Track B Logic", projectPath: candidatePath, dawType: "logic" });
    writeSamples(candidatePath, targetSamples);

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body.matches).toEqual([]);
  });

  it("excludes a scan-excluded candidate, with a positive control proving the same candidate matches when NOT excluded", async () => {
    // The exclusion filter here is candidate-only, not target-only — confirmed intended by
    // the user (matches the requirement's literal wording): a project that is itself
    // scan-excluded still shows duplicate warnings on its OWN /duplicates panel (that
    // response is computed independently, as target), it just never appears as a
    // candidate/match in some OTHER project's panel. This test only proves the
    // candidate-side behavior; it deliberately doesn't assert anything about querying the
    // excluded project's own /duplicates endpoint as a target.
    const targetSamples: SampleSpec[] = [
      { filename: "kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
    ];
    const targetPath = path.join(root, "Track A");
    seedProject({ id: "Track A", projectPath: targetPath, dawType: "ableton" });
    writeSamples(targetPath, targetSamples);

    const candidatePath = path.join(root, "Track Excluded");
    seedProject({ id: "Track Excluded", projectPath: candidatePath, dawType: "ableton" });
    writeSamples(candidatePath, targetSamples);

    setExcludedPaths(db, ["Track Excluded"]);
    const excludedRes = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}/duplicates`);
    expect(excludedRes.status).toBe(200);
    expect(excludedRes.body.matches).toEqual([]);

    // Positive control: without the exclusion, the same candidate DOES appear — proves
    // the empty result above has real teeth rather than being a coincidence (e.g. a typo
    // in the excluded path, or the candidate never actually matching in the first place).
    setExcludedPaths(db, []);
    const unexcludedRes = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}/duplicates`);
    expect(unexcludedRes.status).toBe(200);
    expect(unexcludedRes.body.matches.map((m: { projectId: string }) => m.projectId)).toEqual(["Track Excluded"]);
  });

  it("excludes a soft-removed candidate (markRemoved)", async () => {
    const targetSamples: SampleSpec[] = [
      { filename: "kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
    ];
    const targetPath = path.join(root, "Track A");
    seedProject({ id: "Track A", projectPath: targetPath, dawType: "ableton" });
    writeSamples(targetPath, targetSamples);

    const candidatePath = path.join(root, "Track Removed");
    seedProject({ id: "Track Removed", projectPath: candidatePath, dawType: "ableton" });
    writeSamples(candidatePath, targetSamples);
    markRemoved(db, ["Track Removed"], new Date().toISOString());

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body.matches).toEqual([]);
  });

  it("never includes the target project itself in its own matches array", async () => {
    const targetSamples: SampleSpec[] = [
      { filename: "kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
    ];
    const targetPath = path.join(root, "Track A");
    seedProject({ id: "Track A", projectPath: targetPath, dawType: "ableton" });
    writeSamples(targetPath, targetSamples);

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body.matches).toEqual([]);
    expect(res.body.matches.some((m: { projectId: string }) => m.projectId === "Track A")).toBe(false);
  });

  it("does not match a same-DAW project nested inside the target's own folder (containment, §10.4)", async () => {
    const sharedSamples: SampleSpec[] = [
      { filename: "kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
    ];
    const parentPath = path.join(root, "Suite");
    seedProject({ id: "Suite", projectPath: parentPath, dawType: "ableton" });
    writeSamples(parentPath, sharedSamples);

    // Nested inside the parent's own folder, with the same DAW and identical sample
    // signatures -- if containment weren't excluded, this would otherwise be a perfect
    // (matchRatio 1.0) match.
    const nestedPath = path.join(parentPath, "Nested Project");
    seedProject({ id: "Suite/Nested Project", projectPath: nestedPath, dawType: "ableton" });
    writeSamples(nestedPath, sharedSamples);

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Suite")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body.matches).toEqual([]);
  });

  it("does not crash (returns a clean 200) when a candidate's DB row points at a folder that no longer exists on disk", async () => {
    const targetSamples: SampleSpec[] = [
      { filename: "kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
    ];
    const targetPath = path.join(root, "Track A");
    seedProject({ id: "Track A", projectPath: targetPath, dawType: "ableton" });
    writeSamples(targetPath, targetSamples);

    // seedProject creates the directory, so remove it again afterward to leave a genuinely
    // dangling DB row (real projects can go stale between a scan and a folder deletion).
    const ghostPath = path.join(root, "Ghost Track");
    seedProject({ id: "Ghost Track", projectPath: ghostPath, dawType: "ableton" });
    fs.rmSync(ghostPath, { recursive: true, force: true });

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body.matches).toEqual([]);
  });

  it("matches sample filenames case-insensitively (docs/COVERAGE.md §10.2b gap: no test used actually-different-case filenames)", async () => {
    const targetPath = path.join(root, "Track A");
    seedProject({ id: "Track A", projectPath: targetPath, dawType: "ableton" });
    writeSamples(targetPath, [
      { filename: "Kick.wav", size: 100 },
      { filename: "snare.wav", size: 200 },
      { filename: "hat.wav", size: 50 },
    ]);

    const candidatePath = path.join(root, "Track A Copy");
    seedProject({ id: "Track A Copy", projectPath: candidatePath, dawType: "ableton" });
    writeSamples(candidatePath, [
      { filename: "kick.wav", size: 100 }, // different case than target's "Kick.wav", same size
      { filename: "SNARE.WAV", size: 200 },
      { filename: "hat.wav", size: 50 },
    ]);

    const res = await request(app).get(`/api/projects/${encodeURIComponent("Track A")}/duplicates`);

    expect(res.status).toBe(200);
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0]).toMatchObject({
      projectId: "Track A Copy",
      matchingSampleCount: 3,
      matchRatio: 1,
    });
  });
});
