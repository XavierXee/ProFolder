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
    // Different names ("Track A" vs "Track B"), so this qualifies purely on sample
    // overlap clearing the strict thresholds — not via the name-gated relaxation.
    expect(matches[0]!.matchReasons).toEqual(["sampleOverlap"]);
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

  describe("name-gated relaxed match ratio", () => {
    // Helper for building sets of distinct (filename, size) sample signatures. Samples
    // generated with the same prefix+index by two separate calls are identical
    // signatures (used to model "shared" samples between target and candidate);
    // different prefixes/indices never collide.
    function makeSamples(count: number, prefix: string) {
      return Array.from({ length: count }, (_, i) => ({
        relativePath: `${prefix}-${i}.wav`,
        filename: `${prefix}-${i}.wav`,
        size: i,
      }));
    }

    function withName(project: Project, name: string): Project {
      return { ...project, name };
    }

    it("flags a same-named candidate whose ratio falls in the relaxed 0.5-0.6 band (regression case)", () => {
      // 5 shared samples out of 9 unique samples on each side => ratio 5/9 ≈ 0.556 —
      // above the new MIN_MATCH_RATIO_SAME_NAME (0.5) but below the old/global
      // MIN_MATCH_RATIO (0.6). This mirrors the real "Almost Summer Project" bug
      // (24/41 ≈ 0.585 was missed) with smaller representative numbers.
      const shared = makeSamples(5, "shared");
      const target = withName(
        makeProject("Target", "/music/Target", "ableton"),
        "Almost Summer Project"
      );
      const targetSamples9 = [...shared, ...makeSamples(4, "target-only")];
      const candidate = withName(
        makeProject("Candidate", "/music/Candidate", "ableton"),
        "Almost Summer Project"
      );
      const candidateSamples9 = [...shared, ...makeSamples(4, "candidate-only")];

      const matches = findDuplicateMatches(targetSamples9, target, [
        { project: candidate, samples: candidateSamples9 },
      ]);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.matchRatio).toBeCloseTo(5 / 9, 5);
      expect(matches[0]!.matchReasons).toEqual(["sameName"]);
    });

    it("does not flag a same-named candidate once ratio drops below the relaxed 0.5 floor", () => {
      // 4 shared out of 9 unique samples each side => ratio 4/9 ≈ 0.444, below 0.5.
      const shared = makeSamples(4, "shared");
      const target = withName(
        makeProject("Target", "/music/Target", "ableton"),
        "Almost Summer Project"
      );
      const targetSamples9 = [...shared, ...makeSamples(5, "target-only")];
      const candidate = withName(
        makeProject("Candidate", "/music/Candidate", "ableton"),
        "Almost Summer Project"
      );
      const candidateSamples9 = [...shared, ...makeSamples(5, "candidate-only")];

      const matches = findDuplicateMatches(targetSamples9, target, [
        { project: candidate, samples: candidateSamples9 },
      ]);

      expect(matches).toHaveLength(0);
    });

    it("does not relax the absolute MIN_MATCHING_SAMPLES floor for same-named pairs even at ratio 1.0", () => {
      // Only 2 matching samples, both sides otherwise empty => ratio 2/2 = 1.0, but the
      // shared MIN_MATCHING_SAMPLES (3) floor is deliberately NOT relaxed for the
      // same-name path — this proves that's still enforced, not an oversight.
      const shared = makeSamples(2, "shared");
      const target = withName(makeProject("Target", "/music/Target", "ableton"), "Same Name");
      const candidate = withName(makeProject("Candidate", "/music/Candidate", "ableton"), "Same Name");

      const matches = findDuplicateMatches(shared, target, [{ project: candidate, samples: shared }]);

      expect(matches).toHaveLength(0);
    });

    it("does NOT flag the same numeric fixture as the regression case when project names differ (false-positive guard)", () => {
      // Identical sample overlap/ratio (5/9 ≈ 0.556) as the first regression test above,
      // but with different project names — proves the relaxation is genuinely
      // name-gated, not an accidental global lowering of MIN_MATCH_RATIO.
      const shared = makeSamples(5, "shared");
      const target = withName(makeProject("Target", "/music/Target", "ableton"), "Almost Summer Project");
      const targetSamples9 = [...shared, ...makeSamples(4, "target-only")];
      const candidate = withName(makeProject("Candidate", "/music/Candidate", "ableton"), "Totally Different Name");
      const candidateSamples9 = [...shared, ...makeSamples(4, "candidate-only")];

      const matches = findDuplicateMatches(targetSamples9, target, [
        { project: candidate, samples: candidateSamples9 },
      ]);

      expect(matches).toHaveLength(0);
    });

    it("reports both matchReasons when a same-named pair also clears the strict global thresholds", () => {
      // 6 shared out of 9 unique samples each side => ratio 6/9 ≈ 0.667, which clears
      // both MIN_MATCH_RATIO (0.6) and MIN_MATCHING_SAMPLES (3) on its own.
      const shared = makeSamples(6, "shared");
      const target = withName(makeProject("Target", "/music/Target", "ableton"), "Same Name");
      const targetSamples9 = [...shared, ...makeSamples(3, "target-only")];
      const candidate = withName(makeProject("Candidate", "/music/Candidate", "ableton"), "Same Name");
      const candidateSamples9 = [...shared, ...makeSamples(3, "candidate-only")];

      const matches = findDuplicateMatches(targetSamples9, target, [
        { project: candidate, samples: candidateSamples9 },
      ]);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.matchReasons).toEqual(expect.arrayContaining(["sameName", "sampleOverlap"]));
      expect(matches[0]!.matchReasons).toHaveLength(2);
    });

    it("treats names differing only by case and/or surrounding whitespace as the same name", () => {
      const shared = makeSamples(5, "shared");
      const target = withName(makeProject("Target", "/music/Target", "ableton"), "Track Alpha");
      const targetSamples9 = [...shared, ...makeSamples(4, "target-only")];
      const candidate = withName(makeProject("Candidate", "/music/Candidate", "ableton"), "  TRACK alpha  ");
      const candidateSamples9 = [...shared, ...makeSamples(4, "candidate-only")];

      const matches = findDuplicateMatches(targetSamples9, target, [
        { project: candidate, samples: candidateSamples9 },
      ]);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.matchReasons).toEqual(["sameName"]);
    });

    it("does not treat names differing only by punctuation/spacing as the same name (scoped-out fuzzy matching)", () => {
      // Same relaxed-band ratio (5/9 ≈ 0.556) as the regression case, but the names
      // differ only by punctuation ("Almost Summer Project" vs "Almost-Summer-Project")
      // — normalization is exact-match-after-trim+lowercase only, so this must NOT be
      // treated as a name match, and thus must NOT be flagged.
      const shared = makeSamples(5, "shared");
      const target = withName(
        makeProject("Target", "/music/Target", "ableton"),
        "Almost Summer Project"
      );
      const targetSamples9 = [...shared, ...makeSamples(4, "target-only")];
      const candidate = withName(
        makeProject("Candidate", "/music/Candidate", "ableton"),
        "Almost-Summer-Project"
      );
      const candidateSamples9 = [...shared, ...makeSamples(4, "candidate-only")];

      const matches = findDuplicateMatches(targetSamples9, target, [
        { project: candidate, samples: candidateSamples9 },
      ]);

      expect(matches).toHaveLength(0);
    });

    it("does not treat two empty/whitespace-only project names as a name match", () => {
      const shared = makeSamples(5, "shared");
      const target = withName(makeProject("Target", "/music/Target", "ableton"), "");
      const targetSamples9 = [...shared, ...makeSamples(4, "target-only")];
      const candidate = withName(makeProject("Candidate", "/music/Candidate", "ableton"), "   ");
      const candidateSamples9 = [...shared, ...makeSamples(4, "candidate-only")];

      const matches = findDuplicateMatches(targetSamples9, target, [
        { project: candidate, samples: candidateSamples9 },
      ]);

      expect(matches).toHaveLength(0);
    });
  });
});
