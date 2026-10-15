import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { FolderNode, ProjectDetail, ProjectDuplicatesResult } from "../api/client.js";
import type { Project, TrackStatus } from "../types.js";
import { DAW_LABELS, UNKNOWN_STATUS_KEY } from "../types.js";
import type { CopyMoveDeleteOperation } from "./CopyMoveDeleteDialog.js";
import StatusBadge from "./StatusBadge.js";
import ScoreBadge from "./ScoreBadge.js";
import { ScoreEditor } from "./ScoreEditor.js";
import { TagEditor } from "./TagEditor.js";
import { buildStatusOptions, STATUS_BADGE, STATUS_PILL, STATUS_PILL_UNSELECTED } from "../statusStyles.js";
import { statusPillStyle } from "../statusColor.js";
import { useStatusCatalog } from "../contexts/StatusCatalogContext.js";

function ReadOnlyFolderTreeNode({ node, depth }: { node: FolderNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const isFile = node.type === "file";

  return (
    <div>
      <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: depth * 16 }}>
        {hasChildren ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="w-4 text-xs flex-shrink-0 text-ink-muted hover:text-ink"
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        {/* The file-leaf label was already theme-invariant before this migration (both isDark
            branches resolved to the identical "text-slate-500" literal) — kept as a plain literal
            here rather than switched to a token, to avoid introducing new light-theme variance
            (text-ink-muted's light value is one shade lighter than the byte-faithful slate-500). */}
        <span className={isFile ? "text-xs font-mono text-slate-500" : "text-sm font-medium text-ink"}>
          {node.name}
        </span>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <ReadOnlyFolderTreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  project: (Project & { audioFileCount: number }) | null;
  allTags?: string[];
  onClose: () => void;
  onReveal: (path: string) => void;
  onSaveStatus: (id: string, status: TrackStatus) => Promise<void>;
  onSaveTags: (id: string, tags: string[]) => Promise<void>;
  onSaveScore: (id: string, score: number | null) => Promise<void>;
  onSaveNotes: (id: string, notes: string) => Promise<void>;
  /** Opens the CopyMoveDeleteDialog (owned by the parent, not this panel) for this single
   * project with the given operation. The parent constructs the dialog's `target`/`itemType`
   * (and, for a move, `excludedPath`) from the project this callback is invoked with. */
  onProjectOperation: (operation: CopyMoveDeleteOperation, project: Project & { audioFileCount: number }) => void;
};

export default function ProjectDetailPanel({ project, allTags = [], onClose, onReveal, onSaveStatus, onSaveTags, onSaveScore, onSaveNotes, onProjectOperation }: Props) {
  const { statuses: catalogStatuses } = useStatusCatalog();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [duplicates, setDuplicates] = useState<ProjectDuplicatesResult | null>(null);
  const [status, setStatus] = useState<TrackStatus>("unknown");
  const [statusSaving, setStatusSaving] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagsSaving, setTagsSaving] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [scoreSaving, setScoreSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!project) return;
    setDetail(null);
    setLoading(true);
    setError(undefined);
    setDuplicates(null);
    setStatus(project.status);
    setTags(project.tags);
    setScore(project.score);
    setNotes(project.notes);
    setSavedNotes(project.notes);
    api
      .getProjectDetail(project.id)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load folder details"))
      .finally(() => setLoading(false));
    api.getProjectDuplicates(project.id).then(setDuplicates).catch(() => setDuplicates(null));
    setTimeout(() => closeRef.current?.focus(), 50);
  }, [project?.id]);

  async function handleStatusChange(next: TrackStatus) {
    if (!project || next === status || statusSaving) return;
    const previous = status;
    setStatus(next);
    setStatusSaving(true);
    try {
      await onSaveStatus(project.id, next);
    } catch {
      setStatus(previous);
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleTagsChange(next: string[]) {
    if (!project) return;
    const previous = tags;
    setTags(next);
    setTagsSaving(true);
    try {
      await onSaveTags(project.id, next);
    } catch {
      setTags(previous);
    } finally {
      setTagsSaving(false);
    }
  }

  async function handleScoreChange(next: number | null) {
    if (!project || scoreSaving) return;
    const previous = score;
    setScore(next);
    setScoreSaving(true);
    try {
      await onSaveScore(project.id, next);
    } catch {
      setScore(previous);
    } finally {
      setScoreSaving(false);
    }
  }

  /** Notes save on a short debounce while typing (matching FilterToolbar's search-debounce
   * idiom) plus an immediate flush on blur — see FileDetailPanel.tsx's identical handler for
   * the full rationale (a free-text field can't use the other fields' "only call on a real
   * discrete action" click guard, and debouncing bounds how much typed-but-unsaved text the
   * window-level Escape-to-close handler could otherwise strand). */
  async function commitNotes(value: string, previous: string) {
    if (!project || value === previous || notesSaving) return;
    setNotesSaving(true);
    try {
      await onSaveNotes(project.id, value);
      setSavedNotes(value);
    } catch {
      setNotes(previous);
      setSavedNotes(previous);
    } finally {
      setNotesSaving(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      commitNotes(notes, savedNotes);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  function handleNotesBlur() {
    commitNotes(notes, savedNotes);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && project) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project, onClose]);

  const panel = "bg-surface border-border text-ink";
  const meta = "text-slate-500";
  const divider = "border-border";
  const outlineBtn =
    "px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover";
  const dangerBtn =
    "px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 border-danger-border text-danger hover:bg-danger-surface";
  const inputBg = "bg-canvas border-border text-ink placeholder-ink-muted";
  const typeLabel = project?.dawType ? DAW_LABELS[project.dawType] : "Folder";

  return (
    <>
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-200 ${project ? "opacity-100" : "opacity-0 pointer-events-none"} bg-scrim`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={project ? `Folder detail: ${project.name}` : "Folder detail"}
        // Stays mounted (CSS-slid off-screen) while "closed" so its slide transition can animate
        // — without `inert`, its controls were still real, keyboard-reachable "ghost" Tab stops
        // despite being invisible and unclickable. See FileDetailPanel.tsx's identical comment.
        inert={project ? undefined : ""}
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col transition-transform duration-250 ease-out ${panel} ${project ? "translate-x-0 shadow-2xl" : "translate-x-full"}`}
      >
        {project && (
          <>
            <div className={`flex items-start justify-between gap-4 px-6 py-5 border-b ${divider}`}>
              <div className="min-w-0">
                <p className={`text-xs font-mono mb-1 ${meta}`}>Folder</p>
                <h2 className="text-base font-mono font-medium text-blue-400 truncate">{project.name}</h2>
                <p className={`text-xs font-mono mt-1 break-all ${meta}`}>{project.path}</p>
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                className="mt-0.5 p-1.5 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 text-ink-muted hover:text-ink hover:bg-surface-hover"
                aria-label="Close panel"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <div className="flex items-center gap-3 flex-wrap">
                {/* "No DAW type" reuses STATUS_BADGE's "unknown" slate tokens (same visual family
                    as the original slate literals here) rather than inventing a dedicated neutral
                    badge role. The "has DAW type" case uses the info tokens (Task 4's blue role)
                    with a `/30` opacity modifier for the ring, since no dedicated "info ring" token
                    exists — flagged for Reviewer sign-off, same discipline as other new-role gaps
                    in this task. */}
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium ring-1 ${
                    project.dawType ? "bg-info-surface text-info ring-info/30" : STATUS_BADGE.unknown
                  }`}
                >
                  {typeLabel}
                </span>
                <StatusBadge status={status} />
                <ScoreBadge score={score} />
                <span className={`text-xs font-mono ${meta}`}>{project.audioFileCount} audio files</span>
              </div>

              {project.dawType && (
                <p className={`text-xs font-mono ${meta}`}>Detected via {project.detectedVia ?? "unknown marker"}</p>
              )}

              {duplicates && duplicates.matches.length > 0 && (
                <div className="rounded-[var(--rt-radius-lg)] px-3 py-2.5 ring-1 bg-warning-surface ring-warning-ring">
                  <p className="text-xs font-mono font-medium mb-1.5 text-warning-ink">
                    Possible duplicate of {duplicates.matches.length}{" "}
                    other folder{duplicates.matches.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs mb-2 text-warning-ink-secondary">
                    Based on matching sample files in each project's Samples folder.
                  </p>
                  <div className="space-y-1.5">
                    {duplicates.matches.map((m) => (
                      <div key={m.projectId} className="px-2.5 py-1.5 rounded-[var(--rt-radius)] bg-surface-hover">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-mono truncate text-ink">
                            {m.projectName}
                          </p>
                          {m.matchReasons.includes("sameName") && (
                            <span className="inline-flex items-center flex-shrink-0 px-2 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium ring-1 bg-info-surface text-info ring-info/30">
                              Same name
                            </span>
                          )}
                        </div>
                        <p className={`text-xs font-mono truncate ${meta}`} title={m.projectPath}>
                          {m.projectPath}
                        </p>
                        <p className={`text-xs font-mono ${meta}`}>
                          {m.matchingSampleCount} matching sample{m.matchingSampleCount === 1 ? "" : "s"} (
                          {Math.round(m.matchRatio * 100)}% overlap)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => onReveal(project.path)}
                  className={outlineBtn}
                >
                  Reveal in Finder
                </button>
                <button
                  onClick={() => onProjectOperation("copy", project)}
                  className={outlineBtn}
                >
                  Copy
                </button>
                <button
                  onClick={() => onProjectOperation("move", project)}
                  className={outlineBtn}
                >
                  Move
                </button>
                <button
                  onClick={() => onProjectOperation("delete", project)}
                  className={dangerBtn}
                >
                  Delete
                </button>
              </div>

              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-3 flex items-center gap-2 ${meta}`}>
                  Status
                  {statusSaving && <span className="normal-case tracking-normal">Saving…</span>}
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Select status">
                  {/* Transient fallback for the window before useStatusCatalog()'s mount-time
                      fetch resolves: buildStatusOptions(catalogStatuses) is just [unknown] until
                      then, so the project's real (non-unknown) status would otherwise have no
                      pill showing it selected. Self-corrects once the
                      catalog loads and this status's real pill takes over. Not clickable — it's
                      not a real catalog entry, just a placeholder for "whatever this already
                      is". */}
                  {status !== UNKNOWN_STATUS_KEY && !catalogStatuses.some((s) => s.key === status) && (
                    <button
                      disabled
                      aria-pressed="true"
                      className={`px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-all disabled:cursor-not-allowed ring-1 ${STATUS_PILL.unknown}`}
                    >
                      {status}
                    </button>
                  )}
                  {buildStatusOptions(catalogStatuses).map((opt) => {
                    const selected = status === opt.value;
                    const isUnknown = opt.value === UNKNOWN_STATUS_KEY;
                    const catalogEntry = isUnknown ? undefined : catalogStatuses.find((s) => s.key === opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => handleStatusChange(opt.value)}
                        disabled={statusSaving}
                        aria-pressed={selected}
                        style={selected && catalogEntry ? statusPillStyle(catalogEntry.color) : undefined}
                        className={`px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed ${
                          selected ? (isUnknown ? `ring-1 ${STATUS_PILL.unknown}` : "") : STATUS_PILL_UNSELECTED
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-2 flex items-center gap-2 ${meta}`}>
                  Score
                  {scoreSaving && <span className="normal-case tracking-normal">Saving…</span>}
                </p>
                <ScoreEditor score={score} onChange={handleScoreChange} disabled={scoreSaving} />
              </div>

              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-2 flex items-center gap-2 ${meta}`}>
                  Tags
                  {tagsSaving && <span className="normal-case tracking-normal">Saving…</span>}
                </p>
                <TagEditor tags={tags} onChange={handleTagsChange} allTags={allTags} />
              </div>

              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-2 flex items-center gap-2 ${meta}`}>
                  Notes
                  {notesSaving && <span className="normal-case tracking-normal">Saving…</span>}
                </p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={handleNotesBlur}
                  placeholder="Add notes…"
                  rows={4}
                  aria-label="Notes"
                  className={`w-full border rounded-[var(--rt-radius)] text-sm px-2.5 py-1.5 resize-y focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:border-blue-500/50 transition-colors ${inputBg}`}
                />
              </div>

              <div className={`border-t ${divider}`} />

              {detail && detail.dawProjectFiles.length > 1 && (
                <div>
                  <p className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>
                    DAW Project Files ({detail.dawProjectFiles.length})
                  </p>
                  <div className="space-y-1.5">
                    {detail.dawProjectFiles.map((f) => (
                      <div
                        key={f.path}
                        className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-[var(--rt-radius)] text-xs font-mono bg-surface-hover"
                      >
                        <span className="truncate text-ink" title={f.relativePath}>
                          {f.relativePath}
                        </span>
                        <span className="flex-shrink-0 text-info">{DAW_LABELS[f.dawType]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>Contents</p>
                {loading ? (
                  <p className={`text-sm ${meta}`}>Loading…</p>
                ) : error ? (
                  <p className="text-sm text-red-400">{error}</p>
                ) : detail && detail.subfolderTree.children.length > 0 ? (
                  detail.subfolderTree.children.map((child) => (
                    <ReadOnlyFolderTreeNode key={child.path} node={child} depth={0} />
                  ))
                ) : (
                  <p className={`text-sm ${meta}`}>Empty folder.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
