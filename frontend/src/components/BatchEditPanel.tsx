import { useEffect, useRef, useState } from "react";
import { ScoreEditor } from "./ScoreEditor.js";
import { TagAutocompleteInput } from "./TagAutocompleteInput.js";
import { isDescendantOrSelf } from "./ScanFolderPanel.js";
import type { CopyMoveDeleteItemType, CopyMoveDeleteOperation } from "./CopyMoveDeleteDialog.js";

/** For a Projects batch, removes any id whose path is a descendant of another id's path also
 * present in the same batch. Why: `POST /api/projects/batch/move`/`batch/copy` process `ids`
 * sequentially, re-reading each project's *current* path from the DB on each iteration — if
 * an ancestor project in the batch is processed first, its subtree (including any
 * still-pending descendant id from the same batch) gets rekeyed to the new location as a side
 * effect, so the loop then moves the descendant a *second* time, out from under its just-moved
 * ancestor and flattening it into the destination instead of staying nested. Excluding the
 * descendant client-side avoids ever sending
 * that combination. Not applicable to Files batches — files have no nesting relationship to
 * each other. Exported because it's directly unit-tested (this app's convention, see
 * the project notes).
 */
export function excludeNestedProjectIds(ids: string[], projectPaths: { id: string; path: string }[]): string[] {
  const pathById = new Map(projectPaths.map((p) => [p.id, p.path]));
  return ids.filter((id) => {
    const path = pathById.get(id);
    if (path === undefined) return true;
    return !ids.some((otherId) => {
      if (otherId === id) return false;
      const otherPath = pathById.get(otherId);
      return otherPath !== undefined && isDescendantOrSelf(path, otherPath);
    });
  });
}

type Props = {
  open: boolean;
  count: number;
  itemLabel: string;
  allTags?: string[];
  /** "files" or "projects" — which kind of item this batch panel edits. Drives whether the
   * ancestor/descendant dedup above applies (projects only) before `onBatchOperation` is
   * invoked; otherwise purely informational for the caller, which already knows it opens the
   * matching `CopyMoveDeleteDialog` itemType. */
  itemType: CopyMoveDeleteItemType;
  /** Ids of the currently selected batch, used (after dedup, for projects) to build the
   * CopyMoveDeleteDialog target when a Copy/Move/Delete button below is clicked. */
  selectedIds: string[];
  /** id -> root-relative path for every currently *visible* project, used only when
   * itemType === "projects" to run the ancestor/descendant dedup above. Ignored for
   * itemType === "files". */
  projectPaths?: { id: string; path: string }[];
  onClose: () => void;
  onApplyScore: (score: number | null) => Promise<void>;
  onApplyTag: (tag: string) => Promise<void>;
  /** Opens the CopyMoveDeleteDialog (owned by the parent, not this panel) for the current
   * batch with the given operation and (for a Projects batch) already-deduped ids — mirrors
   * FileDetailPanel/ProjectDetailPanel's onFileOperation/onProjectOperation pattern. */
  onBatchOperation: (operation: CopyMoveDeleteOperation, ids: string[]) => void;
};

export default function BatchEditPanel({
  open,
  count,
  itemLabel,
  allTags = [],
  itemType,
  selectedIds,
  projectPaths = [],
  onClose,
  onApplyScore,
  onApplyTag,
  onBatchOperation,
}: Props) {
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [scoreSaving, setScoreSaving] = useState(false);
  const [scoreError, setScoreError] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [appliedTags, setAppliedTags] = useState<string[]>([]);
  const [tagSaving, setTagSaving] = useState(false);
  const [tagError, setTagError] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setLastScore(null);
      setTagInput("");
      setAppliedTags([]);
      setScoreError(false);
      setTagError(false);
      setTimeout(() => closeRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleScoreChange(score: number | null) {
    if (scoreSaving) return;
    setScoreError(false);
    setScoreSaving(true);
    try {
      await onApplyScore(score);
      setLastScore(score);
    } catch {
      setScoreError(true);
    } finally {
      setScoreSaving(false);
    }
  }

  function handleOperationClick(operation: CopyMoveDeleteOperation) {
    const ids = itemType === "projects" ? excludeNestedProjectIds(selectedIds, projectPaths) : selectedIds;
    onBatchOperation(operation, ids);
  }

  async function handleAddTag(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || tagSaving) return;
    setTagError(false);
    setTagSaving(true);
    try {
      await onApplyTag(trimmed);
      setAppliedTags((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
      setTagInput("");
    } catch {
      setTagError(true);
    } finally {
      setTagSaving(false);
    }
  }

  const panel = "bg-surface border-border text-ink";
  const meta = "text-slate-500";
  const divider = "border-border";
  const chipCls = "bg-chip-surface text-ink-secondary";
  const outlineBtn =
    "px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover";
  const dangerBtn =
    "px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 border-danger-border text-danger hover:bg-danger-surface";

  return (
    <>
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"} bg-scrim`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Batch edit ${itemLabel}s`}
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col transition-transform duration-250 ease-out ${panel} ${open ? "translate-x-0 shadow-2xl" : "translate-x-full"}`}
      >
        <div className={`flex items-start justify-between gap-4 px-6 py-5 border-b ${divider}`}>
          <div className="min-w-0">
            <h2 className="text-base font-mono font-medium text-blue-400">Batch Edit</h2>
            <p className={`text-xs mt-1 ${meta}`}>
              {count} {itemLabel}
              {count === 1 ? "" : "s"} selected
            </p>
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
            <p className={`text-xs font-mono uppercase tracking-wider mb-2 flex items-center gap-2 ${meta}`}>
              Set Score
              {scoreSaving && <span className="normal-case tracking-normal">Applying…</span>}
              {scoreError && <span className="normal-case tracking-normal text-red-400">Failed to apply score</span>}
            </p>
            <p className={`text-xs mb-3 ${meta}`}>
              Applies immediately to all {count} selected {itemLabel}
              {count === 1 ? "" : "s"}, overwriting whatever score each already has.
            </p>
            <ScoreEditor score={lastScore} onChange={handleScoreChange} disabled={scoreSaving} />
          </div>

          <div className={`border-t ${divider}`} />

          <div>
            <p className={`text-xs font-mono uppercase tracking-wider mb-2 flex items-center gap-2 ${meta}`}>
              Add Tags
              {tagSaving && <span className="normal-case tracking-normal">Applying…</span>}
              {tagError && <span className="normal-case tracking-normal text-red-400">Failed to add tag</span>}
            </p>
            <p className={`text-xs mb-3 ${meta}`}>
              Each tag is added to all {count} selected {itemLabel}
              {count === 1 ? "" : "s"}, on top of any tags they already have.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <TagAutocompleteInput
                  value={tagInput}
                  onChange={setTagInput}
                  onCommit={handleAddTag}
                  suggestions={allTags}
                  placeholder="Add tag, press Enter…"
                  disabled={tagSaving}
                />
              </div>
              <button
                onClick={() => handleAddTag(tagInput)}
                disabled={tagSaving || !tagInput.trim()}
                className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 profolder:bg-surface-selected profolder:hover:bg-surface-selected profolder:text-chrome-ink-secondary profolder:border profolder:border-chrome-ink-secondary"
              >
                Add
              </button>
            </div>
            {appliedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {appliedTags.map((tag) => (
                  <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--rt-radius)] text-xs font-mono ${chipCls}`}>
                    {tag}
                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={`border-t ${divider}`} />

          <div>
            <p className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>Copy / Move / Delete</p>
            <p className={`text-xs mb-3 ${meta}`}>
              Applies to all {count} selected {itemLabel}
              {count === 1 ? "" : "s"}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleOperationClick("copy")}
                className={outlineBtn}
              >
                Copy
              </button>
              <button
                onClick={() => handleOperationClick("move")}
                className={outlineBtn}
              >
                Move
              </button>
              <button
                onClick={() => handleOperationClick("delete")}
                className={dangerBtn}
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <div className={`px-6 py-4 border-t ${divider}`}>
          <button
            onClick={onClose}
            className={`w-full ${outlineBtn}`}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
