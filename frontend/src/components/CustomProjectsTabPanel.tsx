import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { ProjectFilters } from "../api/client.js";
import { useProjects } from "../hooks/useProjects.js";
import { useRowKeyboardNav } from "../hooks/useRowKeyboardNav.js";
import type { CustomTab, Project, TrackStatus } from "../types.js";
import FilterToolbar from "./FilterToolbar.js";
import { ProjectsTable } from "./ProjectsTable.js";
import ProjectDetailPanel from "./ProjectDetailPanel.js";
import BatchEditPanel from "./BatchEditPanel.js";
import CopyMoveDeleteDialog from "./CopyMoveDeleteDialog.js";
import type { CopyMoveDeleteOperation, CopyMoveDeleteOutcome, CopyMoveDeleteTarget } from "./CopyMoveDeleteDialog.js";

type SortKey = NonNullable<ProjectFilters["sortBy"]>;

type Props = {
  tab: CustomTab;
  allTags: string[];
  /** App-level refresh for the header stats (draft/unscored counts). Status/tags handlers
   * below don't call it (those mutations don't change how many files are scored), but the
   * score handlers do: a project-score edit cascades onto its member
   * files' scores, which can turn a previously-unscored file into a scored one — mirroring
   * App.tsx's own handleProjectScoreSave/handleBatchProjectScore. Copy/Move/Delete are
   * different again: they add, relocate, or remove file rows outright, which can also change
   * the draft/unscored counts — so this panel's `handleProjectOpSuccess` below calls it too,
   * mirroring App.tsx's own `handleProjectOpSuccess`. */
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
  /** App-level banner setter (App.tsx's `setBanner`), used to surface a reveal failure the
   * same way App.tsx's own `handleReveal` does — see that function for the exact message. */
  setBanner: (message: string) => void;
  /** App.tsx's own `musicRoot` state (an absolute filesystem path, or `undefined` before
   * `api.getConfig()` resolves) — passed straight through to this panel's own
   * `CopyMoveDeleteDialog`, which needs it to convert the destination picker's root-relative
   * selection into the absolute path every copy/move backend route requires (and to convert
   * `excludedPath` the other way, absolute → relative, for the picker's exclusion check). */
  musicRoot: string | undefined;
};

export default function CustomProjectsTabPanel({
  tab,
  allTags,
  refreshStats,
  refreshTags,
  refetchFiles,
  scanCompletionSignal,
  setBanner,
  musicRoot,
}: Props) {
  const { projects, total, totalPages, page, pageSize, filters, updateFilters, setPage, loading, refetch } = useProjects({
    statuses: tab.statuses,
    scores: tab.scores,
    tags: tab.tags,
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  // Whether the detail panel is actually SHOWN for the currently-highlighted project — decoupled
  // from selectedProjectId, which also serves as a plain keyboard-navigable "cursor" independent
  // of the panel (see useRowKeyboardNav below and App.tsx's identical projectsDetailOpen for the
  // full rationale, including the invariant effect further down this file).
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [projectOpDialog, setProjectOpDialog] = useState<{ operation: CopyMoveDeleteOperation; target: CopyMoveDeleteTarget; excludedPath?: string } | null>(
    null
  );

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  useRowKeyboardNav({
    active: true,
    items: projects,
    selectedId: selectedProjectId,
    onSelect: setSelectedProjectId,
    onEnter: () => setDetailOpen(true),
    // No onSpace: projects have no playback concept, so Space falls back to onEnter.
  });

  useEffect(() => {
    if (!selectedProjectId) setDetailOpen(false);
  }, [selectedProjectId]);

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

  function handleSortChange(sortBy: SortKey) {
    handleFilterChange({
      sortBy,
      sortDir: filters.sortBy === sortBy && filters.sortDir === "asc" ? "desc" : "asc",
    });
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
    if (selectedProjectId === id) {
      setDetailOpen((open) => !open);
    } else {
      setSelectedProjectId(id);
      setDetailOpen(true);
    }
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
    refreshStats(); // the cascade can turn previously-unscored files into scored ones
  }

  // Notes aren't linked/cascaded to files (no aggregate concept), so this only refetches this
  // panel's own project list — mirrors App.tsx's own handleProjectNotesSave exactly.
  async function handleProjectNotesSave(id: string, notes: string) {
    await api.updateProjectNotes(id, notes);
    refetch();
  }

  async function handleBatchProjectScore(score: number | null) {
    await api.batchUpdateProjectScore([...selectedProjectIds], score);
    refetch();
    refetchFiles(); // score is linked: this was just cascaded onto each project's files
    refreshStats(); // the cascade can turn previously-unscored files into scored ones
  }

  async function handleBatchProjectTag(tag: string) {
    await api.batchAddProjectTags([...selectedProjectIds], [tag]);
    refetch();
    refetchFiles(); // tags are linked: this was just cascaded onto each project's files
    refreshTags();
  }

  function handleProjectOperation(operation: CopyMoveDeleteOperation, project: Project & { audioFileCount: number }) {
    setProjectOpDialog({ operation, target: { kind: "single", id: project.id, name: project.name }, excludedPath: project.path });
  }

  // Reuses the same projectOpDialog state/dialog as the single-item operation above —
  // CopyMoveDeleteTarget already has a "batch" variant. excludedPath is never set here
  // (batches have no single well-defined "own folder" — the ancestor/descendant case is
  // handled by BatchEditPanel's own excludeNestedProjectIds dedup before this is called).
  // Mirrors App.tsx's handleProjectsBatchOperation exactly.
  function handleBatchOperation(operation: CopyMoveDeleteOperation, ids: string[]) {
    setProjectOpDialog({ operation, target: { kind: "batch", ids, count: ids.length } });
  }

  // Mirrors App.tsx's copyMoveDeleteSuccessMessage: a single item is always 1/0 (see
  // CopyMoveDeleteOutcome's doc comment), so keeps the original singular wording; a batch
  // reports how many of the ids sent actually succeeded and calls out a partial failure.
  function projectOpSuccessMessage(operation: CopyMoveDeleteOperation, outcome: CopyMoveDeleteOutcome): string {
    const verb = operation === "copy" ? "copied" : operation === "move" ? "moved" : "moved to Trash";
    if (outcome.succeededCount === 1 && outcome.failedCount === 0) return `Folder ${verb}.`;
    if (outcome.failedCount === 0) return `${outcome.succeededCount} folders ${verb}.`;
    return `${outcome.succeededCount} of ${outcome.succeededCount + outcome.failedCount} folders ${verb}; ${outcome.failedCount} failed.`;
  }

  function handleProjectOpSuccess(outcome: CopyMoveDeleteOutcome) {
    const operation = projectOpDialog?.operation ?? "copy";
    // Mirrors App.tsx's handleProjectOpSuccess: a move/delete invalidates the id this panel's
    // detail view is keyed to, so close it; a copy leaves the original project/id untouched.
    // selectedProjectId is already null for a batch operation (the batch panel and detail
    // panel are never open at the same time), so this is a harmless no-op in that case.
    if (operation !== "copy") {
      setSelectedProjectId(null);
      // A move/delete invalidates every id in the batch selection too — see App.tsx's
      // identical comment on its own handleProjectOpSuccess.
      setSelectedProjectIds(new Set());
    }
    setBanner(projectOpSuccessMessage(operation, outcome));
    refetch();
    refetchFiles(); // a project's member files move/disappear along with it on move/delete
    refreshStats();
  }

  return (
    <>
      <FilterToolbar
        locked
        filters={filters}
        onChange={handleFilterChange}
        allTags={allTags}
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
        selectedId={selectedProjectId}
        selectedIds={selectedProjectIds}
        filters={filters}
        onPageChange={handlePageChange}
        onRowClick={handleProjectRowClick}
        onToggleSelect={toggleProjectSelect}
        onToggleSelectAll={toggleAllProjectSelect}
        onSortChange={handleSortChange}
      />

      <ProjectDetailPanel
        project={detailOpen ? selectedProject : null}
        allTags={allTags}
        onClose={() => setDetailOpen(false)}
        onReveal={handleReveal}
        onSaveStatus={handleProjectStatusSave}
        onSaveTags={handleProjectTagsSave}
        onSaveScore={handleProjectScoreSave}
        onSaveNotes={handleProjectNotesSave}
        onProjectOperation={handleProjectOperation}
      />

      <BatchEditPanel
        open={showBatchPanel}
        count={selectedProjectIds.size}
        itemLabel="project folder"
        allTags={allTags}
        itemType="projects"
        selectedIds={[...selectedProjectIds]}
        projectPaths={projects.map((p) => ({ id: p.id, path: p.path }))}
        onClose={() => setShowBatchPanel(false)}
        onApplyScore={handleBatchProjectScore}
        onApplyTag={handleBatchProjectTag}
        onBatchOperation={handleBatchOperation}
      />

      <CopyMoveDeleteDialog
        open={projectOpDialog !== null}
        operation={projectOpDialog?.operation ?? "copy"}
        itemType="projects"
        target={projectOpDialog?.target ?? { kind: "single", id: "", name: "" }}
        excludedPath={projectOpDialog?.excludedPath}
        musicRoot={musicRoot}
        onClose={() => setProjectOpDialog(null)}
        onSuccess={handleProjectOpSuccess}
        onError={setBanner}
      />
    </>
  );
}
