import type { FileFilters } from "../api/client.js";
import FilterToolbar from "./FilterToolbar.js";
import { PAGE_SIZE } from "../constants.js";

export const DEFAULT_FILTERS: FileFilters = { page: 1, pageSize: PAGE_SIZE };

type FilterPatch = Omit<FileFilters, "page" | "pageSize">;

export default function FilterBar({
  filters,
  onChange,
  allTags,
  isDark,
  resultLabel,
  selectedCount,
  onOpenBatchPanel,
}: {
  filters: FileFilters;
  onChange: (patch: FilterPatch) => void;
  allTags: string[];
  isDark: boolean;
  resultLabel: string;
  selectedCount: number;
  onOpenBatchPanel: () => void;
}) {
  return (
    <FilterToolbar
      filters={filters}
      onChange={onChange}
      allTags={allTags}
      isDark={isDark}
      resultLabel={resultLabel}
      searchPlaceholder="Search files or paths…"
      searchAriaLabel="Search by filename or path"
      selectedCount={selectedCount}
      onOpenBatchPanel={onOpenBatchPanel}
    />
  );
}
