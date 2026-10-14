import { useEffect, useRef, useState } from "react";
import type { AudioFile, TrackStatus } from "../types.js";
import { UNKNOWN_STATUS_KEY } from "../types.js";
import type { CopyMoveDeleteOperation } from "./CopyMoveDeleteDialog.js";
import { ScoreEditor } from "./ScoreEditor.js";
import { TagEditor } from "./TagEditor.js";
import { buildStatusOptions, STATUS_PILL, STATUS_PILL_UNSELECTED } from "../statusStyles.js";
import { statusPillStyle } from "../statusColor.js";
import { useStatusCatalog } from "../contexts/StatusCatalogContext.js";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatFull(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

type Props = {
  file: AudioFile | null;
  allTags?: string[];
  onClose: () => void;
  onSaveStatus: (id: string, status: TrackStatus) => Promise<void>;
  onSaveTags: (id: string, tags: string[]) => Promise<void>;
  onSaveScore: (id: string, score: number | null) => Promise<void>;
  onSaveNotes: (id: string, notes: string) => Promise<void>;
  onReveal: (path: string) => void;
  /** Opens the CopyMoveDeleteDialog (owned by the parent, not this panel) for this single
   * file with the given operation. The parent constructs the dialog's `target`/`itemType`
   * from the file this callback is invoked with. */
  onFileOperation: (operation: CopyMoveDeleteOperation, file: AudioFile) => void;
};

export default function FileDetailPanel({ file, allTags = [], onClose, onSaveStatus, onSaveTags, onSaveScore, onSaveNotes, onReveal, onFileOperation }: Props) {
  const { statuses: catalogStatuses } = useStatusCatalog();
  const [status, setStatus] = useState<TrackStatus>("unknown");
  const [tags, setTags] = useState<string[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [tagsSaving, setTagsSaving] = useState(false);
  const [scoreSaving, setScoreSaving] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (file) {
      setStatus(file.status);
      setTags(file.tags);
      setScore(file.score);
      setNotes(file.notes);
      setSavedNotes(file.notes);
      setTimeout(() => closeRef.current?.focus(), 50);
    }
  }, [file?.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleStatusChange(next: TrackStatus) {
    if (!file || next === status || statusSaving) return;
    const previous = status;
    setStatus(next);
    setStatusSaving(true);
    try {
      await onSaveStatus(file.id, next);
    } catch {
      setStatus(previous);
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleTagsChange(next: string[]) {
    if (!file) return;
    const previous = tags;
    setTags(next);
    setTagsSaving(true);
    try {
      await onSaveTags(file.id, next);
    } catch {
      setTags(previous);
    } finally {
      setTagsSaving(false);
    }
  }

  async function handleScoreChange(next: number | null) {
    if (!file || scoreSaving) return;
    const previous = score;
    setScore(next);
    setScoreSaving(true);
    try {
      await onSaveScore(file.id, next);
    } catch {
      setScore(previous);
    } finally {
      setScoreSaving(false);
    }
  }

  /** Notes save on a short debounce while typing (matching FilterToolbar's search-debounce
   * idiom) plus an immediate flush on blur, rather than committing on every keystroke like
   * the other fields' click-driven handlers do — a free-text field can't use those fields'
   * "only call the handler on a real discrete action" guard, since every keystroke IS a
   * discrete action. Debouncing also bounds how much typed-but-unsaved text the window-level
   * Escape-to-close handler above could otherwise discard (the panel only slides off-screen,
   * it doesn't unmount, so Escape alone would strand an uncommitted edit in local state
   * without this). */
  async function commitNotes(value: string, previous: string) {
    if (!file || value === previous || notesSaving) return;
    setNotesSaving(true);
    try {
      await onSaveNotes(file.id, value);
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

  const panel = "bg-surface border-border text-ink";
  const meta = "text-slate-500";
  const divider = "border-border";
  const outlineBtn =
    "px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover";
  const dangerBtn =
    "px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 border-danger-border text-danger hover:bg-danger-surface";
  const inputBg = "bg-canvas border-border text-ink placeholder-ink-muted";

  return (
    <>
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-200 ${file ? "opacity-100" : "opacity-0 pointer-events-none"} bg-scrim`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={file ? `File detail: ${file.filename}` : "File detail"}
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col transition-transform duration-250 ease-out ${panel} ${file ? "translate-x-0 shadow-2xl" : "translate-x-full"}`}
      >
        {file && (
          <>
            <div className={`flex items-start justify-between gap-4 px-6 py-5 border-b ${divider}`}>
              <div className="min-w-0">
                <p className={`text-xs font-mono mb-1 ${meta}`}>File</p>
                <h2 className="text-base font-mono font-medium text-blue-400 truncate">{file.filename}</h2>
                <p className={`text-xs mt-1 ${meta}`}>Updated {formatFull(file.modifiedAt)} | Size {formatBytes(file.size)}</p>
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
              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>Project</p>
                <p className="text-lg font-semibold truncate">{file.projectId ?? "Unassociated"}</p>
              </div>

              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>Location</p>
                <p className="text-sm leading-relaxed break-all text-ink">{file.relativePath}</p>

                <div className="flex gap-2 mt-3 w-full">
                  <button
                    onClick={() => onReveal(file.path)}
                    className={`flex-1 ${outlineBtn}`}
                  >
                    Reveal in Finder
                  </button>
                  {file.projectPath && (
                    <button
                      onClick={() => onReveal(file.projectPath!)}
                      className={`flex-1 ${outlineBtn}`}
                    >
                      Reveal project
                    </button>
                  )}
                </div>
                <div className="flex gap-2 mt-2 w-full">
                  <button
                    onClick={() => onFileOperation("copy", file)}
                    className={`flex-1 ${outlineBtn}`}
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => onFileOperation("move", file)}
                    className={`flex-1 ${outlineBtn}`}
                  >
                    Move
                  </button>
                  <button
                    onClick={() => onFileOperation("delete", file)}
                    className={`flex-1 ${outlineBtn}`}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-3 flex items-center gap-2 ${meta}`}>
                  Status
                  {statusSaving && <span className="normal-case tracking-normal">Saving…</span>}
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Select status">
                  {/* Transient fallback for the window before useStatusCatalog()'s mount-time
                      fetch resolves: buildStatusOptions(catalogStatuses) is just [unknown] until
                      then, so the file's real (non-unknown) status would otherwise have no pill
                      showing it selected. Self-corrects once the catalog
                      loads and this status's real pill takes over. Not clickable — it's not a
                      real catalog entry, just a placeholder for "whatever this already is". */}
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
            </div>
          </>
        )}
      </div>
    </>
  );
}
