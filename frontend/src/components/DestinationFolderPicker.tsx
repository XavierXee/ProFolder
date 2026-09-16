import { useEffect, useState } from "react";
import * as api from "../api/client.js";
import type { FolderNode } from "../api/client.js";
import { isDescendantOrSelf } from "./ScanFolderPanel.js";

/** One row of the single-select destination tree. Adapted from `ScanFolderPanel`'s
 * checkbox-based `FolderTreeNode` (multi-exclude mode) into radio-like single-select
 * mode: clicking a row selects it outright rather than toggling an independent
 * inclusion/exclusion flag, and only one folder in the whole tree can be selected at a
 * time. `excludedPath` (when given) disables this node AND every descendant of it —
 * reusing `isDescendantOrSelf` the same way `ScanFolderPanel` uses it for its own
 * ancestor-exclusion propagation — so a caller can prevent an item from being moved/
 * copied into its own folder or (for a project) into one of its own subfolders. This is
 * defense-in-depth only: the actual backend routes are the real containment check. */
function FolderNodeRow({
  node,
  selectedPath,
  excludedPath,
  onSelect,
  isDark,
  depth,
}: {
  node: FolderNode;
  selectedPath: string | null;
  excludedPath: string | undefined;
  onSelect: (path: string) => void;
  isDark: boolean;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const disabled = excludedPath !== undefined && isDescendantOrSelf(node.path, excludedPath);
  const selected = !disabled && selectedPath === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1 rounded-[var(--rt-radius)] ${selected ? (isDark ? "bg-blue-500/20" : "bg-blue-50") : ""}`}
        style={{ paddingLeft: depth * 16 }}
      >
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
        <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
          <input
            type="radio"
            name="destination-folder"
            checked={selected}
            disabled={disabled}
            onChange={() => onSelect(node.path)}
            className="accent-blue-500"
          />
          <span className={isDark ? "text-slate-300" : "text-slate-700"}>{node.name}</span>
        </label>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <FolderNodeRow
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              excludedPath={excludedPath}
              onSelect={onSelect}
              isDark={isDark}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  isDark: boolean;
  /** The item's own folder (for a file: its containing folder; for a project: the
   * project's own folder), and — via `isDescendantOrSelf` — every descendant of it, are
   * disabled and cannot be selected. Omit when there's nothing to exclude. */
  excludedPath?: string;
  /** Controlled: the currently-selected destination path, or `null` if nothing has been
   * selected yet. A non-null value is the caller's signal that a valid selection has
   * been made (e.g. to enable an Apply button) — selection can never land on a disabled
   * (excluded) node, so no separate "is valid" flag is needed. */
  selectedPath: string | null;
  onSelect: (path: string) => void;
};

export default function DestinationFolderPicker({ isDark, excludedPath, selectedPath, onSelect }: Props) {
  const [tree, setTree] = useState<FolderNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setLoading(true);
    setError(undefined);
    api
      .getFolderTree()
      .then(setTree)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load folders"))
      .finally(() => setLoading(false));
  }, []);

  const meta = isDark ? "text-slate-500" : "text-slate-500";

  if (loading) {
    return <p className={`text-sm ${meta}`}>Loading folders…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }
  if (!tree) {
    return null;
  }

  return (
    <div role="tree" aria-label="Destination folder">
      <FolderNodeRow node={tree} selectedPath={selectedPath} excludedPath={excludedPath} onSelect={onSelect} isDark={isDark} depth={0} />
    </div>
  );
}
