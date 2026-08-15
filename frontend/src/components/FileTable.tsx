import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { AudioFile } from "../types.js";
import { FileRow } from "./FileRow.js";
import LoadingRows from "./LoadingRows.js";
import EmptyState from "./EmptyState.js";
import type { FileFilters } from "../api/client.js";

type SortKey = NonNullable<FileFilters["sortBy"]>;

function sortIndicator(filters: FileFilters, key: SortKey): string {
  if (filters.sortBy !== key) return "";
  return filters.sortDir === "desc" ? " ↓" : " ↑";
}

function SortTh({
  sortKey,
  filters,
  onSortChange,
  isDark,
  children,
  className = "",
}: {
  sortKey: SortKey;
  filters: FileFilters;
  onSortChange: (key: SortKey) => void;
  isDark: boolean;
  children: ReactNode;
  className?: string;
}) {
  const active = filters.sortBy === sortKey;
  return (
    <th scope="col" aria-sort={active ? (filters.sortDir === "asc" ? "ascending" : "descending") : "none"} className={`px-4 py-3 text-left ${className}`}>
      <button
        onClick={() => onSortChange(sortKey)}
        className={`flex items-center gap-1 text-xs font-mono font-medium uppercase tracking-wider focus:outline-none focus-visible:underline transition-colors ${
          isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-700"
        }`}
      >
        {children}
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
  onSortChange,
  onRowClick,
  onClearFilters,
}: {
  files: AudioFile[];
  filters: FileFilters;
  loading: boolean;
  flashId: string | null;
  isDark: boolean;
  selectedId: string | null;
  onSortChange: (sortBy: SortKey) => void;
  onRowClick: (id: string) => void;
  onClearFilters: () => void;
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

  return (
    <table className="w-full border-collapse" aria-label="Audio files">
      <caption className="sr-only">Scanned audio files, sortable by column</caption>
      <thead className={`border-b sticky top-0 z-10 ${isDark ? "bg-[#0d0f14] border-white/8" : "bg-[#f4f6f9] border-black/8"}`}>
        <tr>
          <SortTh sortKey="name" filters={filters} onSortChange={onSortChange} isDark={isDark}>
            Track / File
          </SortTh>
          <th scope="col" className={staticTh}>
            Status
          </th>
          <th scope="col" className={staticTh}>
            Tags
          </th>
          <th scope="col" className={staticTh}>
            Project
          </th>
          <th scope="col" className={staticTh}>
            Export Confidence
          </th>
          <SortTh sortKey="folder" filters={filters} onSortChange={onSortChange} isDark={isDark}>
            Location
          </SortTh>
          <SortTh sortKey="modifiedAt" filters={filters} onSortChange={onSortChange} isDark={isDark}>
            Modified
          </SortTh>
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
            />
          ))
        )}
      </tbody>
    </table>
  );
}
