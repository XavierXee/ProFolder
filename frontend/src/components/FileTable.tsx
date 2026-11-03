import { useEffect, useRef, useState, type DragEvent } from "react";
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
  sortable = true,
}: {
  sortKey: SortKey;
  filters: FileFilters;
  onSortChange: (key: SortKey) => void;
  label: string;
  className?: string;
  /** False in an ordered tab, which is always listed in its own order: a plain label. */
  sortable?: boolean;
}) {
  if (!sortable) {
    return (
      <th scope="col" className={`px-4 py-3 border-b border-divider text-xs font-mono font-medium uppercase tracking-wider text-ink-muted ${className}`}>
        {label}
      </th>
    );
  }
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
  ordered = false,
  onReorder,
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
  /** An ordered custom tab: adds the "#" column, turns off column sorting, and lets rows be
   * dragged onto another row to take its place (reported through `onReorder`). */
  ordered?: boolean;
  /** Called with the dragged file and the 1-based position (the target row's number) to move it to. */
  onReorder?: (fileId: string, position: number) => void;
}) {
  const flashRef = useRef<HTMLTableRowElement | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function rowDragProps(file: AudioFile) {
    return {
      onDragStart: (e: DragEvent<HTMLTableRowElement>) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", file.id); // Firefox only starts a drag with data set
        setDraggedId(file.id);
      },
      onDragOver: (e: DragEvent<HTMLTableRowElement>) => {
        if (draggedId === null) return;
        e.preventDefault(); // allows the drop
        if (dropTargetId !== file.id) setDropTargetId(file.id);
      },
      onDrop: (e: DragEvent<HTMLTableRowElement>) => {
        e.preventDefault();
        if (draggedId !== null && draggedId !== file.id && file.trackNumber !== undefined) {
          onReorder?.(draggedId, file.trackNumber);
        }
        setDraggedId(null);
        setDropTargetId(null);
      },
      onDragEnd: () => {
        setDraggedId(null);
        setDropTargetId(null);
      },
    };
  }

  useEffect(() => {
    if (flashRef.current) {
      flashRef.current.classList.remove("row-flash");
      void flashRef.current.offsetWidth;
      flashRef.current.classList.add("row-flash");
    }
  }, [flashId]);

  const thBase = "px-4 py-3 text-xs font-mono font-medium uppercase tracking-wider text-ink-muted border-b border-divider";
  const allSelected = files.length > 0 && files.every((f) => selectedIds.has(f.id));
  // Percent widths sum to 100 either way; an ordered tab narrows Track / File and Tags to fit
  // "#". Written out in full because Tailwind only generates class names it finds verbatim.
  const trackWidth = ordered ? "w-[20%]" : "w-[22%]";
  const tagsWidth = ordered ? "w-[14%]" : "w-[15%]";

  return (
    <table className="w-full border-collapse table-fixed" aria-label="Audio files">
      <caption className="sr-only">Scanned audio files, sortable by column</caption>
      <thead className="sticky top-0 z-10 bg-canvas">
        <tr className="relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-[var(--color-border)]">
          <th scope="col" className={`${thBase} text-center w-[4%]`}>
            <RowCheckbox checked={allSelected} onChange={onToggleSelectAll} ariaLabel="Select all visible files" />
          </th>
          {ordered && (
            <th scope="col" className={`${thBase} text-center w-[3%]`}>
              <span aria-hidden="true">#</span>
              <span className="sr-only">Track number</span>
            </th>
          )}
          <SortTh sortable={!ordered} sortKey="name" filters={filters} onSortChange={onSortChange} label="Track / File" className={`text-left ${trackWidth}`} />
          <SortTh sortable={!ordered} sortKey="project" filters={filters} onSortChange={onSortChange} label="Project" className="text-left w-[10%]" />
          <SortTh sortable={!ordered} sortKey="folder" filters={filters} onSortChange={onSortChange} label="Location" className="text-left w-[14%]" />
          <SortTh sortable={!ordered} sortKey="duration" filters={filters} onSortChange={onSortChange} label="Duration" className="text-center w-[7%]" />
          <SortTh sortable={!ordered} sortKey="status" filters={filters} onSortChange={onSortChange} label="Status" className="text-center w-[11%]" />
          <SortTh sortable={!ordered} sortKey="tags" filters={filters} onSortChange={onSortChange} label="Tags" className={`text-center ${tagsWidth}`} />
          <SortTh sortable={!ordered} sortKey="score" filters={filters} onSortChange={onSortChange} label="Score" className="text-center w-[8%]" />
          <SortTh sortable={!ordered} sortKey="modifiedAt" filters={filters} onSortChange={onSortChange} label="Modified" className="text-center w-[9%]" />
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <LoadingRows columns={ordered ? 10 : 9} />
        ) : files.length === 0 ? (
          <EmptyState onClear={onClearFilters} colSpan={ordered ? 10 : 9} />
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
              showTrackNumber={ordered}
              dragProps={ordered ? rowDragProps(file) : undefined}
              isDropTarget={ordered && dropTargetId === file.id && draggedId !== file.id}
            />
          ))
        )}
      </tbody>
    </table>
  );
}
