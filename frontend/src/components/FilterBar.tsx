import type { FileFilters } from "../api/client.js";
import FilterToolbar from "./FilterToolbar.js";
import { PAGE_SIZE } from "../constants.js";

export const DEFAULT_FILTERS: FileFilters = { page: 1, pageSize: PAGE_SIZE };

type FilterPatch = Omit<FileFilters, "page" | "pageSize">;

export default function FilterBar({
  filters,
  onChange,
  allTags,
  resultLabel,
  selectedCount,
  onOpenBatchPanel,
}: {
  filters: FileFilters;
  onChange: (patch: FilterPatch) => void;
  allTags: string[];
  resultLabel: string;
  selectedCount: number;
  onOpenBatchPanel: () => void;
}) {
  return (
    <FilterToolbar
      filters={filters}
      onChange={onChange}
      allTags={allTags}
      resultLabel={resultLabel}
      searchPlaceholder="Search files or paths…"
      searchAriaLabel="Search by filename or path"
      sectionLabel="AUDIO FILES"
      selectedCount={selectedCount}
      onOpenBatchPanel={onOpenBatchPanel}
    />
  );
}
