import type { Project } from "../types.js";
import { DAW_LABELS } from "../types.js";
import StatusBadge from "./StatusBadge.js";
import ScoreBadge from "./ScoreBadge.js";
import { RowCheckbox } from "./RowCheckbox.js";
import { Pagination } from "./Pagination.js";
import type { ProjectFilters } from "../api/client.js";

type ProjectRow = Project & { audioFileCount: number };

type SortKey = NonNullable<ProjectFilters["sortBy"]>;

export function sortIndicator(filters: ProjectFilters, key: SortKey): string {
  if (filters.sortBy !== key) return "";
  return filters.sortDir === "desc" ? " ↓" : " ↑";
}

function SortTh({
  sortKey,
  filters,
  onSortChange,
  label,
  className = "text-left",
}: {
  sortKey: SortKey;
  filters: ProjectFilters;
  onSortChange: (key: SortKey) => void;
  label: string;
  className?: string;
}) {
  const active = filters.sortBy === sortKey;
  return (
    <th scope="col" aria-sort={active ? (filters.sortDir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-3 ${className}`}>
      <button
        onClick={() => onSortChange(sortKey)}
        aria-label={`Sort by ${label}`}
        className="inline-flex items-center gap-1 text-xs font-mono font-medium uppercase tracking-wider text-ink-muted hover:text-ink focus:outline-none focus-visible:underline transition-colors"
      >
        {label}
        {sortIndicator(filters, sortKey)}
      </button>
    </th>
  );
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function ProjectsTable({
  projects,
  total,
  totalPages,
  page,
  pageSize,
  loading,
  selectedId,
  selectedIds,
  filters,
  onPageChange,
  onRowClick,
  onToggleSelect,
  onToggleSelectAll,
  onSortChange,
  playerActive = false,
}: {
  projects: ProjectRow[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  loading: boolean;
  selectedId?: string | null;
  selectedIds: Set<string>;
  filters: ProjectFilters;
  onPageChange: (page: number) => void;
  onRowClick: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onSortChange: (sortBy: SortKey) => void;
  /** Whether the persistent (fixed-to-viewport) audio player bar is currently showing,
   * so the last rows don't end up permanently hidden behind it. */
  playerActive?: boolean;
}) {
  const meta = "text-ink-muted";
  const thBase = "px-4 py-3 text-xs font-mono font-medium uppercase tracking-wider text-ink-muted";
  const staticTh = `${thBase} text-center`;
  const leftTh = `${thBase} text-left`;
  const allSelected = projects.length > 0 && projects.every((p) => selectedIds.has(p.id));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <main className={`flex-1 overflow-auto ${playerActive ? "pb-20" : ""}`} aria-live="polite" aria-label="Project folders">
        <table className="w-full border-collapse table-fixed" aria-label="Project folders">
          <thead className="border-b sticky top-0 z-10 bg-canvas border-divider">
            <tr>
              <th scope="col" className={`${staticTh} w-[4%]`}>
                <RowCheckbox checked={allSelected} onChange={onToggleSelectAll} ariaLabel="Select all visible project folders" />
              </th>
              <SortTh sortKey="name" filters={filters} onSortChange={onSortChange} label="Project Folder" className="text-left w-[24%]" />
              <th scope="col" className={`${staticTh} w-[9%]`}>
                Type
              </th>
              <th scope="col" className={`${staticTh} w-[11%]`}>
                Status
              </th>
              <th scope="col" className={`${leftTh} w-[15%]`}>
                Tags
              </th>
              <SortTh sortKey="score" filters={filters} onSortChange={onSortChange} className="text-center w-[9%]" label="Score" />
              <th scope="col" className={`${staticTh} w-[9%]`}>
                Audio Files
              </th>
              <th scope="col" className={`${staticTh} w-[8%]`}>
                Media
              </th>
              <SortTh sortKey="modifiedAt" filters={filters} onSortChange={onSortChange} className="text-center w-[11%]" label="Modified" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className={`px-6 py-10 text-center text-sm ${meta}`}>
                  Loading project folders…
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={9} className={`px-6 py-10 text-center text-sm ${meta}`}>
                  {total === 0 ? "No folders found yet. Try running a scan." : "No folders match your filters."}
                </td>
              </tr>
            ) : (
              projects.map((project) => {
                const typeLabel = project.dawType ? DAW_LABELS[project.dawType] : "Folder";
                const typeTooltip = project.dawType
                  ? `${typeLabel} — detected via ${project.detectedVia ?? "unknown marker"}`
                  : "Folder — no DAW project detected";
                const isSelected = project.id === selectedId;
                return (
                  <tr
                    key={project.id}
                    onClick={() => onRowClick(project.id)}
                    aria-selected={isSelected}
                    className={`border-b cursor-pointer transition-colors border-border ${
                      isSelected ? "bg-surface-selected" : "bg-surface hover:bg-surface-hover"
                    }`}
                  >
                    <td className="px-4 py-3.5 text-center">
                      <RowCheckbox checked={selectedIds.has(project.id)} onChange={() => onToggleSelect(project.id)} ariaLabel={`Select ${project.name}`} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className={`text-sm truncate font-medium ${isSelected ? "profolder:font-semibold" : ""} text-ink`}>
                            {project.name}
                          </div>
                          <div className={`text-xs font-mono mt-0.5 truncate max-w-xs ${meta}`} title={project.path}>
                            {project.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span
                        title={typeTooltip}
                        className={`text-xs font-mono cursor-default ${project.dawType ? "text-ink" : "text-ink-muted"}`}
                      >
                        {typeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center w-32">
                      <StatusBadge status={project.status} />
                    </td>
                    <td className="px-4 py-3.5 max-w-40">
                      {project.tags.length === 0 ? (
                        <span className="text-xs font-mono text-ink-faint">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {project.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono bg-surface border border-border text-ink-muted"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <ScoreBadge score={project.score} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-sm font-mono tabular-nums text-ink">{project.audioFileCount}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {project.hasVideo && (
                          <svg
                            className="w-4 h-4 text-notice"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-label="Contains video files"
                          >
                            <title>Contains video files</title>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
                            />
                          </svg>
                        )}
                        {project.hasImage && (
                          <svg
                            className="w-4 h-4 text-success"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-label="Contains image files"
                          >
                            <title>Contains image files</title>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                            />
                          </svg>
                        )}
                        {!project.hasVideo && !project.hasImage && <span className="text-xs font-mono text-ink-faint">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {project.contentModifiedAt === null ? (
                        <span className="text-xs font-mono text-ink-faint">—</span>
                      ) : (
                        <span className="text-xs font-mono text-ink-muted">{formatTime(project.contentModifiedAt)}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </main>

      <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={onPageChange} />
    </div>
  );
}
