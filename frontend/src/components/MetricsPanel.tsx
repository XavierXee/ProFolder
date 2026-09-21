import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { LibraryStats, MetricSpec, MetricsSettings, TagCounts } from "../api/client.js";
import type { EntityStats } from "../types.js";
import { UNKNOWN_STATUS_KEY } from "../types.js";
import { buildStatusOptions } from "../statusStyles.js";
import { useStatusCatalog } from "../contexts/StatusCatalogContext.js";

type Props = {
  stats: LibraryStats | undefined;
  lastScanChanges: number | null;
  allTags: string[];
  onClose: () => void;
};

const EMPTY_ENTITY_STATS: EntityStats = {
  total: 0,
  byStatus: {},
};

const EMPTY_TAG_COUNTS: TagCounts = { files: {}, projects: {} };

function defaultMetrics(): MetricSpec[] {
  return [{ type: "total" }, { type: "status", key: UNKNOWN_STATUS_KEY }];
}

const DEFAULT_METRICS_SETTINGS: MetricsSettings = {
  projectsMetrics: defaultMetrics(),
  filesMetrics: defaultMetrics(),
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Key used to dedupe/compare/remove a spec within a section's array (mirrors the backend's
 * own `dedupKey` in `src/config/metricsSettings.ts`, kept in sync deliberately). */
function specKey(spec: MetricSpec): string {
  if (spec.type === "status") return `status:${spec.key}`;
  if (spec.type === "tag") return `tag:${spec.name}`;
  return "total";
}

function PlusIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function TrashIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 0v12a1 1 0 001 1h6a1 1 0 001-1V7H8z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// Same popover-panel token pattern as TagsStatusesPanel.tsx/ThemeSelector.tsx/MultiSelectDropdown.tsx.
const panelCls = "bg-surface border-border text-ink";
const meta = "text-ink-muted";
const divider = "border-border";
const iconBtnCls =
  "p-1 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-ink-muted hover:text-ink hover:bg-surface-hover flex-shrink-0";
const primaryIconBtnCls =
  "p-1 rounded-[var(--rt-radius)] bg-blue-600 text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed profolder:bg-surface-selected profolder:hover:bg-surface-selected profolder:text-chrome-ink-secondary profolder:border profolder:border-chrome-ink-secondary flex-shrink-0";
const selectCls =
  "flex-1 min-w-0 px-2 py-1 text-xs rounded-[var(--rt-radius)] border border-border bg-canvas text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

const TYPE_LABELS: Record<MetricSpec["type"], string> = {
  total: "Total",
  status: "Status",
  tag: "Tag",
};

type SectionKey = "projectsMetrics" | "filesMetrics";
type StatusOption = { value: string; label: string };

type SectionProps = {
  title: "Projects" | "Audio Files";
  sectionKey: SectionKey;
  entity: EntityStats;
  specs: MetricSpec[];
  statusOptions: StatusOption[];
  allTags: string[];
  tagCountsForSection: Record<string, number> | undefined;
  onPatch: (sectionKey: SectionKey, newSpecs: MetricSpec[]) => Promise<void>;
};

function specLabel(spec: MetricSpec, statusOptions: StatusOption[]): string {
  if (spec.type === "total") return "Total";
  if (spec.type === "tag") return spec.name;
  const found = statusOptions.find((o) => o.value === spec.key);
  // Deliberately-tolerated stale reference (Task 1's design): the status may since have been
  // deleted from the catalog. Fall back to the raw key rather than crashing or showing blank.
  return found ? found.label : spec.key;
}

function specValue(spec: MetricSpec, entity: EntityStats, tagCountsForSection: Record<string, number> | undefined): number {
  if (spec.type === "total") return entity.total;
  if (spec.type === "status") return entity.byStatus[spec.key] ?? 0;
  return tagCountsForSection?.[spec.name] ?? 0;
}

function MetricsSection({ title, sectionKey, entity, specs, statusOptions, allTags, tagCountsForSection, onPatch }: SectionProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<MetricSpec["type"] | "">("");
  const [addValue, setAddValue] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const hasTotal = specs.some((s) => s.type === "total");
  const usedStatusKeys = new Set(specs.filter((s): s is Extract<MetricSpec, { type: "status" }> => s.type === "status").map((s) => s.key));
  const availableStatusOptions = statusOptions.filter((o) => !usedStatusKeys.has(o.value));
  const usedTagNames = new Set(specs.filter((s): s is Extract<MetricSpec, { type: "tag" }> => s.type === "tag").map((s) => s.name));
  const availableTagNames = allTags.filter((t) => !usedTagNames.has(t));

  const availableTypes: MetricSpec["type"][] = [
    ...(!hasTotal ? (["total"] as const) : []),
    ...(availableStatusOptions.length > 0 ? (["status"] as const) : []),
    ...(allTags.length > 0 && availableTagNames.length > 0 ? (["tag"] as const) : []),
  ];

  function valueOptionsFor(type: MetricSpec["type"] | ""): StatusOption[] {
    if (type === "status") return availableStatusOptions;
    if (type === "tag") return availableTagNames.map((t) => ({ value: t, label: t }));
    return [];
  }

  function startAdd() {
    if (availableTypes.length === 0) return;
    const firstType = availableTypes[0];
    setAddOpen(true);
    setAddType(firstType);
    setAddValue(valueOptionsFor(firstType)[0]?.value ?? "");
    setError(undefined);
  }

  function cancelAdd() {
    setAddOpen(false);
    setError(undefined);
  }

  function changeAddType(newType: MetricSpec["type"]) {
    setAddType(newType);
    setAddValue(valueOptionsFor(newType)[0]?.value ?? "");
  }

  async function submitAdd() {
    if (addSaving || !addType) return;
    let newSpec: MetricSpec;
    if (addType === "total") {
      newSpec = { type: "total" };
    } else if (addType === "status") {
      if (!addValue) return;
      newSpec = { type: "status", key: addValue };
    } else {
      if (!addValue) return;
      newSpec = { type: "tag", name: addValue };
    }
    setAddSaving(true);
    setError(undefined);
    try {
      await onPatch(sectionKey, [...specs, newSpec]);
      setAddOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Failed to add metric"));
    } finally {
      setAddSaving(false);
    }
  }

  async function handleRemove(spec: MetricSpec) {
    setError(undefined);
    try {
      await onPatch(
        sectionKey,
        specs.filter((s) => specKey(s) !== specKey(spec))
      );
    } catch (err) {
      setError(errorMessage(err, "Failed to remove metric"));
    }
  }

  return (
    <div className={`border-b ${divider}`}>
      <div className="px-4 pt-3 pb-1">
        <span className={`text-xs font-mono uppercase tracking-wider ${meta}`}>{title}</span>
      </div>

      {specs.length === 0 ? (
        <p className={`text-sm px-4 pb-2 ${meta}`}>No metrics selected.</p>
      ) : (
        <div className="grid grid-cols-2 gap-px p-px max-h-36 overflow-y-auto">
          {specs.map((spec) => {
            const label = specLabel(spec, statusOptions);
            const value = specValue(spec, entity, tagCountsForSection);
            return (
              <div key={specKey(spec)} className="flex flex-col justify-center px-4 py-3">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className={`text-xs font-mono uppercase tracking-wider truncate ${meta}`}>{label}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(spec)}
                    aria-label={`Remove ${label} from ${title} metrics`}
                    className={`${iconBtnCls} p-0.5`}
                  >
                    <TrashIcon className="w-2.5 h-2.5" />
                  </button>
                </div>
                <span className="text-xl font-semibold tabular-nums font-mono text-ink">{value}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="px-4 pb-3">
        {!addOpen ? (
          availableTypes.length > 0 && (
            <button
              type="button"
              onClick={startAdd}
              aria-label={`Add metric to ${title}`}
              className={`py-0.5 px-1 self-start ${iconBtnCls}`}
            >
              <PlusIcon />
            </button>
          )
        ) : (
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex items-center gap-1.5">
              <select
                aria-label={`New ${title} metric type`}
                value={addType}
                onChange={(e) => changeAddType(e.target.value as MetricSpec["type"])}
                className={selectCls}
              >
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              {addType !== "total" && (
                <select
                  aria-label={`New ${title} metric value`}
                  value={addValue}
                  onChange={(e) => setAddValue(e.target.value)}
                  className={selectCls}
                >
                  {valueOptionsFor(addType).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" onClick={cancelAdd} aria-label={`Cancel adding ${title} metric`} className={iconBtnCls}>
                <XIcon />
              </button>
              <button
                type="button"
                onClick={submitAdd}
                disabled={addSaving || (addType !== "total" && !addValue)}
                aria-label={`Confirm adding ${title} metric`}
                className={primaryIconBtnCls}
              >
                <CheckIcon />
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    </div>
  );
}

export default function MetricsPanel({ stats, lastScanChanges, allTags, onClose }: Props) {
  const { statuses: catalogStatuses } = useStatusCatalog();
  const statusOptions = buildStatusOptions(catalogStatuses);
  const panelRef = useRef<HTMLDivElement>(null);

  const [settings, setSettings] = useState<MetricsSettings>(DEFAULT_METRICS_SETTINGS);
  const [tagCounts, setTagCounts] = useState<TagCounts>(EMPTY_TAG_COUNTS);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    api
      .getMetricsSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {
        // Best-effort — keep the optimistic default already in state.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fileTagNames = useMemo(
    () => Array.from(new Set(settings.filesMetrics.filter((s): s is Extract<MetricSpec, { type: "tag" }> => s.type === "tag").map((s) => s.name))),
    [settings.filesMetrics]
  );
  const projectTagNames = useMemo(
    () =>
      Array.from(new Set(settings.projectsMetrics.filter((s): s is Extract<MetricSpec, { type: "tag" }> => s.type === "tag").map((s) => s.name))),
    [settings.projectsMetrics]
  );

  useEffect(() => {
    if (fileTagNames.length === 0 && projectTagNames.length === 0) {
      setTagCounts(EMPTY_TAG_COUNTS);
      return;
    }
    let cancelled = false;
    api
      .getTagCounts(fileTagNames, projectTagNames)
      .then((counts) => {
        if (!cancelled) setTagCounts(counts);
      })
      .catch(() => {
        if (!cancelled) setTagCounts(EMPTY_TAG_COUNTS);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileTagNames.join(" "), projectTagNames.join(" ")]);

  async function patchSection(sectionKey: SectionKey, newSpecs: MetricSpec[]): Promise<void> {
    const response = await api.setMetricsSettings({ [sectionKey]: newSpecs });
    setSettings((prev) => ({ ...prev, [sectionKey]: response[sectionKey] }));
  }

  const projects = stats?.projects ?? EMPTY_ENTITY_STATS;
  const files = stats?.files ?? EMPTY_ENTITY_STATS;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Library metrics"
      className={`absolute right-0 top-full mt-2 w-72 rounded-[var(--rt-radius-lg)] border shadow-2xl z-50 ${panelCls}`}
    >
      <div className={`flex items-center justify-between px-4 py-3 border-b ${divider}`}>
        <span className="text-xs font-mono uppercase tracking-wider">Library Metrics</span>
        <button
          onClick={onClose}
          aria-label="Close metrics panel"
          className="p-1 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-ink-muted hover:text-ink hover:bg-surface-hover"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <MetricsSection
        title="Projects"
        sectionKey="projectsMetrics"
        entity={projects}
        specs={settings.projectsMetrics}
        statusOptions={statusOptions}
        allTags={allTags}
        tagCountsForSection={tagCounts.projects}
        onPatch={patchSection}
      />
      <MetricsSection
        title="Audio Files"
        sectionKey="filesMetrics"
        entity={files}
        specs={settings.filesMetrics}
        statusOptions={statusOptions}
        allTags={allTags}
        tagCountsForSection={tagCounts.files}
        onPatch={patchSection}
      />

      <div className="px-4 py-3">
        <span className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Last Scan</span>
        <p className="text-sm font-mono mt-1 text-ink">
          {lastScanChanges === null ? "No scans yet" : lastScanChanges === 0 ? "No changes" : `+${lastScanChanges} changed`}
        </p>
      </div>
    </div>
  );
}
