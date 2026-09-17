import type { ProjectFilters } from "../api/client.js";
import FilterToolbar from "./FilterToolbar.js";

type FilterPatch = Omit<ProjectFilters, "page" | "pageSize">;

export default function ProjectsFilterBar({
  filters,
  onChange,
  allTags,
  resultLabel,
  selectedCount,
  onOpenBatchPanel,
}: {
  filters: ProjectFilters;
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
      searchPlaceholder="Search project folders…"
      searchAriaLabel="Search project folders"
      sectionLabel="PROJECT FOLDERS"
      selectedCount={selectedCount}
      onOpenBatchPanel={onOpenBatchPanel}
    />
  );
}
