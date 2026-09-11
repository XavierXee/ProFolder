import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import { useProjects } from "../hooks/useProjects.js";
import type { CustomTab, TrackStatus } from "../types.js";
import FilterToolbar from "./FilterToolbar.js";
import { ProjectsTable } from "./ProjectsTable.js";
import ProjectDetailPanel from "./ProjectDetailPanel.js";
import BatchEditPanel from "./BatchEditPanel.js";

type Props = {
  tab: CustomTab;
  allTags: string[];
  isDark: boolean;
  /** App-level refresh for the header stats (draft/unscored counts). Included for symmetry
   * with `CustomFilesTabPanel` and passed down by App.tsx, but — mirroring App.tsx's own
   * handleProjectStatusSave/handleProjectTagsSave/handleProjectScoreSave and batch
   * equivalents, none of which call `refreshStats` today — it is intentionally not invoked
   * by any handler below. Stats are computed from the audio_files table only (see
   * `audioFileRepository.ts`), and App.tsx's project-side handlers never refresh them either,
   * so calling it here would be new behavior beyond what this task mirrors. */
  refreshStats: () => void;
  /** App-level refresh for the global tag list (used by tag pickers/autocomplete everywhere). */
  refreshTags: () => void;
  /** App's Files hook's refetch — projects' score/tags cascade onto their member files (see
   * REQUIREMENTS.md §12), so editing them here can change files that are invisible right now
   * (the default Files tab isn't mounted while a custom tab is active). Named `refetchFiles`
   * (not `refetch`) to avoid colliding with this panel's own local `useProjects` refetch. */
  refetchFiles: () => void;
  /** Changes whenever a scan completes (App.tsx's scan-completion counter). This panel's own
   * local `useProjects` instance has no other way to hear about a scan finishing. */
  scanCompletionSignal: number | null;
  /** Whether the persistent (fixed-to-viewport) audio player bar is currently showing, so
   * `ProjectsTable` can add bottom padding and keep its last rows from being hidden behind
   * it — mirrors App.tsx's `playerActive={playingFile !== null}` for the default Projects
   * tab (App.tsx passes this straight through to `ProjectsTable`, which applies the padding
   * internally). */
  playerActive: boolean;
  /** App-level banner setter (App.tsx's `setBanner`), used to surface a reveal failure the
   * same way App.tsx's own `handleReveal` does — see that function for the exact message. */
  setBanner: (message: string) => void;
};

export default function CustomProjectsTabPanel({
  tab,
  allTags,
  isDark,
  refreshTags,
  refetchFiles,
  scanCompletionSignal,
  playerActive,
  setBanner,
}: Props) {
  const { projects, total, totalPages, page, pageSize, filters, updateFilters, setPage, loading, refetch } = useProjects({
    statuses: tab.statuses,
    scores: tab.scores,
    tags: tab.tags,
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [showBatchPanel, setShowBatchPanel] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  // Skip the initial mount so this doesn't double-fetch on first render (the hook already
  // fetches once on mount); only refetch when a scan actually completes afterward.
  const isFirstScanSignal = useRef(true);
  useEffect(() => {
    if (isFirstScanSignal.current) {
      isFirstScanSignal.current = false;
      return;
    }
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanCompletionSignal]);

  function handleFilterChange(patch: Parameters<typeof updateFilters>[0]) {
    updateFilters(patch);
    setSelectedProjectIds(new Set());
  }

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
    setSelectedProjectIds(new Set());
  }

  function toggleProjectSelect(id: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllProjectSelect() {
    setSelectedProjectIds((prev) =>
      projects.every((p) => prev.has(p.id)) && projects.length > 0 ? new Set() : new Set(projects.map((p) => p.id))
    );
  }

  function handleProjectRowClick(id: string) {
    setShowBatchPanel(false);
    setSelectedProjectId((prev) => (prev === id ? null : id));
  }

  async function handleReveal(path: string) {
    try {
      await api.reveal(path);
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Could not reveal in Finder");
    }
  }

  // Each handler below: (a) calls the API directly, (b) refetches this panel's OWN local
  // hook instance, and (c) calls the same App-level cross-type refresh props App.tsx's own
  // handlers call for the equivalent mutation — see App.tsx's handleProjectStatusSave /
  // handleProjectTagsSave / handleProjectScoreSave / handleBatchProjectScore /
  // handleBatchProjectTag, which this mirrors exactly.

  async function handleProjectStatusSave(id: string, status: TrackStatus) {
    await api.updateProjectStatus(id, status);
    refetch();
  }

  async function handleProjectTagsSave(id: string, tags: string[]) {
    await api.updateProjectTags(id, tags);
    refetch();
    refetchFiles(); // tags are linked: this was just cascaded onto the project's files
    refreshTags();
  }

  async function handleProjectScoreSave(id: string, score: number | null) {
    await api.updateProjectScore(id, score);
    refetch();
    refetchFiles(); // score is linked: this was just cascaded onto the project's files
  }

  async function handleBatchProjectScore(score: number | null) {
    await api.batchUpdateProjectScore([...selectedProjectIds], score);
    refetch();
    refetchFiles(); // score is linked: this was just cascaded onto each project's files
  }

  async function handleBatchProjectTag(tag: string) {
    await api.batchAddProjectTags([...selectedProjectIds], [tag]);
    refetch();
    refetchFiles(); // tags are linked: this was just cascaded onto each project's files
    refreshTags();
  }

  return (
    <>
      <FilterToolbar
        locked
        filters={filters}
        onChange={handleFilterChange}
        allTags={allTags}
        isDark={isDark}
        resultLabel={loading ? "—" : `${projects.length} of ${total} projects`}
        searchPlaceholder="Search project folders…"
        searchAriaLabel="Search project folders"
        selectedCount={selectedProjectIds.size}
        onOpenBatchPanel={() => {
          setSelectedProjectId(null);
          setShowBatchPanel(true);
        }}
      />

      <ProjectsTable
        projects={projects}
        total={total}
        totalPages={totalPages}
        page={page}
        pageSize={pageSize}
        loading={loading}
        isDark={isDark}
        selectedId={selectedProjectId}
        selectedIds={selectedProjectIds}
        onPageChange={handlePageChange}
        onReveal={handleReveal}
        onRowClick={handleProjectRowClick}
        onToggleSelect={toggleProjectSelect}
        onToggleSelectAll={toggleAllProjectSelect}
        playerActive={playerActive}
      />

      <ProjectDetailPanel
        project={selectedProject}
        isDark={isDark}
        allTags={allTags}
        onClose={() => setSelectedProjectId(null)}
        onReveal={handleReveal}
        onSaveStatus={handleProjectStatusSave}
        onSaveTags={handleProjectTagsSave}
        onSaveScore={handleProjectScoreSave}
      />

      <BatchEditPanel
        open={showBatchPanel}
        count={selectedProjectIds.size}
        itemLabel="project folder"
        isDark={isDark}
        allTags={allTags}
        onClose={() => setShowBatchPanel(false)}
        onApplyScore={handleBatchProjectScore}
        onApplyTag={handleBatchProjectTag}
      />
    </>
  );
}
