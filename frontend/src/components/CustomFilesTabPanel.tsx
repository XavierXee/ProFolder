import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { FileFilters } from "../api/client.js";
import { useAudioFiles } from "../hooks/useAudioFiles.js";
import type { AudioFile, CustomTab, TrackStatus } from "../types.js";
import FilterToolbar from "./FilterToolbar.js";
import { FileTable } from "./FileTable.js";
import { Pagination } from "./Pagination.js";
import FileDetailPanel from "./FileDetailPanel.js";
import BatchEditPanel from "./BatchEditPanel.js";

type SortKey = NonNullable<FileFilters["sortBy"]>;

type Props = {
  tab: CustomTab;
  allTags: string[];
  isDark: boolean;
  /** App-level refresh for the header stats (draft/unscored counts). Must be called
   * wherever App.tsx's own file-mutation handlers call it, so the (currently invisible)
   * default tabs and header stats stay correct for when the user switches back. */
  refreshStats: () => void;
  /** App-level refresh for the global tag list (used by tag pickers/autocomplete everywhere). */
  refreshTags: () => void;
  /** App's Projects hook's refetch — files' score/tags are linked to their parent project's
   * aggregate score/tags (see REQUIREMENTS.md §12), so editing them here can change a project
   * that's invisible right now (the default Projects tab isn't mounted while a custom tab is active). */
  refetchProjects: () => void;
  /** Changes whenever a scan completes (App.tsx's scan-completion counter). This panel's own
   * local `useAudioFiles` instance has no other way to hear about a scan finishing. */
  scanCompletionSignal: number | null;
  /** Playback is App-level/global (a single `<AudioPlayerBar>` mounted once in App.tsx, not
   * per-tab), so this panel does NOT keep its own play/pause state — these are pure pass-
   * through props down to this panel's own `FileTable`, exactly like App.tsx wires them for
   * the default Files tab (see App.tsx's `playingFile`/`isPlaying`/`handlePlayClick`). */
  playingFileId: string | null;
  isPlaying: boolean;
  onPlayClick: (file: AudioFile) => void;
  /** App-level banner setter (App.tsx's `setBanner`), used to surface a reveal failure the
   * same way App.tsx's own `handleReveal` does — see that function for the exact message. */
  setBanner: (message: string) => void;
};

export default function CustomFilesTabPanel({
  tab,
  allTags,
  isDark,
  refreshStats,
  refreshTags,
  refetchProjects,
  scanCompletionSignal,
  playingFileId,
  isPlaying,
  onPlayClick,
  setBanner,
}: Props) {
  const { files, total, totalPages, page, pageSize, filters, updateFilters, setPage, loading, error, refetch } =
    useAudioFiles({ statuses: tab.statuses, scores: tab.scores, tags: tab.tags });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  const selectedFile = files.find((f) => f.id === selectedId) ?? null;

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
    setSelectedFileIds(new Set());
  }

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
    setSelectedFileIds(new Set());
  }

  function handleSortChange(sortBy: SortKey) {
    handleFilterChange({
      sortBy,
      sortDir: filters.sortBy === sortBy && filters.sortDir === "asc" ? "desc" : "asc",
    });
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

  function handleRowClick(id: string) {
    setShowBatchPanel(false);
    setSelectedId((prev) => (prev === id ? null : id));
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
  // handlers call for the equivalent mutation — see App.tsx's handleFileStatusSave /
  // handleFileTagsSave / handleFileScoreSave / handleBatchFileScore / handleBatchFileTag,
  // which this mirrors exactly.

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

  return (
    <>
      <FilterToolbar
        locked
        filters={filters}
        onChange={handleFilterChange}
        allTags={allTags}
        isDark={isDark}
        resultLabel={loading ? "—" : `${files.length} of ${total} files`}
        searchPlaceholder="Search files or paths…"
        searchAriaLabel="Search by filename or path"
        selectedCount={selectedFileIds.size}
        onOpenBatchPanel={() => {
          setSelectedId(null);
          setShowBatchPanel(true);
        }}
      />

      {error && (
        <div className={`mx-6 mt-3 px-3 py-2 rounded text-xs font-mono ${isDark ? "bg-red-500/10 text-red-300" : "bg-red-50 text-red-700"}`}>
          {error}
        </div>
      )}

      {/* Mirrors App.tsx's `playingFile ? "pb-20" : ""` (App.tsx:487): the player bar shows
          whenever a file is loaded into it, whether playing or paused, so the padding tracks
          `playingFileId` presence — not `isPlaying` — same as App.tsx's `playingFile` check. */}
      <main className={`flex-1 overflow-auto ${playingFileId ? "pb-20" : ""}`} aria-live="polite" aria-label={`${tab.name} files`}>
        <FileTable
          files={files}
          filters={filters}
          loading={loading}
          flashId={flashId}
          isDark={isDark}
          selectedId={selectedId}
          selectedIds={selectedFileIds}
          playingFileId={playingFileId}
          isPlaying={isPlaying}
          onSortChange={handleSortChange}
          onRowClick={handleRowClick}
          onClearFilters={() => handleFilterChange({ search: undefined, sortBy: undefined, sortDir: undefined })}
          onToggleSelect={toggleFileSelect}
          onToggleSelectAll={toggleAllFileSelect}
          onPlayClick={onPlayClick}
        />
      </main>

      <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} isDark={isDark} onPageChange={handlePageChange} />

      <FileDetailPanel
        file={selectedFile}
        isDark={isDark}
        allTags={allTags}
        onClose={() => setSelectedId(null)}
        onSaveStatus={handleFileStatusSave}
        onSaveTags={handleFileTagsSave}
        onSaveScore={handleFileScoreSave}
        onReveal={handleReveal}
      />

      <BatchEditPanel
        open={showBatchPanel}
        count={selectedFileIds.size}
        itemLabel="audio file"
        isDark={isDark}
        allTags={allTags}
        onClose={() => setShowBatchPanel(false)}
        onApplyScore={handleBatchFileScore}
        onApplyTag={handleBatchFileTag}
      />
    </>
  );
}
