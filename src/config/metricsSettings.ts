import type Database from "better-sqlite3";
import { getSetting, setSetting } from "../database/repositories/appSettingsRepository.js";
import { UNKNOWN_STATUS_KEY } from "../models/AudioFile.js";

const PROJECTS_METRICS_KEY = "metricsProjects";
const FILES_METRICS_KEY = "metricsFiles";

export type MetricSpec =
  | { type: "total" }
  | { type: "status"; key: string }
  | { type: "tag"; name: string };

export type MetricsSettings = {
  projectsMetrics: MetricSpec[];
  filesMetrics: MetricSpec[];
};

function defaultMetrics(): MetricSpec[] {
  return [{ type: "total" }, { type: "status", key: UNKNOWN_STATUS_KEY }];
}

/** Structural validation shared by the setter (throws) and the getter (falls back to default). */
function isValidMetricSpec(value: unknown): value is MetricSpec {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const spec = value as Record<string, unknown>;
  if (spec.type === "total") return true;
  if (spec.type === "status") return typeof spec.key === "string" && spec.key.length > 0;
  if (spec.type === "tag") return typeof spec.name === "string" && spec.name.length > 0;
  return false;
}

/** Key used to detect exact-duplicate entries within a section's array. */
function dedupKey(spec: MetricSpec): string {
  if (spec.type === "status") return `status:${spec.key}`;
  if (spec.type === "tag") return `tag:${spec.name}`;
  return "total";
}

function dedupeMetrics(specs: MetricSpec[]): MetricSpec[] {
  const seen = new Set<string>();
  const result: MetricSpec[] = [];
  for (const spec of specs) {
    const key = dedupKey(spec);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(spec);
  }
  return result;
}

/** Parses a stored section value, falling back to the default array if the JSON is malformed
 * or any element doesn't match a recognized MetricSpec shape (no partial salvage). */
function readMetricsSection(db: Database.Database, key: string): MetricSpec[] {
  const stored = getSetting(db, key);
  if (stored === undefined) return defaultMetrics();
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isValidMetricSpec)) return defaultMetrics();
    return parsed;
  } catch {
    return defaultMetrics();
  }
}

/** Which metrics are displayed in each of the Metrics panel's two independent sections
 * (Projects, Audio Files), persisted so they're remembered across sessions. */
export function getMetricsSettings(db: Database.Database): MetricsSettings {
  return {
    projectsMetrics: readMetricsSection(db, PROJECTS_METRICS_KEY),
    filesMetrics: readMetricsSection(db, FILES_METRICS_KEY),
  };
}

function validateMetricsArray(value: unknown, fieldName: string): asserts value is MetricSpec[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  for (const entry of value) {
    if (!isValidMetricSpec(entry)) {
      throw new Error(
        `${fieldName} contains an invalid entry: each entry must be { type: "total" }, ` +
          `{ type: "status", key: string }, or { type: "tag", name: string }`
      );
    }
  }
}

export function setMetricsSettings(
  db: Database.Database,
  patch: Partial<MetricsSettings>
): MetricsSettings {
  // Validate every provided section up front so the patch is applied atomically: either the
  // whole patch is structurally valid and gets written, or nothing gets written at all.
  if (patch.projectsMetrics !== undefined) {
    validateMetricsArray(patch.projectsMetrics, "projectsMetrics");
  }
  if (patch.filesMetrics !== undefined) {
    validateMetricsArray(patch.filesMetrics, "filesMetrics");
  }
  if (patch.projectsMetrics !== undefined) {
    setSetting(db, PROJECTS_METRICS_KEY, JSON.stringify(dedupeMetrics(patch.projectsMetrics)));
  }
  if (patch.filesMetrics !== undefined) {
    setSetting(db, FILES_METRICS_KEY, JSON.stringify(dedupeMetrics(patch.filesMetrics)));
  }
  return getMetricsSettings(db);
}
