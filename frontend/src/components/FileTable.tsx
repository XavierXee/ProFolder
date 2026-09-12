import { useEffect, useRef } from "react";
import type { AudioFile } from "../types.js";
import { FileRow } from "./FileRow.js";
import LoadingRows from "./LoadingRows.js";
import EmptyState from "./EmptyState.js";
import { RowCheckbox } from "./RowCheckbox.js";
import type { FileFilters } from "../api/client.js";

type SortKey = NonNullable<FileFilters["sortBy"]>;

export function sortIndicator(filters: FileFilters, key: SortKey): string {
  if (filters.sortBy !== key) return "";
  return filters.sortDir === "desc" ? " ↓" : " ↑";
}

function SortTh({
  sortKey,
  filters,
  onSortChange,
  isDark,
  label,
  className = "",
}: {
  sortKey: SortKey;
  filters: FileFilters;
  onSortChange: (key: SortKey) => void;
  isDark: boolean;
  label: string;
  className?: string;
}) {
  const active = filters.sortBy === sortKey;
  return (
    <th scope="col" aria-sort={active ? (filters.sortDir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-3 text-left ${className}`}>
      <button
        onClick={() => onSortChange(sortKey)}
        aria-label={`Sort by ${label}`}
        className={`flex items-center gap-1 text-xs font-mono font-medium uppercase tracking-wider focus:outline-none focus-visible:underline transition-colors ${
          isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-700"
        }`}
      >
        {label}
        {sortIndicator(filters, sortKey)}
      </button>
    </th>
  );
}

export function FileTable({
  files,
  filters,
  loading,
  flashId,
  isDark,
  selectedId,
  selectedIds,
  playingFileId,
  isPlaying,
  onSortChange,
  onRowClick,
  onClearFilters,
  onToggleSelect,
  onToggleSelectAll,
  onPlayClick,
}: {
  files: AudioFile[];
  filters: FileFilters;
  loading: boolean;
  flashId: string | null;
  isDark: boolean;
  selectedId: string | null;
  selectedIds: Set<string>;
  playingFileId: string | null;
  isPlaying: boolean;
  onSortChange: (sortBy: SortKey) => void;
  onRowClick: (id: string) => void;
  onClearFilters: () => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onPlayClick: (file: AudioFile) => void;
}) {
  const flashRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (flashRef.current) {
      flashRef.current.classList.remove("row-flash");
      void flashRef.current.offsetWidth;
      flashRef.current.classList.add("row-flash");
    }
  }, [flashId]);

  const staticTh = `px-4 py-3 text-left text-xs font-mono font-medium uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`;
  const allSelected = files.length > 0 && files.every((f) => selectedIds.has(f.id));

  return (
    <table className="w-full border-collapse" aria-label="Audio files">
      <caption className="sr-only">Scanned audio files, sortable by column</caption>
      <thead className={`border-b sticky top-0 z-10 ${isDark ? "bg-[#0d0f14] border-white/8" : "bg-[#f4f6f9] border-black/8"}`}>
        <tr>
          <th scope="col" className={`${staticTh} w-8`}>
            <RowCheckbox checked={allSelected} onChange={onToggleSelectAll} ariaLabel="Select all visible files" />
          </th>
          <SortTh sortKey="name" filters={filters} onSortChange={onSortChange} isDark={isDark} label="Track / File" />
          <th scope="col" className={`${staticTh} w-32`}>
            Status
          </th>
          <th scope="col" className={staticTh}>
            Tags
          </th>
          <th scope="col" className={staticTh}>
            Project
          </th>
          <SortTh sortKey="score" filters={filters} onSortChange={onSortChange} isDark={isDark} label="Score" />
          <SortTh sortKey="folder" filters={filters} onSortChange={onSortChange} isDark={isDark} label="Location" />
          <SortTh sortKey="modifiedAt" filters={filters} onSortChange={onSortChange} isDark={isDark} label="Modified" />
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <LoadingRows />
        ) : files.length === 0 ? (
          <EmptyState onClear={onClearFilters} />
        ) : (
          files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              isDark={isDark}
              isSelected={file.id === selectedId}
              isFlash={file.id === flashId}
              flashRef={flashRef}
              onClick={() => onRowClick(file.id)}
              checked={selectedIds.has(file.id)}
              onToggleCheck={() => onToggleSelect(file.id)}
              isPlayingThis={file.id === playingFileId && isPlaying}
              onPlayClick={() => onPlayClick(file)}
            />
          ))
        )}
      </tbody>
    </table>
  );
}
