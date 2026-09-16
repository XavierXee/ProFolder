import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { FolderNode, ProjectDetail, ProjectDuplicatesResult } from "../api/client.js";
import type { Project, TrackStatus } from "../types.js";
import { DAW_LABELS } from "../types.js";
import type { CopyMoveDeleteOperation } from "./CopyMoveDeleteDialog.js";
import StatusBadge from "./StatusBadge.js";
import ScoreBadge from "./ScoreBadge.js";
import { ScoreEditor } from "./ScoreEditor.js";
import { TagEditor } from "./TagEditor.js";
import { ALL_STATUSES, STATUS_LABELS, STATUS_PILL_DARK, STATUS_PILL_LIGHT, STATUS_PILL_UNSELECTED_DARK, STATUS_PILL_UNSELECTED_LIGHT } from "../statusStyles.js";

function ReadOnlyFolderTreeNode({ node, isDark, depth }: { node: FolderNode; isDark: boolean; depth: number }) {
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
            className={`w-4 text-xs flex-shrink-0 ${isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-700"}`}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <span
          className={
            isFile
              ? `text-xs font-mono ${isDark ? "text-slate-500" : "text-slate-500"}`
              : `text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`
          }
        >
          {node.name}
        </span>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <ReadOnlyFolderTreeNode key={child.path} node={child} isDark={isDark} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  project: (Project & { audioFileCount: number }) | null;
  isDark: boolean;
  allTags?: string[];
  onClose: () => void;
  onReveal: (path: string) => void;
  onSaveStatus: (id: string, status: TrackStatus) => Promise<void>;
  onSaveTags: (id: string, tags: string[]) => Promise<void>;
  onSaveScore: (id: string, score: number | null) => Promise<void>;
  /** Opens the CopyMoveDeleteDialog (owned by the parent, not this panel) for this single
   * project with the given operation. The parent constructs the dialog's `target`/`itemType`
   * (and, for a move, `excludedPath`) from the project this callback is invoked with. */
  onProjectOperation: (operation: CopyMoveDeleteOperation, project: Project & { audioFileCount: number }) => void;
};

export default function ProjectDetailPanel({ project, isDark, allTags = [], onClose, onReveal, onSaveStatus, onSaveTags, onSaveScore, onProjectOperation }: Props) {
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && project) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project, onClose]);

  const panel = isDark ? "bg-[#13161e] border-white/8 text-slate-200" : "bg-white border-black/8 text-slate-800";
  const meta = "text-slate-500";
  const divider = isDark ? "border-white/8" : "border-slate-200";
  const typeLabel = project?.dawType ? DAW_LABELS[project.dawType] : "Folder";

  return (
    <>
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-200 ${project ? "opacity-100" : "opacity-0 pointer-events-none"} ${isDark ? "bg-black/50" : "bg-black/20"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={project ? `Folder detail: ${project.name}` : "Folder detail"}
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col shadow-2xl transition-transform duration-250 ease-out ${panel} ${project ? "translate-x-0" : "translate-x-full"}`}
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
                className={`mt-0.5 p-1.5 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 ${isDark ? "text-slate-500 hover:text-slate-300 hover:bg-white/8" : "text-slate-400 hover:text-slate-700 hover:bg-black/5"}`}
                aria-label="Close panel"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium ring-1 ${
                    project.dawType
                      ? isDark
                        ? "bg-blue-500/15 text-blue-400 ring-blue-500/30"
                        : "bg-blue-100 text-blue-800 ring-blue-300"
                      : isDark
                        ? "bg-slate-500/15 text-slate-400 ring-slate-500/30"
                        : "bg-slate-100 text-slate-600 ring-slate-300"
                  }`}
                >
                  {typeLabel}
                </span>
                <StatusBadge status={status} isDark={isDark} />
                <ScoreBadge score={score} isDark={isDark} />
                <span className={`text-xs font-mono ${meta}`}>{project.audioFileCount} audio files</span>
              </div>

              {project.dawType && (
                <p className={`text-xs font-mono ${meta}`}>Detected via {project.detectedVia ?? "unknown marker"}</p>
              )}

              {duplicates && duplicates.matches.length > 0 && (
                <div
                  className={`rounded-[var(--rt-radius-lg)] px-3 py-2.5 ring-1 ${isDark ? "bg-amber-500/10 ring-amber-500/25" : "bg-amber-50 ring-amber-300"}`}
                >
                  <p className={`text-xs font-mono font-medium mb-1.5 ${isDark ? "text-amber-400" : "text-amber-800"}`}>
                    Possible duplicate of {duplicates.matches.length}{" "}
                    other folder{duplicates.matches.length > 1 ? "s" : ""}
                  </p>
                  <p className={`text-xs mb-2 ${isDark ? "text-amber-400/70" : "text-amber-700/80"}`}>
                    Based on matching sample files in each project's Samples folder.
                  </p>
                  <div className="space-y-1.5">
                    {duplicates.matches.map((m) => (
                      <div
                        key={m.projectId}
                        className={`px-2.5 py-1.5 rounded-[var(--rt-radius)] ${isDark ? "bg-white/5" : "bg-white"}`}
                      >
                        <p className={`text-xs font-mono truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                          {m.projectName}
                        </p>
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
                  className={`px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? "border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20" : "border-black/10 text-slate-600 hover:text-slate-900 hover:border-black/20"}`}
                >
                  Reveal in Finder
                </button>
                <button
                  onClick={() => onProjectOperation("copy", project)}
                  className={`px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? "border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20" : "border-black/10 text-slate-600 hover:text-slate-900 hover:border-black/20"}`}
                >
                  Copy
                </button>
                <button
                  onClick={() => onProjectOperation("move", project)}
                  className={`px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? "border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20" : "border-black/10 text-slate-600 hover:text-slate-900 hover:border-black/20"}`}
                >
                  Move
                </button>
                <button
                  onClick={() => onProjectOperation("delete", project)}
                  className={`px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${isDark ? "border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-500/50" : "border-red-300 text-red-600 hover:text-red-700 hover:border-red-400"}`}
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
                  {ALL_STATUSES.map((s) => {
                    const selected = status === s;
                    const statusColors = isDark ? STATUS_PILL_DARK : STATUS_PILL_LIGHT;
                    const statusUnselected = isDark ? STATUS_PILL_UNSELECTED_DARK : STATUS_PILL_UNSELECTED_LIGHT;
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        disabled={statusSaving}
                        aria-pressed={selected}
                        className={`px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed ${
                          selected ? `ring-1 ${statusColors[s]}` : statusUnselected
                        }`}
                      >
                        {STATUS_LABELS[s]}
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
                <ScoreEditor score={score} onChange={handleScoreChange} disabled={scoreSaving} isDark={isDark} />
              </div>

              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-2 flex items-center gap-2 ${meta}`}>
                  Tags
                  {tagsSaving && <span className="normal-case tracking-normal">Saving…</span>}
                </p>
                <TagEditor tags={tags} onChange={handleTagsChange} allTags={allTags} isDark={isDark} />
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
                        className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-[var(--rt-radius)] text-xs font-mono ${isDark ? "bg-white/3" : "bg-slate-50"}`}
                      >
                        <span className={`truncate ${isDark ? "text-slate-300" : "text-slate-700"}`} title={f.relativePath}>
                          {f.relativePath}
                        </span>
                        <span className={`flex-shrink-0 ${isDark ? "text-blue-400" : "text-blue-700"}`}>{DAW_LABELS[f.dawType]}</span>
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
                    <ReadOnlyFolderTreeNode key={child.path} node={child} isDark={isDark} depth={0} />
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
