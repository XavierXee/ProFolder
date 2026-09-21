import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import {
  getMetricsSettings,
  setMetricsSettings,
  type MetricSpec,
} from "../src/config/metricsSettings.js";
import { setSetting } from "../src/database/repositories/appSettingsRepository.js";
import { UNKNOWN_STATUS_KEY } from "../src/models/AudioFile.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

const DEFAULT_METRICS: MetricSpec[] = [{ type: "total" }, { type: "status", key: UNKNOWN_STATUS_KEY }];

describe("metricsSettings", () => {
  it("defaults both sections to [total, status:unknown] when nothing has been saved", () => {
    expect(getMetricsSettings(db)).toEqual({
      projectsMetrics: DEFAULT_METRICS,
      filesMetrics: DEFAULT_METRICS,
    });
  });

  it("default status entry genuinely uses UNKNOWN_STATUS_KEY, not a hardcoded literal", () => {
    const { projectsMetrics, filesMetrics } = getMetricsSettings(db);
    expect(projectsMetrics[1]).toEqual({ type: "status", key: UNKNOWN_STATUS_KEY });
    expect(filesMetrics[1]).toEqual({ type: "status", key: UNKNOWN_STATUS_KEY });
  });

  it("persists a partial update to projectsMetrics and leaves filesMetrics untouched", () => {
    setMetricsSettings(db, { projectsMetrics: [{ type: "total" }] });

    expect(getMetricsSettings(db)).toEqual({
      projectsMetrics: [{ type: "total" }],
      filesMetrics: DEFAULT_METRICS,
    });
  });

  it("persists a partial update to filesMetrics and leaves projectsMetrics untouched", () => {
    setMetricsSettings(db, { filesMetrics: [{ type: "tag", name: "mastered" }] });

    expect(getMetricsSettings(db)).toEqual({
      projectsMetrics: DEFAULT_METRICS,
      filesMetrics: [{ type: "tag", name: "mastered" }],
    });
  });

  it("round-trips a non-default array of mixed metric specs", () => {
    const custom: MetricSpec[] = [
      { type: "total" },
      { type: "status", key: "mixed" },
      { type: "tag", name: "vocal-chain" },
    ];
    setMetricsSettings(db, { projectsMetrics: custom, filesMetrics: custom });

    expect(getMetricsSettings(db)).toEqual({
      projectsMetrics: custom,
      filesMetrics: custom,
    });
  });

  it("falls back to the default when the stored value is malformed JSON", () => {
    setSetting(db, "metricsProjects", "{not valid json");

    expect(getMetricsSettings(db).projectsMetrics).toEqual(DEFAULT_METRICS);
  });

  it("falls back to the default when the stored value is valid JSON but not an array", () => {
    setSetting(db, "metricsFiles", JSON.stringify({ type: "total" }));

    expect(getMetricsSettings(db).filesMetrics).toEqual(DEFAULT_METRICS);
  });

  it("falls back to the default when the stored array contains an entry with an unrecognized type", () => {
    setSetting(db, "metricsProjects", JSON.stringify([{ type: "total" }, { type: "bogus" }]));

    expect(getMetricsSettings(db).projectsMetrics).toEqual(DEFAULT_METRICS);
  });

  it("throws a descriptive error when the patch value is not an array", () => {
    expect(() =>
      setMetricsSettings(db, { projectsMetrics: { type: "total" } as unknown as never })
    ).toThrow(/must be an array/i);
  });

  it("throws a descriptive error for an entry with an unrecognized type", () => {
    expect(() =>
      setMetricsSettings(db, { projectsMetrics: [{ type: "bogus" } as unknown as never] })
    ).toThrow(/invalid entry/i);
  });

  it("throws a descriptive error for a status entry missing key", () => {
    expect(() =>
      setMetricsSettings(db, { projectsMetrics: [{ type: "status" } as unknown as never] })
    ).toThrow(/invalid entry/i);
  });

  it("throws a descriptive error for a tag entry missing name", () => {
    expect(() =>
      setMetricsSettings(db, { filesMetrics: [{ type: "tag" } as unknown as never] })
    ).toThrow(/invalid entry/i);
  });

  it("does not persist a section when it fails validation, leaving the prior stored value intact", () => {
    setMetricsSettings(db, { projectsMetrics: [{ type: "total" }] });

    expect(() =>
      setMetricsSettings(db, { projectsMetrics: [{ type: "bogus" } as unknown as never] })
    ).toThrow();

    expect(getMetricsSettings(db).projectsMetrics).toEqual([{ type: "total" }]);
  });

  it("silently de-duplicates exact-duplicate entries, keeping the first occurrence", () => {
    const result = setMetricsSettings(db, {
      projectsMetrics: [{ type: "total" }, { type: "total" }],
    });

    expect(result.projectsMetrics).toEqual([{ type: "total" }]);
    expect(getMetricsSettings(db).projectsMetrics).toEqual([{ type: "total" }]);
  });

  it("de-duplicates status/tag entries by their key/name, not just by type", () => {
    const result = setMetricsSettings(db, {
      filesMetrics: [
        { type: "status", key: "mixed" },
        { type: "status", key: "mixed" },
        { type: "status", key: "mastered" },
        { type: "tag", name: "vocal" },
        { type: "tag", name: "vocal" },
      ],
    });

    expect(result.filesMetrics).toEqual([
      { type: "status", key: "mixed" },
      { type: "status", key: "mastered" },
      { type: "tag", name: "vocal" },
    ]);
  });

  it("atomically rejects a multi-section patch: valid projectsMetrics + invalid filesMetrics leaves projectsMetrics unchanged", () => {
    expect(() =>
      setMetricsSettings(db, {
        projectsMetrics: [{ type: "total" }],
        filesMetrics: [{ type: "bogus" } as unknown as never],
      })
    ).toThrow();

    // projectsMetrics was valid on its own, but since the overall patch failed, it must not
    // have been persisted — the section should still be at its untouched default.
    expect(getMetricsSettings(db)).toEqual({
      projectsMetrics: DEFAULT_METRICS,
      filesMetrics: DEFAULT_METRICS,
    });
  });

  it("atomically rejects a multi-section patch: invalid projectsMetrics + valid filesMetrics leaves filesMetrics unchanged (order shouldn't matter)", () => {
    expect(() =>
      setMetricsSettings(db, {
        projectsMetrics: [{ type: "bogus" } as unknown as never],
        filesMetrics: [{ type: "tag", name: "mastered" }],
      })
    ).toThrow();

    // filesMetrics was valid on its own, but since the overall patch failed, it must not
    // have been persisted — the section should still be at its untouched default.
    expect(getMetricsSettings(db)).toEqual({
      projectsMetrics: DEFAULT_METRICS,
      filesMetrics: DEFAULT_METRICS,
    });
  });

  it("tolerates status/tag entries referencing catalog values that don't (or no longer) exist", () => {
    const result = setMetricsSettings(db, {
      projectsMetrics: [
        { type: "status", key: "no-such-status" },
        { type: "tag", name: "no-such-tag" },
      ],
    });

    expect(result.projectsMetrics).toEqual([
      { type: "status", key: "no-such-status" },
      { type: "tag", name: "no-such-tag" },
    ]);
  });
});
