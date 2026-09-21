import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { FolderNode, ScanStats } from "../api/client.js";

export function isDescendantOrSelf(candidate: string, ancestor: string): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}

export function FolderTreeNode({
  node,
  excluded,
  onToggle,
  parentExcluded,
  depth,
}: {
  node: FolderNode;
  excluded: Set<string>;
  onToggle: (path: string, currentlyExcluded: boolean) => void;
  parentExcluded: boolean;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isExcluded = excluded.has(node.path);
  const disabled = parentExcluded;
  const checked = !disabled && !isExcluded;
  const hasChildren = node.children.length > 0;

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
        <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-40" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={() => onToggle(node.path, isExcluded)}
            className="accent-blue-500"
          />
          <span className="text-ink-secondary">{node.name}</span>
        </label>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <FolderTreeNode
              key={child.path}
              node={child}
              excluded={excluded}
              onToggle={onToggle}
              parentExcluded={disabled || isExcluded}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  open: boolean;
  musicRoot: string | undefined;
  onClose: () => void;
  onScanComplete: (stats: ScanStats) => void;
  /** Called the instant a new scan attempt starts (before the request is even sent), so the
   * caller can clear a stale banner from a previous scan — otherwise, if this new attempt
   * fails, the previous attempt's success banner would keep silently claiming a scan completed
   * (docs/TODO.md item, Task 7.1 finding). */
  onScanStart: () => void;
};

export default function ScanFolderPanel({ open, musicRoot, onClose, onScanComplete, onScanStart }: Props) {
  const [tree, setTree] = useState<FolderNode | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | undefined>();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(undefined);
    setSaveState("idle");
    Promise.all([api.getFolderTree(), api.getExclusions()])
      .then(([treeResult, exclusionsResult]) => {
        setTree(treeResult);
        setExcluded(new Set(exclusionsResult.excludedPaths));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load folders"))
      .finally(() => setLoading(false));
    setTimeout(() => closeRef.current?.focus(), 50);
    // Re-fetch whenever the panel opens, and also if the production folder changes while it's open.
  }, [open, musicRoot]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function persistExclusions(next: Set<string>) {
    setSaveState("saving");
    api
      .setExclusions([...next])
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  }

  function toggleFolder(path: string, currentlyExcluded: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (currentlyExcluded) {
        next.delete(path);
      } else {
        for (const existing of prev) {
          if (isDescendantOrSelf(existing, path)) next.delete(existing);
        }
        next.add(path);
      }
      persistExclusions(next);
      return next;
    });
  }

  function handleSelectAll() {
    const next = new Set<string>();
    setExcluded(next);
    persistExclusions(next);
  }

  function handleUnselectAll() {
    const next = new Set(tree?.children.map((c) => c.path) ?? []);
    setExcluded(next);
    persistExclusions(next);
  }

  async function handleStartScan() {
    onScanStart();
    setScanning(true);
    setError(undefined);
    try {
      // Defensive re-save in case a toggle's own persist call is still in flight.
      await api.setExclusions([...excluded]);
      const stats = await api.triggerScan();
      onScanComplete(stats);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  const panel = "bg-surface border-border text-ink";
  const meta = "text-slate-500";
  const divider = "border-border";
  const outlineBtn =
    "px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover";

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
        aria-label="Production folder scan settings"
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col transition-transform duration-250 ease-out ${panel} ${open ? "translate-x-0 shadow-2xl" : "translate-x-full"}`}
      >
        <div className={`flex items-start justify-between gap-4 px-6 py-5 border-b ${divider}`}>
          <div className="min-w-0">
            <p className={`text-xs font-mono mb-1 ${meta}`}>Library Directory</p>
            <h2 className="text-base font-mono font-medium text-blue-400 truncate">{musicRoot ?? "…"}</h2>
            <p className={`text-xs mt-1 ${meta}`}>Choose which subfolders to include in the scan</p>
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

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex items-center justify-between mb-1 gap-3">
            <span className={`text-xs font-mono uppercase tracking-wider ${meta}`}>
              {excluded.size > 0 ? `${excluded.size} folder${excluded.size === 1 ? "" : "s"} excluded` : "All folders included"}
            </span>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={handleSelectAll}
                disabled={excluded.size === 0}
                className="text-xs font-mono transition-colors focus:outline-none focus-visible:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:no-underline text-slate-500 hover:text-ink"
              >
                Select All
              </button>
              <button
                onClick={handleUnselectAll}
                disabled={!tree || tree.children.length === 0 || tree.children.every((c) => excluded.has(c.path))}
                className="text-xs font-mono transition-colors focus:outline-none focus-visible:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:no-underline text-slate-500 hover:text-ink"
              >
                Unselect All
              </button>
            </div>
          </div>
          <div className="mb-3 h-4">
            {saveState === "saving" && <span className={`text-xs font-mono ${meta}`}>Saving…</span>}
            {saveState === "saved" && <span className="text-xs font-mono text-emerald-400">Saved</span>}
            {saveState === "error" && <span className="text-xs font-mono text-red-400">Failed to save — will retry on next change</span>}
          </div>

          {loading ? (
            <p className={`text-sm ${meta}`}>Loading folders…</p>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : tree ? (
            tree.children.length === 0 ? (
              <p className={`text-sm ${meta}`}>No subfolders found under the production folder.</p>
            ) : (
              tree.children.map((child) => (
                <FolderTreeNode key={child.path} node={child} excluded={excluded} onToggle={toggleFolder} parentExcluded={false} depth={0} />
              ))
            )
          ) : null}
        </div>

        <div className={`px-6 py-4 border-t ${divider} flex items-center justify-between gap-3`}>
          <span className={`text-xs font-mono ${meta}`}>Read-only scan · nothing is moved or deleted</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className={outlineBtn}
            >
              Close
            </button>
            <button
              onClick={handleStartScan}
              disabled={loading || scanning}
              className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 profolder:bg-surface-selected profolder:hover:bg-surface-selected profolder:text-chrome-ink-secondary profolder:border profolder:border-chrome-ink-secondary"
            >
              {scanning ? "Scanning…" : "Scan"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
