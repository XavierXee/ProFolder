import { useEffect, useLayoutEffect, useState } from "react";
import { useAudioFiles } from "./hooks/useAudioFiles.js";
import { useProjects } from "./hooks/useProjects.js";
import FilterBar from "./components/FilterBar.js";
import { FileTable } from "./components/FileTable.js";
import { Pagination } from "./components/Pagination.js";
import FileDetailPanel from "./components/FileDetailPanel.js";
import ProjectDetailPanel from "./components/ProjectDetailPanel.js";
import MetricsPanel from "./components/MetricsPanel.js";
import ScanFolderPanel from "./components/ScanFolderPanel.js";
import SettingsPanel from "./components/SettingsPanel.js";
import { ProjectsTable } from "./components/ProjectsTable.js";
import ProjectsFilterBar from "./components/ProjectsFilterBar.js";
import BatchEditPanel from "./components/BatchEditPanel.js";
import AudioPlayerBar from "./components/AudioPlayerBar.js";
import RootPathControl from "./components/RootPathControl.js";
import CreateCustomTabModal from "./components/CreateCustomTabModal.js";
import DeleteTabConfirmDialog from "./components/DeleteTabConfirmDialog.js";
import CustomFilesTabPanel from "./components/CustomFilesTabPanel.js";
import CustomProjectsTabPanel from "./components/CustomProjectsTabPanel.js";
import CopyMoveDeleteDialog from "./components/CopyMoveDeleteDialog.js";
import { ThemeSelector } from "./components/ThemeSelector.js";
import Logo from "./components/Logo.js";
import type { CopyMoveDeleteOperation, CopyMoveDeleteOutcome, CopyMoveDeleteTarget } from "./components/CopyMoveDeleteDialog.js";
import * as api from "./api/client.js";
import type { FileFilters, LibraryStats, ProjectFilters, ScanStats } from "./api/client.js";
import type { AudioFile, CustomTab, Project, TrackStatus } from "./types.js";

type Tab = "projects" | "files" | number;

type Theme = "profolder" | "light" | "dark";

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
  const isDark = theme !== "light";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [stats, setStats] = useState<LibraryStats | undefined>();
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showMetrics, setShowMetrics] = useState(false);
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

  const selectedFile = files.find((f) => f.id === selectedId) ?? null;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const activeCustomTab = typeof activeTab === "number" ? customTabs.find((t) => t.id === activeTab) ?? null : null;

  function refreshStats() {
    api.getStats().then(setStats).catch(() => {});
  }

  function refreshTags() {
    api.getAllTags().then(setAllTags).catch(() => {});
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
    if (operation !== "copy") setSelectedId(null);
    setBanner(copyMoveDeleteSuccessMessage(operation, "File", outcome));
    refetch();
    refreshStats();
    refetchProjects(); // a file's project membership/aggregate counts can shift on copy/move/delete
  }

  function handleProjectOpSuccess(outcome: CopyMoveDeleteOutcome) {
    const operation = projectOpDialog?.operation ?? "copy";
    if (operation !== "copy") setSelectedProjectId(null);
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

  function handleRowClick(id: string) {
    setSelectedProjectId(null);
    setShowFilesBatchPanel(false);
    setSelectedId((prev) => (prev === id ? null : id));
  }

  function handleProjectRowClick(id: string) {
    setSelectedId(null);
    setShowProjectsBatchPanel(false);
    setSelectedProjectId((prev) => (prev === id ? null : id));
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
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="border-b border-border bg-canvas/90 px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-20 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Logo size={28} />
          <div>
            <h1 className={`text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>ProFolder</h1>
            <p className={`text-xs font-mono ${isDark ? "text-slate-600" : "text-slate-400"}`}>Local Scan Console</p>
          </div>

          <div className={`border-l pl-3 ${sectionBorder}`}>
            <RootPathControl musicRoot={musicRoot} isDark={isDark} onSave={handleRootPathSave} />
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
            className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Prod Folder
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMetrics((v) => !v)}
              aria-expanded={showMetrics}
              aria-haspopup="dialog"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isDark ? "border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20" : "border-black/10 text-slate-600 hover:text-slate-900 hover:border-black/20"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5h3v6H3v-6zM10.5 7.5h3v12h-3v-12zM18 10.5h3v9h-3v-9z" />
              </svg>
              Metrics
              {stats && stats.unscoredCount > 0 && (
                <span className={`px-1.5 rounded-full text-[10px] ${isDark ? "bg-purple-500/20 text-purple-300" : "bg-purple-100 text-purple-700"}`}>
                  {stats.unscoredCount}
                </span>
              )}
            </button>
            {showMetrics && (
              <MetricsPanel stats={stats} lastScanChanges={lastScanChanges} isDark={isDark} onClose={() => setShowMetrics(false)} />
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isDark ? "border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20" : "border-black/10 text-slate-600 hover:text-slate-900 hover:border-black/20"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.559-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>

          <div className={`border-l pl-4 ${sectionBorder}`}>
            <ThemeSelector value={theme} onChange={setTheme} />
          </div>
        </div>
      </header>

      <div className="flex flex-col flex-1 min-h-0">
        <div className={`flex items-center gap-1 px-6 border-b ${sectionBorder}`}>
          <button
            onClick={() => setShowCreateTabModal(true)}
            aria-label="Create custom tab"
            title="Create custom tab"
            className={`flex items-center justify-center w-6 h-6 mr-1 rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isDark
                ? "border-white/10 text-slate-500 hover:text-slate-200 hover:bg-white/8 hover:border-white/20"
                : "border-black/10 text-slate-400 hover:text-slate-700 hover:bg-black/5 hover:border-black/20"
            }`}
          >
            +
          </button>

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
              className={`px-3 py-2.5 text-xs font-mono font-medium uppercase tracking-wider border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                activeTab === tab
                  ? "border-blue-500 text-blue-400"
                  : isDark
                    ? "border-transparent text-slate-500 hover:text-slate-300"
                    : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}

          {customTabs.map((tab) => (
            <div key={tab.id} className="flex items-center">
              <button
                onClick={() => handleTabChange(tab.id)}
                aria-current={activeTab === tab.id}
                className={`px-3 py-2.5 text-xs font-mono font-medium uppercase tracking-wider border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-400"
                    : isDark
                      ? "border-transparent text-slate-500 hover:text-slate-300"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.name}
              </button>
              <button
                onClick={() => setDeletingTab(tab)}
                aria-label={`Delete tab ${tab.name}`}
                title={`Delete tab ${tab.name}`}
                className={`flex items-center justify-center w-4 h-4 -ml-1 rounded-[var(--rt-radius)] text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isDark ? "text-slate-600 hover:text-slate-300 hover:bg-white/8" : "text-slate-400 hover:text-slate-700 hover:bg-black/5"
                }`}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {banner && (
          <div className={`mx-6 mt-3 px-3 py-2 rounded-[var(--rt-radius)] text-xs font-mono ${isDark ? "bg-blue-500/10 text-blue-300" : "bg-blue-50 text-blue-700"}`}>
            {banner}
          </div>
        )}

        {activeTab === "projects" ? (
          <>
            <ProjectsFilterBar
              filters={projectFilters}
              onChange={handleProjectsFilterChange}
              allTags={allTags}
              isDark={isDark}
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
              isDark={isDark}
              selectedId={selectedProjectId}
              selectedIds={selectedProjectIds}
              filters={projectFilters}
              onPageChange={handleProjectsPageChange}
              onRowClick={handleProjectRowClick}
              onToggleSelect={toggleProjectSelect}
              onToggleSelectAll={toggleAllProjectSelect}
              onSortChange={handleProjectSortChange}
              playerActive={playingFile !== null}
            />
          </>
        ) : activeTab === "files" ? (
          <>
            <FilterBar
              filters={filters}
              onChange={handleFilesFilterChange}
              allTags={allTags}
              isDark={isDark}
              resultLabel={loading ? "—" : `${files.length} of ${total} files`}
              selectedCount={selectedFileIds.size}
              onOpenBatchPanel={() => {
                setSelectedId(null);
                setShowFilesBatchPanel(true);
              }}
            />

            {error && (
              <div className={`mx-6 mt-3 px-3 py-2 rounded-[var(--rt-radius)] text-xs font-mono ${isDark ? "bg-red-500/10 text-red-300" : "bg-red-50 text-red-700"}`}>
                {error}
              </div>
            )}

            <main className={`flex-1 overflow-auto ${playingFile ? "pb-20" : ""}`} aria-live="polite" aria-label="Audio file library">
              <FileTable
                files={files}
                filters={filters}
                loading={loading}
                flashId={flashId}
                isDark={isDark}
                selectedId={selectedId}
                selectedIds={selectedFileIds}
                playingFileId={playingFile?.id ?? null}
                isPlaying={isPlaying}
                onSortChange={handleSortChange}
                onRowClick={handleRowClick}
                onClearFilters={() => handleFilesFilterChange({ search: undefined, statuses: undefined, scores: undefined, tags: undefined, sortBy: undefined, sortDir: undefined })}
                onToggleSelect={toggleFileSelect}
                onToggleSelectAll={toggleAllFileSelect}
                onPlayClick={handlePlayClick}
              />
            </main>

            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} isDark={isDark} onPageChange={handleFilesPageChange} />
          </>
        ) : (
          activeCustomTab &&
          (activeCustomTab.type === "files" ? (
            <CustomFilesTabPanel
              key={`custom-${activeCustomTab.id}`}
              tab={activeCustomTab}
              allTags={allTags}
              isDark={isDark}
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
              isDark={isDark}
              refreshStats={refreshStats}
              refreshTags={refreshTags}
              refetchFiles={refetch}
              scanCompletionSignal={lastScanChanges}
              playerActive={playingFile !== null}
              setBanner={setBanner}
              musicRoot={musicRoot}
            />
          ))
        )}
      </div>

      <AudioPlayerBar
        file={playingFile}
        isPlaying={isPlaying}
        isDark={isDark}
        onPlayingChange={setIsPlaying}
        onClose={handleClosePlayer}
      />

      <FileDetailPanel
        file={selectedFile}
        isDark={isDark}
        allTags={allTags}
        onClose={() => setSelectedId(null)}
        onSaveStatus={handleFileStatusSave}
        onSaveTags={handleFileTagsSave}
        onSaveScore={handleFileScoreSave}
        onReveal={handleReveal}
        onFileOperation={handleFileOperation}
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
        onProjectOperation={handleProjectOperation}
      />

      <CopyMoveDeleteDialog
        open={fileOpDialog !== null}
        isDark={isDark}
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
        isDark={isDark}
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
        isDark={isDark}
        musicRoot={musicRoot}
        onClose={() => setShowScanPanel(false)}
        onScanComplete={handleScanComplete}
      />

      <SettingsPanel open={showSettings} isDark={isDark} onClose={() => setShowSettings(false)} />

      <BatchEditPanel
        open={showFilesBatchPanel}
        count={selectedFileIds.size}
        itemLabel="audio file"
        isDark={isDark}
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
        isDark={isDark}
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
        isDark={isDark}
        allTags={allTags}
        onClose={() => setShowCreateTabModal(false)}
        onCreated={handleCustomTabCreated}
      />

      <DeleteTabConfirmDialog
        open={deletingTab !== null}
        isDark={isDark}
        tabName={deletingTab?.name ?? ""}
        onConfirm={handleDeleteTabConfirm}
        onCancel={() => setDeletingTab(null)}
      />

      <footer className={`border-t px-6 py-2 flex items-center justify-between ${isDark ? "border-white/5" : "border-black/5"}`}>
        <span className={`text-xs font-mono ${isDark ? "text-slate-700" : "text-slate-400"}`}>Music Library Manager · Local, read-only scanner</span>
        <span className={`text-xs font-mono ${isDark ? "text-slate-700" : "text-slate-400"}`}>Score and tag your tracks · Track what's ready to release</span>
      </footer>
    </div>
  );
}
