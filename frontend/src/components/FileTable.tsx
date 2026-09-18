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
  label,
  className = "text-left",
}: {
  sortKey: SortKey;
  filters: FileFilters;
  onSortChange: (key: SortKey) => void;
  label: string;
  className?: string;
}) {
  const active = filters.sortBy === sortKey;
  return (
    <th scope="col" aria-sort={active ? (filters.sortDir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-3 border-b border-divider ${className}`}>
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

export function FileTable({
  files,
  filters,
  loading,
  flashId,
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

  const thBase = "px-4 py-3 text-xs font-mono font-medium uppercase tracking-wider text-ink-muted border-b border-divider";
  const staticTh = `${thBase} text-left`;
  const allSelected = files.length > 0 && files.every((f) => selectedIds.has(f.id));

  return (
    <table className="w-full border-collapse table-fixed" aria-label="Audio files">
      <caption className="sr-only">Scanned audio files, sortable by column</caption>
      <thead className="sticky top-0 z-10 bg-canvas">
        <tr>
          <th scope="col" className={`${thBase} text-center w-[4%]`}>
            <RowCheckbox checked={allSelected} onChange={onToggleSelectAll} ariaLabel="Select all visible files" />
          </th>
          <SortTh sortKey="name" filters={filters} onSortChange={onSortChange} label="Track / File" className="w-[24%]" />
          <th scope="col" className={`${staticTh} w-[12%]`}>
            Status
          </th>
          <th scope="col" className={`${staticTh} w-[16%]`}>
            Tags
          </th>
          <th scope="col" className={`${staticTh} w-[10%]`}>
            Project
          </th>
          <SortTh sortKey="score" filters={filters} onSortChange={onSortChange} label="Score" className="text-center w-[8%]" />
          <SortTh sortKey="folder" filters={filters} onSortChange={onSortChange} label="Location" className="w-[16%]" />
          <SortTh sortKey="modifiedAt" filters={filters} onSortChange={onSortChange} label="Modified" className="text-center w-[10%]" />
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
