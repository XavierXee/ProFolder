import type { ProjectFilters } from "../api/client.js";
import FilterToolbar from "./FilterToolbar.js";

type FilterPatch = Omit<ProjectFilters, "page" | "pageSize">;

export default function ProjectsFilterBar({
  filters,
  onChange,
  allTags,
  isDark,
  isProFolder = false,
  resultLabel,
  selectedCount,
  onOpenBatchPanel,
}: {
  filters: ProjectFilters;
  onChange: (patch: FilterPatch) => void;
  allTags: string[];
  isDark: boolean;
  /** ProFolder brand theme flag (Section 07 "Interface application"). Defaults to false so
   * existing callers render byte-identically to before. */
  isProFolder?: boolean;
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
      isProFolder={isProFolder}
      resultLabel={resultLabel}
      searchPlaceholder="Search project folders…"
      searchAriaLabel="Search project folders"
      sectionLabel="PROJECT FOLDERS"
      selectedCount={selectedCount}
      onOpenBatchPanel={onOpenBatchPanel}
    />
  );
}
