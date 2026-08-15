import { useEffect, useState } from "react";
import { useAudioFiles } from "./hooks/useAudioFiles.js";
import FilterBar from "./components/FilterBar.js";
import ActiveFilterChips from "./components/ActiveFilterChips.js";
import { FileTable } from "./components/FileTable.js";
import { Pagination } from "./components/Pagination.js";
import FileDetailPanel from "./components/FileDetailPanel.js";
import StatBar from "./components/StatBar.js";
import NeedsReviewStrip from "./components/NeedsReviewStrip.js";
import LiveIndicator from "./components/LiveIndicator.js";
import * as api from "./api/client.js";
import type { FileFilters, LibraryStats } from "./api/client.js";
import type { AudioFile, TrackStatus } from "./types.js";

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

  const [scanning, setScanning] = useState(false);
  const [musicRoot, setMusicRoot] = useState<string | undefined>();
  const [lastScanChanges, setLastScanChanges] = useState<number | null>(null);
  const [connected, setConnected] = useState(true);
  const [banner, setBanner] = useState<string | undefined>();
  const [isDark, setIsDark] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [stats, setStats] = useState<LibraryStats | undefined>();
  const [needsReview, setNeedsReview] = useState<AudioFile[]>([]);

  const selectedFile = files.find((f) => f.id === selectedId) ?? needsReview.find((f) => f.id === selectedId) ?? null;

  function refreshSideData() {
    api.getStats().then(setStats).catch(() => {});
    api
      .getFiles({ status: "unknown", hasExport: true, sortBy: "modifiedAt", sortDir: "desc", pageSize: 5 })
      .then((r) => setNeedsReview(r.files))
      .catch(() => {});
  }

  useEffect(() => {
    api
      .getConfig()
      .then((c) => {
        setMusicRoot(c.musicRoot);
        setConnected(true);
      })
      .catch(() => setConnected(false));
    api
      .getLastScan()
      .then((s) => s && setLastScanChanges(s.newFiles + s.modifiedFiles + s.removedFiles))
      .catch(() => {});
    refreshSideData();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", !isDark);
  }, [isDark]);

  async function handleScan() {
    setScanning(true);
    setBanner(undefined);
    try {
      const stats = await api.triggerScan();
      setLastScanChanges(stats.newFiles + stats.modifiedFiles + stats.removedFiles);
      setBanner(
        `Scan complete: ${stats.audioFilesFound} audio files (${stats.newFiles} new, ${stats.modifiedFiles} modified, ${stats.removedFiles} removed).`
      );
      refetch();
      refreshSideData();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleSave(id: string, patch: { status: TrackStatus; tags: string[] }) {
    await api.updateStatus(id, patch.status);
    await api.updateTags(id, patch.tags);
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1600);
    refetch();
    refreshSideData();
  }

  async function handleReveal(path: string) {
    try {
      await api.reveal(path);
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Could not reveal in Finder");
    }
  }

  function handleRowClick(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  function handleSortChange(sortBy: NonNullable<FileFilters["sortBy"]>) {
    updateFilters({
      sortBy,
      sortDir: filters.sortBy === sortBy && filters.sortDir === "asc" ? "desc" : "asc",
    });
  }

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0d0f14]" : "bg-[#f4f6f9]"}`}>
      <header
        className={`border-b px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-20 backdrop-blur-sm ${
          isDark ? "border-white/8 bg-[#0d0f14]/90" : "border-black/8 bg-[#f4f6f9]/90"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <div>
            <h1 className={`text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>Music Library Manager</h1>
            <p className={`text-xs font-mono ${isDark ? "text-slate-600" : "text-slate-400"}`}>Local Scan Console</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {scanning ? "Scanning…" : "Scan Music Folder"}
          </button>

          <LiveIndicator connected={connected} lastScanChanges={lastScanChanges} isDark={isDark} />

          <div className={`flex flex-col items-end gap-1 border-l pl-4 ${isDark ? "border-white/8" : "border-black/8"}`}>
            {musicRoot && (
              <span className={`text-xs font-mono truncate max-w-48 ${isDark ? "text-slate-500" : "text-slate-500"}`} title={musicRoot}>
                {musicRoot}
              </span>
            )}
            <button
              onClick={() => setIsDark((d) => !d)}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className={`flex items-center gap-1.5 text-xs font-mono transition-colors focus:outline-none focus-visible:underline ${
                isDark ? "text-slate-600 hover:text-slate-400" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {isDark ? "Light" : "Dark"}
            </button>
          </div>
        </div>
      </header>

      <StatBar stats={stats} isDark={isDark} />

      <NeedsReviewStrip files={needsReview} selectedId={selectedId} isDark={isDark} onSelect={handleRowClick} />

      <div className="flex flex-col flex-1 min-h-0">
        <FilterBar filters={filters} onChange={updateFilters} isDark={isDark} />
        <ActiveFilterChips filters={filters} onChange={updateFilters} isDark={isDark} />

        <div className={`px-6 py-2 flex items-center justify-between border-b ${isDark ? "border-white/5" : "border-black/5"}`}>
          <span className={`text-xs font-mono ${isDark ? "text-slate-600" : "text-slate-400"}`}>
            {loading ? "—" : `${files.length} of ${total} files`}
          </span>
        </div>

        {banner && (
          <div className={`mx-6 mt-3 px-3 py-2 rounded text-xs font-mono ${isDark ? "bg-blue-500/10 text-blue-300" : "bg-blue-50 text-blue-700"}`}>
            {banner}
          </div>
        )}
        {error && (
          <div className={`mx-6 mt-3 px-3 py-2 rounded text-xs font-mono ${isDark ? "bg-red-500/10 text-red-300" : "bg-red-50 text-red-700"}`}>
            {error}
          </div>
        )}

        <main className="flex-1 overflow-auto" aria-live="polite" aria-label="Audio file library">
          <FileTable
            files={files}
            filters={filters}
            loading={loading}
            flashId={flashId}
            isDark={isDark}
            selectedId={selectedId}
            onSortChange={handleSortChange}
            onRowClick={handleRowClick}
            onClearFilters={() => updateFilters({ search: undefined, status: undefined, hasExport: undefined, sortBy: undefined, sortDir: undefined })}
          />
        </main>

        <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} isDark={isDark} onPageChange={setPage} />
      </div>

      <FileDetailPanel file={selectedFile} isDark={isDark} onClose={() => setSelectedId(null)} onSave={handleSave} onReveal={handleReveal} />

      <footer className={`border-t px-6 py-2 flex items-center justify-between ${isDark ? "border-white/5" : "border-black/5"}`}>
        <span className={`text-xs font-mono ${isDark ? "text-slate-700" : "text-slate-400"}`}>Music Library Manager · Local, read-only scanner</span>
        <span className={`text-xs font-mono ${isDark ? "text-slate-700" : "text-slate-400"}`}>Heuristic export detection · Review before importing</span>
      </footer>
    </div>
  );
}
