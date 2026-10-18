import { useEffect, useLayoutEffect, useState, type DragEvent } from "react";
import { useAudioFiles } from "./hooks/useAudioFiles.js";
import { useProjects } from "./hooks/useProjects.js";
import { useRowKeyboardNav } from "./hooks/useRowKeyboardNav.js";
import FilterBar from "./components/FilterBar.js";
import { FileTable } from "./components/FileTable.js";
import { Pagination } from "./components/Pagination.js";
import FileDetailPanel from "./components/FileDetailPanel.js";
import ProjectDetailPanel from "./components/ProjectDetailPanel.js";
import MetricsPanel from "./components/MetricsPanel.js";
import TagsStatusesPanel from "./components/TagsStatusesPanel.js";
import ScanFolderPanel from "./components/ScanFolderPanel.js";
import SettingsPanel from "./components/SettingsPanel.js";
import { ProjectsTable } from "./components/ProjectsTable.js";
import ProjectsFilterBar from "./components/ProjectsFilterBar.js";
import BatchEditPanel from "./components/BatchEditPanel.js";
import AudioPlayerBar from "./components/AudioPlayerBar.js";
import RootPathControl from "./components/RootPathControl.js";
import CreateCustomTabModal from "./components/CreateCustomTabModal.js";
import TabListPanel, { type TabListItem } from "./components/TabListPanel.js";
import DeleteTabConfirmDialog from "./components/DeleteTabConfirmDialog.js";
import CustomFilesTabPanel from "./components/CustomFilesTabPanel.js";
import CustomProjectsTabPanel from "./components/CustomProjectsTabPanel.js";
import CopyMoveDeleteDialog from "./components/CopyMoveDeleteDialog.js";
import Logo from "./components/Logo.js";
import SplashScreen from "./components/SplashScreen.js";
import type { CopyMoveDeleteOperation, CopyMoveDeleteOutcome, CopyMoveDeleteTarget } from "./components/CopyMoveDeleteDialog.js";
import * as api from "./api/client.js";
import type { FileFilters, LibraryStats, ProjectFilters, ScanStats } from "./api/client.js";
import type { AudioFile, CustomTab, Project, Theme, TrackStatus } from "./types.js";
import { StatusCatalogProvider } from "./contexts/StatusCatalogContext.js";
import { applyCatalogFilterEvent } from "./catalogFilterEvents.js";

type Tab = "projects" | "files" | number;

const THEME_STORAGE_KEY = "musicLibraryManager.theme";
const LEGACY_THEME_STORAGE_KEY = "musicLibraryManager.isDark";

/** Reads the persisted theme, migrating the legacy boolean-based key ("musicLibraryManager.isDark")
 * if the new key hasn't been written yet. If neither key is present, "profolder" (the new brand
 * theme) is the default. */
function loadStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "profolder" || stored === "light" || stored === "dark") return stored;
  const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  if (legacy === "true") return "dark";
  if (legacy === "false") return "light";
  return "profolder";
}

function tabRowClassName(sectionBorder: string): string {
  return `flex items-center gap-1 h-10 px-6 border-b ${sectionBorder}`;
}

/** Tab button classes for the default ("Project Folders"/"Audio Files") and custom tabs. Base
 * classes render an underline-style tab (border-b-2, -mb-px to sit flush against the row's own
 * border-b); `profolder:` variant classes override the structural bits (no underline offset, a
 * full rounded border instead) and swap the active/inactive colors to the accent/surface tokens.
 * Every property the profolder variant touches is also set by the base classes, so the variant's
 * higher-specificity `[data-theme="profolder"] &` selector always wins for that theme with no JS
 * branching needed — see `frontend/src/index.css`'s `@custom-variant profolder` and the "+" button
 * above for the same established pattern. */
function tabButtonClassName(active: boolean, theme?: string): string {
  // const py = "py-1";
  const py = theme === "profolder" ? "py-1" : "py-2.5";
  // flex-shrink-0: this renders inside the tab row's horizontally-scrolling inner container
  // (see the JSX below) — without it, flexbox would squeeze every tab's label to fit the
  // available width before the container's own overflow-x ever kicks in, instead of the
  // container just scrolling.
  const base =
    `flex-shrink-0 px-3 ${py} text-xs font-mono font-medium uppercase tracking-wider border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 profolder:border profolder:mb-0 profolder:rounded-[var(--rt-radius)]`;
  return active
    ? `${base} border-blue-500 text-blue-400 profolder:bg-accent profolder:text-accent-ink profolder:border-border`
    : `${base} border-transparent text-slate-500 hover:text-ink profolder:bg-surface profolder:text-ink-muted profolder:border-border`;
}

/** Banner text for a completed single-item copy/move/delete, shared by the default and
 * custom Files/Projects tabs. A single-item request either resolves as a full success
 * (outcome.succeededCount === 1) or throws (handled via onError, never onSuccess) — see
 * CopyMoveDeleteDialog's `runSingle`/doc comment — so no partial-failure wording is needed. */
function copyMoveDeleteSuccessMessage(operation: CopyMoveDeleteOperation, itemLabel: "File" | "Folder", outcome: CopyMoveDeleteOutcome): string {
  const verb = operation === "copy" ? "copied" : operation === "move" ? "moved" : "moved to Trash";
  // A single item resolves 1/0 or throws (see CopyMoveDeleteOutcome's doc comment) — keep the
  // original singular wording for that case unchanged. A batch reports how many of the ids
  // sent actually succeeded, so mention the count, and call out a partial failure explicitly
  // rather than silently reporting success for ids that failed.
  if (outcome.succeededCount === 1 && outcome.failedCount === 0) return `${itemLabel} ${verb}.`;
  const plural = `${itemLabel}s`;
  if (outcome.failedCount === 0) return `${outcome.succeededCount} ${plural} ${verb}.`;
  return `${outcome.succeededCount} of ${outcome.succeededCount + outcome.failedCount} ${plural} ${verb}; ${outcome.failedCount} failed.`;
}

export default function App() {
  const {
    files,
    total,
    totalPages,
    page,
    pageSize,
    filters,
    updateFilters,
    setPage,
    loading,
    error,
    refetch,
  } = useAudioFiles();

  const {
    projects,
    total: projectsTotal,
    totalPages: projectsTotalPages,
    page: projectsPage,
    pageSize: projectsPageSize,
    filters: projectFilters,
    updateFilters: updateProjectFilters,
    setPage: setProjectsPage,
    loading: projectsLoading,
    refetch: refetchProjects,
  } = useProjects();

  const [musicRoot, setMusicRoot] = useState<string | undefined>();
  const [lastScanChanges, setLastScanChanges] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | undefined>();
  const [theme, setTheme] = useState<Theme>(loadStoredTheme);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  // Whether the detail panel is actually SHOWN for the currently-highlighted row — decoupled
  // from selectedId/selectedProjectId, which now also serves as a plain keyboard-navigable
  // "cursor" independent of the panel (see useRowKeyboardNav below). Every other existing
  // `setSelectedId(null)`/`setSelectedProjectId(null)` call site elsewhere in this file still
  // correctly closes the panel too as a side effect (selectedFile/selectedProject become null,
  // and `file={filesDetailOpen ? selectedFile : null}` is null either way once selectedFile is),
  // so only the handlers that need "open/close without losing the highlight" reference these.
  const [filesDetailOpen, setFilesDetailOpen] = useState(false);
  const [projectsDetailOpen, setProjectsDetailOpen] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [stats, setStats] = useState<LibraryStats | undefined>();
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showTagsStatuses, setShowTagsStatuses] = useState(false);
  const [showScanPanel, setShowScanPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("projects");
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [showFilesBatchPanel, setShowFilesBatchPanel] = useState(false);
  const [showProjectsBatchPanel, setShowProjectsBatchPanel] = useState(false);
  const [fileOpDialog, setFileOpDialog] = useState<{ operation: CopyMoveDeleteOperation; target: CopyMoveDeleteTarget } | null>(null);
  const [projectOpDialog, setProjectOpDialog] = useState<{ operation: CopyMoveDeleteOperation; target: CopyMoveDeleteTarget; excludedPath?: string } | null>(null);
  const [playingFile, setPlayingFile] = useState<AudioFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [customTabs, setCustomTabs] = useState<CustomTab[]>([]);
  const [showCreateTabModal, setShowCreateTabModal] = useState(false);
  const [deletingTab, setDeletingTab] = useState<CustomTab | null>(null);
  const [showTabListPanel, setShowTabListPanel] = useState(false);
  // Custom-tab drag-and-drop reordering (native HTML5 drag events, not a library — the dragged
  // tab's id lives in this state, not in a dataTransfer payload, since reordering is purely
  // within this one list and never needs to leave the app). "Project Folders"/"Audio Files"
  // are not reorderable — they're not part of the `customTabs` array at all.
  const [draggedCustomTabId, setDraggedCustomTabId] = useState<number | null>(null);
  const [dragOverCustomTabId, setDragOverCustomTabId] = useState<number | null>(null);

  const selectedFile = files.find((f) => f.id === selectedId) ?? null;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const activeCustomTab = typeof activeTab === "number" ? customTabs.find((t) => t.id === activeTab) ?? null : null;
  // Same tabs, same order, as the tab bar itself (fixed tabs then custom tabs) — for the "All
  // Tabs" burger-button panel, which exists specifically so a tab scrolled out of the bar's own
  // view can still be jumped to directly.
  const allTabListItems: TabListItem[] = [
    { id: "projects", label: "Project Folders" },
    { id: "files", label: "Audio Files" },
    ...customTabs.map((tab) => ({ id: tab.id, label: tab.name })),
  ];

  useRowKeyboardNav({
    active: activeTab === "projects",
    items: projects,
    selectedId: selectedProjectId,
    onSelect: setSelectedProjectId,
    onEnter: () => setProjectsDetailOpen(true),
    // No onSpace: projects have no playback concept, so Space falls back to the hook's
    // "defaults to onEnter when onSpace is omitted" behavior — it just opens the panel too.
  });
  useRowKeyboardNav({
    active: activeTab === "files",
    items: files,
    selectedId,
    onSelect: setSelectedId,
    onEnter: () => setFilesDetailOpen(true),
    onSpace: (id) => {
      const file = files.find((f) => f.id === id);
      if (file) handlePlayClick(file);
    },
  });

  // Enforces "the detail panel can only be open while something is highlighted" — many existing
  // call sites elsewhere in this file clear selectedId/selectedProjectId to null (deleting the
  // selected row, opening an unrelated panel like Settings/Scan, switching tabs, etc.) without
  // themselves knowing about filesDetailOpen/projectsDetailOpen. Without this, one of those could
  // leave a stale `true` behind, and a LATER arrow-key press (which can re-populate selectedId
  // from nothing, see useRowKeyboardNav) would make the panel pop open unannounced, despite only
  // Enter/Space/click ever being allowed to actually open it.
  useEffect(() => {
    if (!selectedId) setFilesDetailOpen(false);
  }, [selectedId]);
  useEffect(() => {
    if (!selectedProjectId) setProjectsDetailOpen(false);
  }, [selectedProjectId]);

  function refreshStats() {
    api.getStats().then(setStats).catch(() => {});
  }

  function refreshTags() {
    api.getAllTags().then(setAllTags).catch(() => {});
  }

  // Tag rename/delete can leave already-fetched file/project rows' `tags` arrays stale
  // (rename: old name string still shown; delete: cascaded tag still shown until refetched).
  // Tag create is a harmless extra fetch, consistent with this file's over-fetch-for-simplicity convention.
  function handleTagCatalogChanged() {
    refreshTags();
    refetch();
    refetchProjects();
  }

  // Status delete reassigns any row holding that key to "unknown" server-side; already-fetched
  // rows still show the old (now-deleted) key until refetched. Status create/edit only ever change
  // the catalog entry's name/color, which StatusBadge/pickers already read live from Context, so no
  // row-level refetch is needed there (and none is wired for it).
  //
  // It also has to prune the deleted key out of the Files/Projects tabs' own active filters, if
  // either currently has it selected — otherwise the filter chip is left pointing at a key that no
  // longer exists in the catalog, silently showing 0 results with no way to clear just that one
  // filter (see catalogFilterEvents.ts's doc comment).
  function handleStatusDeleted(key: string) {
    const filesPatch = applyCatalogFilterEvent(filters, { kind: "statusDeleted", key });
    const projectsPatch = applyCatalogFilterEvent(projectFilters, { kind: "statusDeleted", key });
    if (filesPatch) updateFilters(filesPatch);
    if (projectsPatch) updateProjectFilters(projectsPatch);
    refetch();
    refetchProjects();
    refreshStats();
  }

  // Same filter-pruning concern as handleStatusDeleted above, but for tag delete/rename. No extra
  // refetch/refreshStats calls needed here beyond the filter update itself — handleTagCatalogChanged
  // (still wired to onTagsChanged, called alongside these for every tag mutation) already refetches
  // row/stat data.
  function handleTagDeleted(name: string) {
    const filesPatch = applyCatalogFilterEvent(filters, { kind: "tagDeleted", name });
    const projectsPatch = applyCatalogFilterEvent(projectFilters, { kind: "tagDeleted", name });
    if (filesPatch) updateFilters(filesPatch);
    if (projectsPatch) updateProjectFilters(projectsPatch);
  }

  function handleTagRenamed(oldName: string, newName: string) {
    const filesPatch = applyCatalogFilterEvent(filters, { kind: "tagRenamed", oldName, newName });
    const projectsPatch = applyCatalogFilterEvent(projectFilters, { kind: "tagRenamed", oldName, newName });
    if (filesPatch) updateFilters(filesPatch);
    if (projectsPatch) updateProjectFilters(projectsPatch);
  }

  useEffect(() => {
    api.getConfig().then((c) => setMusicRoot(c.musicRoot)).catch(() => {});
    api
      .getLastScan()
      .then((s) => s && setLastScanChanges(s.newFiles + s.modifiedFiles + s.removedFiles))
      .catch(() => {});
    refreshStats();
    refreshTags();
    api.getCustomTabs().then(setCustomTabs).catch(() => {});
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  function handleScanComplete(stats: ScanStats) {
    setLastScanChanges(stats.newFiles + stats.modifiedFiles + stats.removedFiles);
    setBanner(
      `Scan complete: ${stats.audioFilesFound} audio files (${stats.newFiles} new, ${stats.modifiedFiles} modified, ${stats.removedFiles} removed).`
    );
    refetch();
    refreshStats();
    refetchProjects();
  }

  async function handleFileStatusSave(id: string, status: TrackStatus) {
    await api.updateStatus(id, status);
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1600);
    refetch();
    refreshStats();
  }

  async function handleFileTagsSave(id: string, tags: string[]) {
    await api.updateTags(id, tags);
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1600);
    refetch();
    refetchProjects(); // tags are linked: this may have changed the file's project's tags too
    refreshTags();
  }

  async function handleFileScoreSave(id: string, score: number | null) {
    await api.updateFileScore(id, score);
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1600);
    refetch();
    refreshStats();
    refetchProjects(); // score is linked: this may have changed the file's project's score too
  }

  // Notes aren't an aggregated/linked field the way score/tags are (no project-level
  // "aggregate notes" concept), so unlike the handlers above this only refetches its own list.
  async function handleFileNotesSave(id: string, notes: string) {
    await api.updateFileNotes(id, notes);
    refetch();
  }

  async function handleProjectStatusSave(id: string, status: TrackStatus) {
    await api.updateProjectStatus(id, status);
    refetchProjects();
  }

  async function handleProjectTagsSave(id: string, tags: string[]) {
    await api.updateProjectTags(id, tags);
    refetchProjects();
    refetch(); // tags are linked: this was just cascaded onto the project's files
    refreshTags();
  }

  async function handleProjectScoreSave(id: string, score: number | null) {
    await api.updateProjectScore(id, score);
    refetchProjects();
    refetch(); // score is linked: this was just cascaded onto the project's files
    refreshStats(); // the cascade can turn previously-unscored files into scored ones
  }

  // Notes aren't linked/cascaded to files (no aggregate concept), so this only refetches projects.
  async function handleProjectNotesSave(id: string, notes: string) {
    await api.updateProjectNotes(id, notes);
    refetchProjects();
  }

  function toggleFileSelect(id: string) {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFileSelect() {
    setSelectedFileIds((prev) => (files.every((f) => prev.has(f.id)) && files.length > 0 ? new Set() : new Set(files.map((f) => f.id))));
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

  function handleFilesFilterChange(patch: Parameters<typeof updateFilters>[0]) {
    updateFilters(patch);
    setSelectedFileIds(new Set());
  }

  function handleFilesPageChange(nextPage: number) {
    setPage(nextPage);
    setSelectedFileIds(new Set());
  }

  function handleProjectsFilterChange(patch: Parameters<typeof updateProjectFilters>[0]) {
    updateProjectFilters(patch);
    setSelectedProjectIds(new Set());
  }

  function handleProjectsPageChange(nextPage: number) {
    setProjectsPage(nextPage);
    setSelectedProjectIds(new Set());
  }

  async function handleBatchFileScore(score: number | null) {
    await api.batchUpdateFileScore([...selectedFileIds], score);
    refetch();
    refreshStats();
    refetchProjects(); // score is linked: this may have changed the affected projects' scores too
  }

  async function handleBatchFileTag(tag: string) {
    await api.batchAddFileTags([...selectedFileIds], [tag]);
    refetch();
    refetchProjects(); // tags are linked: this may have changed the affected projects' tags too
    refreshTags();
  }

  async function handleBatchProjectScore(score: number | null) {
    await api.batchUpdateProjectScore([...selectedProjectIds], score);
    refetchProjects();
    refetch(); // score is linked: this was just cascaded onto each project's files
    refreshStats(); // the cascade can turn previously-unscored files into scored ones
  }

  async function handleBatchProjectTag(tag: string) {
    await api.batchAddProjectTags([...selectedProjectIds], [tag]);
    refetchProjects();
    refetch(); // tags are linked: this was just cascaded onto each project's files
    refreshTags();
  }

  async function handleRootPathSave(newPath: string) {
    const { musicRoot: resolved } = await api.setMusicRoot(newPath);
    setMusicRoot(resolved);
    setBanner("Production folder updated. Open Prod Folder and run a scan to index the new location.");
  }

  async function handleReveal(path: string) {
    try {
      await api.reveal(path);
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Could not reveal in Finder");
    }
  }

  function handleFileOperation(operation: CopyMoveDeleteOperation, file: AudioFile) {
    setFileOpDialog({ operation, target: { kind: "single", id: file.id, name: file.filename } });
  }

  function handleProjectOperation(operation: CopyMoveDeleteOperation, project: Project & { audioFileCount: number }) {
    // excludedPath is only meaningful for a project move (see CopyMoveDeleteDialog's doc
    // comment) but harmless to pass for copy/delete too, since it's not forwarded there.
    setProjectOpDialog({ operation, target: { kind: "single", id: project.id, name: project.name }, excludedPath: project.path });
  }

  // Reuses the same fileOpDialog/projectOpDialog state and handlers as the single-item
  // operations above — CopyMoveDeleteTarget already has a "batch" variant, so nothing else
  // needs to change to support the batch case. excludedPath is never set here (batches have
  // no single well-defined "own folder" — see excludeNestedProjectIds' doc comment in
  // BatchEditPanel.tsx for how the ancestor/descendant case is handled instead).
  function handleFilesBatchOperation(operation: CopyMoveDeleteOperation, ids: string[]) {
    setFileOpDialog({ operation, target: { kind: "batch", ids, count: ids.length } });
  }

  function handleProjectsBatchOperation(operation: CopyMoveDeleteOperation, ids: string[]) {
    setProjectOpDialog({ operation, target: { kind: "batch", ids, count: ids.length } });
  }

  function handleFileOpSuccess(outcome: CopyMoveDeleteOutcome) {
    const operation = fileOpDialog?.operation ?? "copy";
    // A move changes the file's id; a delete removes it entirely — either way the panel is
    // keyed to an id that no longer refers to the (still-open) item, so close it. A copy
    // leaves the original file/id untouched, so the panel can stay open as-is. selectedId is
    // already null for a batch operation (the batch panel and detail panel are never open at
    // the same time), so this is a harmless no-op in that case.
    if (operation !== "copy") {
      setSelectedId(null);
      // A move/delete invalidates every id in the batch selection too (moved ids change,
      // deleted ids no longer exist) — without this, the batch panel keeps showing a stale
      // "N selected" count and a follow-up batch action silently resends already-processed
      // ids. A copy leaves the originals untouched, so selection
      // staying intact there is fine (and arguably useful — same items are still valid).
      setSelectedFileIds(new Set());
    }
    setBanner(copyMoveDeleteSuccessMessage(operation, "File", outcome));
    refetch();
    refreshStats();
    refetchProjects(); // a file's project membership/aggregate counts can shift on copy/move/delete
  }

  function handleProjectOpSuccess(outcome: CopyMoveDeleteOutcome) {
    const operation = projectOpDialog?.operation ?? "copy";
    if (operation !== "copy") {
      setSelectedProjectId(null);
      // See handleFileOpSuccess's identical comment above.
      setSelectedProjectIds(new Set());
    }
    setBanner(copyMoveDeleteSuccessMessage(operation, "Folder", outcome));
    refetchProjects();
    refetch(); // a project's member files move/disappear along with it on move/delete
    refreshStats();
  }

  function handlePlayClick(file: AudioFile) {
    if (playingFile?.id === file.id) {
      setIsPlaying((p) => !p);
    } else {
      setPlayingFile(file);
      setIsPlaying(true);
    }
  }

  function handleClosePlayer() {
    setPlayingFile(null);
    setIsPlaying(false);
  }

  // Clicking the already-highlighted (and open) row toggles the panel closed, keeping the
  // highlight so keyboard navigation can continue from there; clicking any other row selects
  // it and opens the panel — matches handleProjectRowClick below exactly, just for files.
  function handleRowClick(id: string) {
    setSelectedProjectId(null);
    setProjectsDetailOpen(false);
    setShowFilesBatchPanel(false);
    if (selectedId === id) {
      setFilesDetailOpen((open) => !open);
    } else {
      setSelectedId(id);
      setFilesDetailOpen(true);
    }
  }

  function handleProjectRowClick(id: string) {
    setSelectedId(null);
    setFilesDetailOpen(false);
    setShowProjectsBatchPanel(false);
    if (selectedProjectId === id) {
      setProjectsDetailOpen((open) => !open);
    } else {
      setSelectedProjectId(id);
      setProjectsDetailOpen(true);
    }
  }

  function handleTabChange(tab: Tab) {
    setSelectedId(null);
    setSelectedProjectId(null);
    setSelectedFileIds(new Set());
    setSelectedProjectIds(new Set());
    setActiveTab(tab);
  }

  function handleCustomTabCreated(tab: CustomTab) {
    setCustomTabs((prev) => [...prev, tab]);
    handleTabChange(tab.id);
  }

  async function handleDeleteTabConfirm() {
    if (!deletingTab) return;
    const id = deletingTab.id;
    try {
      await api.deleteCustomTab(id);
      setCustomTabs((prev) => prev.filter((t) => t.id !== id));
      if (activeTab === id) handleTabChange("projects");
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Failed to delete tab");
    } finally {
      setDeletingTab(null);
    }
  }

  function handleCustomTabDragStart(e: DragEvent<HTMLElement>, id: number) {
    // Spec-compliance only — some browsers (Firefox) refuse to start a drag at all without
    // at least one setData call, even though nothing here ever reads it back (the dragged
    // tab's identity is tracked via component state instead, not the dataTransfer payload).
    // Optional chaining because jsdom's synthesized DragEvent in unit tests doesn't always
    // populate dataTransfer the way a real browser drag does.
    e.dataTransfer?.setData("text/plain", String(id));
    setDraggedCustomTabId(id);
  }

  function handleCustomTabDragOver(e: DragEvent<HTMLElement>, id: number) {
    e.preventDefault(); // required for a subsequent onDrop to fire at all
    if (draggedCustomTabId !== null && id !== draggedCustomTabId) setDragOverCustomTabId(id);
  }

  function handleCustomTabDragEnd() {
    setDraggedCustomTabId(null);
    setDragOverCustomTabId(null);
  }

  /** Reorders `customTabs` optimistically, then persists via reorderCustomTabs — rolled back
   * to the pre-drop order if the request fails (same optimistic-update-with-rollback shape as
   * e.g. handleFileStatusSave elsewhere in this file). A plain remove-then-reinsert-at-the-
   * target's-index move (standard, unadjusted splice reordering): this always produces the
   * intuitive swap for the simplest two-tab case regardless of which one is dragged onto the
   * other, which is the first thing most people try. For longer lists it has the usual simple-
   * reorder asymmetry — dragging forward lands the tab just after the target, dragging
   * backward lands it just before — since removing the dragged tab first shifts every later
   * index down by one before the insert happens. */
  function handleCustomTabDrop(targetId: number) {
    const draggedId = draggedCustomTabId;
    setDraggedCustomTabId(null);
    setDragOverCustomTabId(null);
    if (draggedId === null || draggedId === targetId) return;

    const previousOrder = customTabs;
    const draggedIndex = previousOrder.findIndex((t) => t.id === draggedId);
    const targetIndex = previousOrder.findIndex((t) => t.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = [...previousOrder];
    const [draggedTab] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, draggedTab!);
    setCustomTabs(reordered);

    api.reorderCustomTabs(reordered.map((t) => t.id)).catch(() => setCustomTabs(previousOrder));
  }

  function handleSortChange(sortBy: NonNullable<FileFilters["sortBy"]>) {
    handleFilesFilterChange({
      sortBy,
      sortDir: filters.sortBy === sortBy && filters.sortDir === "asc" ? "desc" : "asc",
    });
  }

  function handleProjectSortChange(sortBy: NonNullable<ProjectFilters["sortBy"]>) {
    handleProjectsFilterChange({
      sortBy,
      sortDir: projectFilters.sortBy === sortBy && projectFilters.sortDir === "asc" ? "desc" : "asc",
    });
  }

  const sectionBorder = "border-border";

  return (
    <StatusCatalogProvider>
      <div className="h-screen overflow-hidden flex flex-col bg-canvas">
        <SplashScreen />

        <header className="border-b border-border bg-chrome/90 px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-20 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Logo size={28} />
            <div>
              <h1 className="text-sm font-semibold text-chrome-ink">ProFolder</h1>
            </div>

            <div className={`border-l pl-3 ${sectionBorder}`}>
              <RootPathControl musicRoot={musicRoot} onSave={handleRootPathSave} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setSelectedId(null);
                setSelectedProjectId(null);
                setShowSettings(false);
                setShowFilesBatchPanel(false);
                setShowProjectsBatchPanel(false);
                setShowScanPanel(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 profolder:bg-surface-selected profolder:hover:bg-surface-selected profolder:text-chrome-ink-secondary profolder:border profolder:border-chrome-ink-secondary"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Scan Library
            </button>

            <div className="relative">
              <button
                onClick={() => setShowTagsStatuses((v) => !v)}
                aria-label="Statuses and tags"
                aria-expanded={showTagsStatuses}
                aria-haspopup="dialog"
                className="flex items-center gap-1.5 px-3 py-1.5 pr-[6px] pl-[6px] rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-chrome-border text-chrome-ink-secondary hover:text-chrome-ink hover:border-chrome-border-hover"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                </svg>
              </button>
              {showTagsStatuses && (
                <TagsStatusesPanel
                  allTags={allTags}
                  onClose={() => setShowTagsStatuses(false)}
                  onTagsChanged={handleTagCatalogChanged}
                  onStatusDeleted={handleStatusDeleted}
                  onTagDeleted={handleTagDeleted}
                  onTagRenamed={handleTagRenamed}
                />
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setShowMetrics((v) => !v)}
                aria-label="Metrics"
                aria-expanded={showMetrics}
                aria-haspopup="dialog"
                className="flex items-center gap-1.5 px-3 py-1.5 pr-[6px] pl-[6px] rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-chrome-border text-chrome-ink-secondary hover:text-chrome-ink hover:border-chrome-border-hover"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5h3v6H3v-6zM10.5 7.5h3v12h-3v-12zM18 10.5h3v9h-3v-9z" />
                </svg>
              </button>
              {showMetrics && (
                <MetricsPanel
                  stats={stats}
                  lastScanChanges={lastScanChanges}
                  allTags={allTags}
                  onClose={() => setShowMetrics(false)}
                />
              )}
            </div>

            <button
              onClick={() => {
                setSelectedId(null);
                setSelectedProjectId(null);
                setShowScanPanel(false);
                setShowFilesBatchPanel(false);
                setShowProjectsBatchPanel(false);
                setShowSettings(true);
              }}
              aria-label="Settings"
              className="flex items-center gap-1.5 px-3 pr-[6px] pl-[6px] py-1.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-chrome-border text-chrome-ink-secondary hover:text-chrome-ink hover:border-chrome-border-hover"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.559-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </header>

        <div className="bg-chrome-light flex flex-col flex-1 min-h-39">
          <div className={tabRowClassName(sectionBorder)}>
            <button
              onClick={() => setShowCreateTabModal(true)}
              aria-label="Create custom tab"
              title="Create custom tab"
              className="w-[26px] h-[26px] flex items-center justify-center mr-1 flex-shrink-0 rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover profolder:bg-surface-selected profolder:text-black profolder:border-1 profolder:border-black"
            >
              +
            </button>

            {/* Horizontal-scroll, not wrap: stays outside this on purpose so the "+" button
                above is always reachable regardless of scroll position. min-w-0 is required
                for a flex child to ever actually shrink below its content width — without it,
                overflow-x-auto has no effect and the row just grows past the header instead.
                scrollbar-hidden (index.css) hides the scrollbar chrome itself — still fully
                scrollable by drag/wheel/trackpad, just without a visible track/thumb taking up
                this already-compact row's vertical space. */}
            <div className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0 scrollbar-hidden">
              {(
                [
                  ["projects", "Project Folders"],
                  ["files", "Audio Files"],
                ] as [Tab, string][]
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  aria-current={activeTab === tab}
                  className={tabButtonClassName(activeTab === tab, theme)}
                >
                  {label}
                </button>
              ))}

              {customTabs.map((tab) => (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={(e) => handleCustomTabDragStart(e, tab.id)}
                  onDragOver={(e) => handleCustomTabDragOver(e, tab.id)}
                  onDrop={(e) => {
                    e.preventDefault(); // best-practice spec compliance, mirroring onDragOver
                    handleCustomTabDrop(tab.id);
                  }}
                  onDragEnd={handleCustomTabDragEnd}
                  className={`flex items-center ${tabButtonClassName(activeTab === tab.id, theme)} ${
                    draggedCustomTabId === tab.id ? "opacity-40" : ""
                  } ${dragOverCustomTabId === tab.id ? "ring-2 ring-blue-500" : ""}`}
                >
                  <button
                    onClick={() => handleTabChange(tab.id)}
                    aria-current={activeTab === tab.id}
                  >
                    {tab.name}
                  </button>
                  <button
                    onClick={() => setDeletingTab(tab)}
                    aria-label={`Delete tab ${tab.name}`}
                    title={`Delete tab ${tab.name}`}
                    className="flex items-center justify-center w-4 h-4 ml-1 rounded-[var(--rt-radius)] text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-ink-muted hover:text-ink hover:bg-surface-hover"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Full-row-height border-l (not just on the button itself) so the vertical
                separator actually reads as dividing the scrollable tabs from this button,
                rather than a short rule floating next to it. */}
            <div className="flex items-center h-full pl-2 ml-1 flex-shrink-0 border-l border-border">
              <button
                onClick={() => setShowTabListPanel(true)}
                aria-label="Show all tabs"
                aria-expanded={showTabListPanel}
                aria-haspopup="dialog"
                title="Show all tabs"
                className="flex items-center justify-center w-6 h-6 rounded-[var(--rt-radius)] text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                </svg>
              </button>
            </div>
          </div>

          {banner && (
            <div className="mx-6 mt-3 px-3 py-2 rounded-[var(--rt-radius)] text-xs font-mono bg-info-surface text-info">
              {banner}
            </div>
          )}

          {activeTab === "projects" ? (
            <>
              <ProjectsFilterBar
                filters={projectFilters}
                onChange={handleProjectsFilterChange}
                allTags={allTags}
                resultLabel={projectsLoading ? "—" : `${projects.length} of ${projectsTotal} projects`}
                selectedCount={selectedProjectIds.size}
                onOpenBatchPanel={() => {
                  setSelectedProjectId(null);
                  setShowProjectsBatchPanel(true);
                }}
              />
              <ProjectsTable
                projects={projects}
                total={projectsTotal}
                totalPages={projectsTotalPages}
                page={projectsPage}
                pageSize={projectsPageSize}
                loading={projectsLoading}
                selectedId={selectedProjectId}
                selectedIds={selectedProjectIds}
                filters={projectFilters}
                onPageChange={handleProjectsPageChange}
                onRowClick={handleProjectRowClick}
                onToggleSelect={toggleProjectSelect}
                onToggleSelectAll={toggleAllProjectSelect}
                onSortChange={handleProjectSortChange}
              />
            </>
          ) : activeTab === "files" ? (
            <>
              <FilterBar
                filters={filters}
                onChange={handleFilesFilterChange}
                allTags={allTags}
                resultLabel={loading ? "—" : `${files.length} of ${total} files`}
                selectedCount={selectedFileIds.size}
                onOpenBatchPanel={() => {
                  setSelectedId(null);
                  setShowFilesBatchPanel(true);
                }}
              />

              {error && (
                <div className="mx-6 mt-3 px-3 py-2 rounded-[var(--rt-radius)] text-xs font-mono bg-danger-surface text-danger">
                  {error}
                </div>
              )}

              <main className="flex-1 overflow-auto" aria-live="polite" aria-label="Audio file library">
                <FileTable
                  files={files}
                  filters={filters}
                  loading={loading}
                  flashId={flashId}
                  selectedId={selectedId}
                  selectedIds={selectedFileIds}
                  playingFileId={playingFile?.id ?? null}
                  isPlaying={isPlaying}
                  onSortChange={handleSortChange}
                  onRowClick={handleRowClick}
                  onClearFilters={() => handleFilesFilterChange({ search: undefined, statuses: undefined, scores: undefined, tags: undefined, association: undefined, sortBy: undefined, sortDir: undefined })}
                  onToggleSelect={toggleFileSelect}
                  onToggleSelectAll={toggleAllFileSelect}
                  onPlayClick={handlePlayClick}
                />
              </main>
              <footer>
                <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={handleFilesPageChange} />
              </footer>
            </>
          ) : (
            activeCustomTab &&
            (activeCustomTab.type === "files" ? (
              <CustomFilesTabPanel
                key={`custom-${activeCustomTab.id}`}
                tab={activeCustomTab}
                allTags={allTags}
                refreshStats={refreshStats}
                refreshTags={refreshTags}
                refetchProjects={refetchProjects}
                scanCompletionSignal={lastScanChanges}
                playingFileId={playingFile?.id ?? null}
                isPlaying={isPlaying}
                onPlayClick={handlePlayClick}
                setBanner={setBanner}
                musicRoot={musicRoot}
              />
            ) : (
              <CustomProjectsTabPanel
                key={`custom-${activeCustomTab.id}`}
                tab={activeCustomTab}
                allTags={allTags}
                refreshStats={refreshStats}
                refreshTags={refreshTags}
                refetchFiles={refetch}
                scanCompletionSignal={lastScanChanges}
                setBanner={setBanner}
                musicRoot={musicRoot}
              />
            ))
          )}
        </div>

        <AudioPlayerBar
          file={playingFile}
          isPlaying={isPlaying}
          onPlayingChange={setIsPlaying}
          onClose={handleClosePlayer}
        />

        <FileDetailPanel
          file={filesDetailOpen ? selectedFile : null}
          allTags={allTags}
          onClose={() => setFilesDetailOpen(false)}
          onSaveStatus={handleFileStatusSave}
          onSaveTags={handleFileTagsSave}
          onSaveScore={handleFileScoreSave}
          onSaveNotes={handleFileNotesSave}
          onReveal={handleReveal}
          onFileOperation={handleFileOperation}
          playingFileId={playingFile?.id ?? null}
          isPlaying={isPlaying}
          onPlayClick={handlePlayClick}
        />

        <ProjectDetailPanel
          project={projectsDetailOpen ? selectedProject : null}
          allTags={allTags}
          onClose={() => setProjectsDetailOpen(false)}
          onReveal={handleReveal}
          onSaveStatus={handleProjectStatusSave}
          onSaveTags={handleProjectTagsSave}
          onSaveScore={handleProjectScoreSave}
          onSaveNotes={handleProjectNotesSave}
          onProjectOperation={handleProjectOperation}
        />

        <CopyMoveDeleteDialog
          open={fileOpDialog !== null}
          operation={fileOpDialog?.operation ?? "copy"}
          itemType="files"
          target={fileOpDialog?.target ?? { kind: "single", id: "", name: "" }}
          musicRoot={musicRoot}
          onClose={() => setFileOpDialog(null)}
          onSuccess={handleFileOpSuccess}
          onError={setBanner}
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

        <ScanFolderPanel
          open={showScanPanel}
          musicRoot={musicRoot}
          onClose={() => setShowScanPanel(false)}
          onScanComplete={handleScanComplete}
          onScanStart={() => setBanner(undefined)}
        />

        <SettingsPanel
          theme={theme}
          setTheme={setTheme}
          open={showSettings}
          onClose={() => setShowSettings(false)}
        />

        <TabListPanel
          open={showTabListPanel}
          tabs={allTabListItems}
          activeTabId={activeTab}
          onSelect={(id) => handleTabChange(id as Tab)}
          onClose={() => setShowTabListPanel(false)}
        />

        <BatchEditPanel
          open={showFilesBatchPanel}
          count={selectedFileIds.size}
          itemLabel="audio file"
          allTags={allTags}
          itemType="files"
          selectedIds={[...selectedFileIds]}
          onClose={() => setShowFilesBatchPanel(false)}
          onApplyScore={handleBatchFileScore}
          onApplyTag={handleBatchFileTag}
          onBatchOperation={handleFilesBatchOperation}
        />

        <BatchEditPanel
          open={showProjectsBatchPanel}
          count={selectedProjectIds.size}
          itemLabel="project folder"
          allTags={allTags}
          itemType="projects"
          selectedIds={[...selectedProjectIds]}
          projectPaths={projects.map((p) => ({ id: p.id, path: p.path }))}
          onClose={() => setShowProjectsBatchPanel(false)}
          onApplyScore={handleBatchProjectScore}
          onApplyTag={handleBatchProjectTag}
          onBatchOperation={handleProjectsBatchOperation}
        />

        <CreateCustomTabModal
          open={showCreateTabModal}
          allTags={allTags}
          onClose={() => setShowCreateTabModal(false)}
          onCreated={handleCustomTabCreated}
        />

        <DeleteTabConfirmDialog
          open={deletingTab !== null}
          tabName={deletingTab?.name ?? ""}
          onConfirm={handleDeleteTabConfirm}
          onCancel={() => setDeletingTab(null)}
        />
      </div>
    </StatusCatalogProvider>
  );
}
