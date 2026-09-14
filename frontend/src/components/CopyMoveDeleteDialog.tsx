import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { BatchOpResult } from "../api/client.js";
import DestinationFolderPicker from "./DestinationFolderPicker.js";

export type CopyMoveDeleteOperation = "copy" | "move" | "delete";
export type CopyMoveDeleteItemType = "files" | "projects";

/** Discriminated union so a caller can construct exactly one of the two shapes — a single
 * item (id + display name, shown in the dialog title) or a batch (ids + count, used only
 * for wording since individual names aren't needed). */
export type CopyMoveDeleteTarget = { kind: "single"; id: string; name: string } | { kind: "batch"; ids: string[]; count: number };

/** Summary the dialog hands back on a completed (i.e. non-throwing) request. For a batch
 * operation this can be a partial success (`failedCount > 0`) — each id is processed
 * independently server-side (see `BatchOpResult`'s doc comment in `api/client.ts`), so a
 * batch call resolving doesn't mean every item succeeded. For a single item, the request
 * either resolves (1/0) or throws (handled via `onError`, `onSuccess` is not called). */
export type CopyMoveDeleteOutcome = {
  succeededCount: number;
  failedCount: number;
};

type Props = {
  open: boolean;
  isDark: boolean;
  operation: CopyMoveDeleteOperation;
  itemType: CopyMoveDeleteItemType;
  target: CopyMoveDeleteTarget;
  /** The item's own folder path. Only meaningful for a single PROJECT move (see the
   * forwarding logic below for why) — pass it whenever `operation === "move"`,
   * `itemType === "projects"`, and `target.kind === "single"`; harmless to omit/pass in
   * any other combination since it's never forwarded to the picker there anyway. */
  excludedPath?: string;
  onClose: () => void;
  onSuccess: (outcome: CopyMoveDeleteOutcome) => void;
  onError: (message: string) => void;
};

function targetCount(target: CopyMoveDeleteTarget): number {
  return target.kind === "single" ? 1 : target.count;
}

/** Pure text-generation helper — exported because it's directly unit-tested (this app's
 * convention is to only export module-private helpers when they get a genuine, direct
 * test; see the project notes). Covers copy/move/delete × files/projects × singular/plural, and
 * the copy/move "no destination chosen yet" fallback wording. */
export function buildExplanationText(
  operation: CopyMoveDeleteOperation,
  itemType: CopyMoveDeleteItemType,
  target: CopyMoveDeleteTarget,
  destinationPath: string | null
): string {
  const count = targetCount(target);
  const singular = itemType === "files" ? "file" : "project";
  const subject = count === 1 ? `This ${singular}` : `These ${count} ${singular}s`;

  if (operation === "delete") {
    return `${subject} will be moved to the Trash.`;
  }

  const verb = operation === "copy" ? "copied (duplicated)" : "moved";
  const preposition = operation === "copy" ? "in" : "to";
  const location = destinationPath ?? "the folder you choose below";
  return `${subject} will be ${verb} ${preposition} ${location}.`;
}

function applyButtonLabel(operation: CopyMoveDeleteOperation, busy: boolean): string {
  if (operation === "copy") return busy ? "Copying…" : "Copy";
  if (operation === "move") return busy ? "Moving…" : "Move";
  return busy ? "Moving to Trash…" : "Move to Trash";
}

function dialogTitle(operation: CopyMoveDeleteOperation, itemType: CopyMoveDeleteItemType, target: CopyMoveDeleteTarget): string {
  const verb = operation === "copy" ? "Copy" : operation === "move" ? "Move" : "Move to Trash";
  if (target.kind === "single") return `${verb} "${target.name}"`;
  const singular = itemType === "files" ? "file" : "project";
  return `${verb} ${target.count} ${singular}${target.count === 1 ? "" : "s"}`;
}

async function runSingle(
  operation: CopyMoveDeleteOperation,
  itemType: CopyMoveDeleteItemType,
  id: string,
  destinationPath: string | null
): Promise<CopyMoveDeleteOutcome> {
  if (operation === "delete") {
    if (itemType === "files") await api.deleteFile(id);
    else await api.deleteProject(id);
    return { succeededCount: 1, failedCount: 0 };
  }
  if (destinationPath === null) throw new Error("No destination selected");
  if (operation === "copy") {
    if (itemType === "files") await api.copyFile(id, destinationPath);
    else await api.copyProject(id, destinationPath);
  } else {
    if (itemType === "files") await api.moveFile(id, destinationPath);
    else await api.moveProject(id, destinationPath);
  }
  return { succeededCount: 1, failedCount: 0 };
}

async function runBatch(
  operation: CopyMoveDeleteOperation,
  itemType: CopyMoveDeleteItemType,
  ids: string[],
  destinationPath: string | null
): Promise<CopyMoveDeleteOutcome> {
  let result: BatchOpResult;
  if (operation === "delete") {
    result = itemType === "files" ? await api.batchDeleteFiles(ids) : await api.batchDeleteProjects(ids);
  } else {
    if (destinationPath === null) throw new Error("No destination selected");
    if (operation === "copy") {
      result = itemType === "files" ? await api.batchCopyFiles(ids, destinationPath) : await api.batchCopyProjects(ids, destinationPath);
    } else {
      result = itemType === "files" ? await api.batchMoveFiles(ids, destinationPath) : await api.batchMoveProjects(ids, destinationPath);
    }
  }
  return { succeededCount: result.succeeded.length, failedCount: result.failed.length };
}

export default function CopyMoveDeleteDialog({ open, isDark, operation, itemType, target, excludedPath, onClose, onSuccess, onError }: Props) {
  const [destinationPath, setDestinationPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const closeRef = useRef<HTMLButtonElement>(null);

  // A parent may keep this component mounted across opens/closes (toggling `open` rather
  // than mounting/unmounting the element), matching BatchEditPanel/ScanFolderPanel's
  // convention — so state must be explicitly reset here rather than relying on a fresh
  // mount, and the effect must re-run on every `open` transition, not just the first.
  useEffect(() => {
    if (!open) return;
    setDestinationPath(null);
    setBusy(false);
    setError(undefined);
    setTimeout(() => closeRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const needsDestination = operation !== "delete";
  const isEmptyBatch = target.kind === "batch" && target.count === 0;
  const canApply = !busy && (!needsDestination || destinationPath !== null) && !isEmptyBatch;

  // A project can never be moved into itself or one of its own descendants (that would
  // nest it inside its own subtree), so the picker needs to disable that whole subtree —
  // hence forwarding excludedPath there. A file has no descendant folders of its own:
  // "moving" a file into the folder it's already in is at worst a harmless no-op, not a
  // structurally invalid nesting, so there's nothing meaningful to exclude for files (or
  // for batches, which don't have a single well-defined "own folder" to exclude anyway).
  const pickerExcludedPath = operation === "move" && itemType === "projects" && target.kind === "single" ? excludedPath : undefined;

  function handleBackdropOrCancel() {
    if (busy) return;
    onClose();
  }

  async function handleApply() {
    if (!canApply) return;
    setBusy(true);
    setError(undefined);
    try {
      const outcome =
        target.kind === "single"
          ? await runSingle(operation, itemType, target.id, destinationPath)
          : await runBatch(operation, itemType, target.ids, destinationPath);
      onSuccess(outcome);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Operation failed";
      setError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  }

  const panel = isDark ? "bg-[#13161e] border-white/8 text-slate-200" : "bg-white border-black/8 text-slate-800";
  const divider = isDark ? "border-white/8" : "border-slate-200";
  const title = dialogTitle(operation, itemType, target);
  const explanation = buildExplanationText(operation, itemType, target, destinationPath);
  const applyDangerCls = "bg-red-600 hover:bg-red-500 focus-visible:ring-red-500";
  const applyPrimaryCls = "bg-blue-600 hover:bg-blue-500 focus-visible:ring-blue-500";

  return (
    <>
      <div
        className={`fixed inset-0 z-40 ${isDark ? "bg-black/50" : "bg-black/20"}`}
        onClick={handleBackdropOrCancel}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`pointer-events-auto w-full max-w-md rounded-lg border shadow-2xl flex flex-col max-h-[85vh] ${panel}`}
        >
          <div className={`flex items-start justify-between gap-4 px-5 py-4 border-b ${divider}`}>
            <h2 className="text-sm font-mono font-medium text-blue-400 min-w-0 truncate">{title}</h2>
            <button
              ref={closeRef}
              onClick={handleBackdropOrCancel}
              disabled={busy}
              className={`mt-0.5 p-1.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "text-slate-500 hover:text-slate-300 hover:bg-white/8" : "text-slate-400 hover:text-slate-700 hover:bg-black/5"}`}
              aria-label="Close dialog"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <p className="text-sm">{explanation}</p>

            {error && <p className="text-sm text-red-400">{error}</p>}

            {needsDestination && (
              <div className={`border rounded max-h-64 overflow-y-auto px-2 py-2 ${isDark ? "border-white/10" : "border-black/10"}`}>
                <DestinationFolderPicker isDark={isDark} excludedPath={pickerExcludedPath} selectedPath={destinationPath} onSelect={setDestinationPath} />
              </div>
            )}
          </div>

          <div className={`px-5 py-4 border-t ${divider} flex justify-end gap-2`}>
            <button
              onClick={handleBackdropOrCancel}
              disabled={busy}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20" : "border-black/10 text-slate-500 hover:text-slate-700 hover:border-black/20"}`}
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!canApply}
              className={`px-3 py-1.5 rounded text-xs font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed ${operation === "delete" ? applyDangerCls : applyPrimaryCls}`}
            >
              {applyButtonLabel(operation, busy)}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
