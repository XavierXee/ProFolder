import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectSampleFiles, findDuplicateMatches } from "../src/scanner/duplicateDetector.js";
import type { Project } from "../src/models/Project.js";
import type { DawType } from "../src/scanner/dawTypes.js";

let tmpRoot: string;

async function writeFile(relPath: string, content = ""): Promise<void> {
  const absPath = path.join(tmpRoot, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content);
}

function makeProject(id: string, projectPath: string, dawType: DawType | undefined): Project {
  return {
    id,
    name: id,
    path: projectPath,
    dawType,
    hasVideo: false,
    hasImage: false,
    status: "unknown",
    tags: [],
    score: null,
    firstSeenAt: "2026-01-01",
    lastSeenAt: "2026-01-01",
    isRemoved: false,
    contentModifiedAt: null,
  };
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "duplicate-detector-test-"));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("collectSampleFiles", () => {
  it("collects files under a top-level Samples folder, matched case-insensitively", async () => {
    await writeFile("Track A/Track A.als", "als");
    await writeFile("Track A/samples/kick.wav", "kick-audio");
    await writeFile("Track A/samples/Imported/snare.wav", "snare-audio");

    const projectPath = path.join(tmpRoot, "Track A");
    const signatures = await collectSampleFiles(projectPath);

    expect(signatures).toHaveLength(2);
    expect(signatures.map((s) => s.filename).sort()).toEqual(["kick.wav", "snare.wav"]);
  });

  it("ignores files outside any Samples folder", async () => {
    await writeFile("Track A/Track A.als", "als");
    await writeFile("Track A/Exports/final.wav", "final-audio");

    const signatures = await collectSampleFiles(path.join(tmpRoot, "Track A"));
    expect(signatures).toHaveLength(0);
  });

  it("does not descend into a Backup folder while searching for Samples", async () => {
    await writeFile("Track A/Backup/samples/ghost.wav", "ghost-audio");

    const signatures = await collectSampleFiles(path.join(tmpRoot, "Track A"));
    expect(signatures).toHaveLength(0);
  });

  it("collects files under a top-level Imported folder", async () => {
    await writeFile("Track A/Track A.als", "als");
    await writeFile("Track A/Imported/vocal-chop.wav", "vocal-audio");

    const signatures = await collectSampleFiles(path.join(tmpRoot, "Track A"));
    expect(signatures.map((s) => s.filename)).toEqual(["vocal-chop.wav"]);
  });

  it("does not treat a nested Imported folder outside of Samples as sample content", async () => {
    // Ableton itself creates folders named "Imported" deep inside its own bookkeeping
    // (e.g. a Max-for-Live device cache under Presets/), identical across nearly every
    // project — only a top-level "Imported" (or anything under a Samples folder) counts.
    await writeFile(
      "Track A/Presets/Audio Effects/Max Audio Effect/Imported/device-cache.amxd",
      "shared-device-cache"
    );

    const signatures = await collectSampleFiles(path.join(tmpRoot, "Track A"));
    expect(signatures).toHaveLength(0);
  });
});

describe("findDuplicateMatches", () => {
  const targetProject = makeProject("Track A", "/music/Track A", "ableton");
  const targetSamples = [
    { relativePath: "kick.wav", filename: "kick.wav", size: 100 },
    { relativePath: "snare.wav", filename: "snare.wav", size: 200 },
    { relativePath: "hat.wav", filename: "hat.wav", size: 50 },
  ];

  it("flags a candidate sharing enough identically named/sized sample files", () => {
    const candidateProject = makeProject("Track B", "/music/Track B", "ableton");
    const matches = findDuplicateMatches(targetSamples, targetProject, [
      {
        project: candidateProject,
        samples: [
          { relativePath: "kick.wav", filename: "kick.wav", size: 100 },
          { relativePath: "snare.wav", filename: "snare.wav", size: 200 },
          { relativePath: "hat.wav", filename: "hat.wav", size: 50 },
          { relativePath: "extra.wav", filename: "extra.wav", size: 999 },
        ],
      },
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ projectId: "Track B", matchingSampleCount: 3, sampleCount: 4 });
    expect(matches[0]!.matchRatio).toBeCloseTo(1, 5);
  });

  it("does not flag a candidate with too few matching files", () => {
    const matches = findDuplicateMatches(targetSamples, targetProject, [
      {
        project: makeProject("Track C", "/music/Track C", "ableton"),
        samples: [{ relativePath: "kick.wav", filename: "kick.wav", size: 100 }],
      },
    ]);

    expect(matches).toHaveLength(0);
  });

  it("does not flag a candidate below the match-ratio threshold despite enough absolute matches", () => {
    const largeTargetSamples = Array.from({ length: 10 }, (_, i) => ({
      relativePath: `sample-${i}.wav`,
      filename: `sample-${i}.wav`,
      size: i,
    }));
    const candidateUniqueSamples = Array.from({ length: 7 }, (_, i) => ({
      relativePath: `other-${i}.wav`,
      filename: `other-${i}.wav`,
      size: 1000 + i,
    }));

    const matches = findDuplicateMatches(largeTargetSamples, targetProject, [
      {
        // Shares only 3 of the target's 10 samples, plus 7 of its own — matchCount (3)
        // clears MIN_MATCHING_SAMPLES, but ratio (3/10) falls below MIN_MATCH_RATIO.
        project: makeProject("Track D", "/music/Track D", "ableton"),
        samples: [...largeTargetSamples.slice(0, 3), ...candidateUniqueSamples],
      },
    ]);

    expect(matches).toHaveLength(0);
  });

  it("treats files with the same name but different size as distinct", () => {
    const matches = findDuplicateMatches(targetSamples, targetProject, [
      {
        project: makeProject("Track E", "/music/Track E", "ableton"),
        samples: [
          { relativePath: "kick.wav", filename: "kick.wav", size: 999 },
          { relativePath: "snare.wav", filename: "snare.wav", size: 999 },
          { relativePath: "hat.wav", filename: "hat.wav", size: 999 },
        ],
      },
    ]);

    expect(matches).toHaveLength(0);
  });

  it("returns no matches when the target project has no sample files", () => {
    const matches = findDuplicateMatches([], targetProject, [
      { project: makeProject("Track F", "/music/Track F", "ableton"), samples: targetSamples },
    ]);

    expect(matches).toHaveLength(0);
  });

  it("sorts matches by descending match ratio", () => {
    // Needs more than 3 target samples so a partial (but still qualifying) match
    // is distinguishable in ratio from an exact match.
    const fiveSamples = [
      ...targetSamples,
      { relativePath: "clap.wav", filename: "clap.wav", size: 60 },
      { relativePath: "tom.wav", filename: "tom.wav", size: 70 },
    ];

    const matches = findDuplicateMatches(fiveSamples, targetProject, [
      {
        // Matches 4 of its own 5 samples against the target's 5 (ratio 0.8) —
        // still above MIN_MATCH_RATIO, but lower than an exact match.
        project: makeProject("Partial", "/music/Partial", "ableton"),
        samples: [...fiveSamples.slice(0, 4), { relativePath: "own.wav", filename: "own.wav", size: 999 }],
      },
      {
        // Matches all 5 (ratio 1.0).
        project: makeProject("Exact", "/music/Exact", "ableton"),
        samples: fiveSamples,
      },
    ]);

    expect(matches.map((m) => m.projectId)).toEqual(["Exact", "Partial"]);
  });

  it("excludes a candidate whose folder is an ancestor or descendant of the target", () => {
    const nestedTarget = makeProject("Track A", "/music/Parent/Track A", "ableton");
    const parentMatches = findDuplicateMatches(targetSamples, nestedTarget, [
      {
        // A container folder recursively "contains" all of the target's samples —
        // that's containment, not duplication, and must not be flagged.
        project: makeProject("Parent", "/music/Parent", "ableton"),
        samples: targetSamples,
      },
    ]);
    expect(parentMatches).toHaveLength(0);

    const childMatches = findDuplicateMatches(targetSamples, targetProject, [
      {
        project: makeProject("Track A/Sub Project", "/music/Track A/Sub Project", "ableton"),
        samples: targetSamples,
      },
    ]);
    expect(childMatches).toHaveLength(0);
  });

  it("excludes a candidate made with a different DAW", () => {
    const matches = findDuplicateMatches(targetSamples, targetProject, [
      {
        project: makeProject("Track G", "/music/Track G", "flstudio"),
        samples: targetSamples,
      },
    ]);

    expect(matches).toHaveLength(0);
  });

  it("returns no matches when the target has no DAW type (a plain container folder)", () => {
    const plainFolder = makeProject("Folder", "/music/Folder", undefined);
    const matches = findDuplicateMatches(targetSamples, plainFolder, [
      {
        project: makeProject("Track H", "/music/Track H", undefined),
        samples: targetSamples,
      },
    ]);

    expect(matches).toHaveLength(0);
  });
});
