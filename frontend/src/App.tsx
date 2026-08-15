import { useEffect, useLayoutEffect, useState } from "react";
import { useAudioFiles } from "./hooks/useAudioFiles.js";
import FilterBar from "./components/FilterBar.js";
import ActiveFilterChips from "./components/ActiveFilterChips.js";
import { FileTable } from "./components/FileTable.js";
import { Pagination } from "./components/Pagination.js";
import FileDetailPanel from "./components/FileDetailPanel.js";
import MetricsPanel from "./components/MetricsPanel.js";
import ScanFolderPanel from "./components/ScanFolderPanel.js";
import * as api from "./api/client.js";
import type { FileFilters, LibraryStats, ScanStats } from "./api/client.js";
import type { TrackStatus } from "./types.js";

const THEME_STORAGE_KEY = "musicLibraryManager.isDark";

function loadStoredIsDark(): boolean {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === null ? true : stored === "true";
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

  const [musicRoot, setMusicRoot] = useState<string | undefined>();
  const [lastScanChanges, setLastScanChanges] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | undefined>();
  const [isDark, setIsDark] = useState(loadStoredIsDark);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [stats, setStats] = useState<LibraryStats | undefined>();
  const [showMetrics, setShowMetrics] = useState(false);
  const [showScanPanel, setShowScanPanel] = useState(false);

  const selectedFile = files.find((f) => f.id === selectedId) ?? null;

  function refreshStats() {
    api.getStats().then(setStats).catch(() => {});
  }

  useEffect(() => {
    api.getConfig().then((c) => setMusicRoot(c.musicRoot)).catch(() => {});
    api
      .getLastScan()
      .then((s) => s && setLastScanChanges(s.newFiles + s.modifiedFiles + s.removedFiles))
      .catch(() => {});
    refreshStats();
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("light", !isDark);
    localStorage.setItem(THEME_STORAGE_KEY, String(isDark));
  }, [isDark]);

  function handleScanComplete(stats: ScanStats) {
    setLastScanChanges(stats.newFiles + stats.modifiedFiles + stats.removedFiles);
    setBanner(
      `Scan complete: ${stats.audioFilesFound} audio files (${stats.newFiles} new, ${stats.modifiedFiles} modified, ${stats.removedFiles} removed).`
    );
    refetch();
    refreshStats();
  }

  async function handleSave(id: string, patch: { status: TrackStatus; tags: string[] }) {
    await api.updateStatus(id, patch.status);
    await api.updateTags(id, patch.tags);
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1600);
    refetch();
    refreshStats();
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

  const sectionBorder = isDark ? "border-white/8" : "border-black/8";

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
            onClick={() => {
              setSelectedId(null);
              setShowScanPanel(true);
            }}
            className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Prod Folder
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMetrics((v) => !v)}
              aria-expanded={showMetrics}
              aria-haspopup="dialog"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isDark ? "border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20" : "border-black/10 text-slate-600 hover:text-slate-900 hover:border-black/20"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5h3v6H3v-6zM10.5 7.5h3v12h-3v-12zM18 10.5h3v9h-3v-9z" />
              </svg>
              Metrics
              {stats && stats.needsReview > 0 && (
                <span className={`px-1.5 rounded-full text-[10px] ${isDark ? "bg-purple-500/20 text-purple-300" : "bg-purple-100 text-purple-700"}`}>
                  {stats.needsReview}
                </span>
              )}
            </button>
            {showMetrics && (
              <MetricsPanel stats={stats} lastScanChanges={lastScanChanges} isDark={isDark} onClose={() => setShowMetrics(false)} />
            )}
          </div>

          {musicRoot && (
            <div className={`border-l pl-4 ${sectionBorder}`}>
              <span className={`text-xs font-mono truncate max-w-48 block ${isDark ? "text-slate-500" : "text-slate-500"}`} title={musicRoot}>
                {musicRoot}
              </span>
            </div>
          )}

          <div className={`border-l pl-4 ${sectionBorder}`}>
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

      <ScanFolderPanel
        open={showScanPanel}
        isDark={isDark}
        musicRoot={musicRoot}
        onClose={() => setShowScanPanel(false)}
        onScanComplete={handleScanComplete}
      />

      <footer className={`border-t px-6 py-2 flex items-center justify-between ${isDark ? "border-white/5" : "border-black/5"}`}>
        <span className={`text-xs font-mono ${isDark ? "text-slate-700" : "text-slate-400"}`}>Music Library Manager · Local, read-only scanner</span>
        <span className={`text-xs font-mono ${isDark ? "text-slate-700" : "text-slate-400"}`}>Heuristic export detection · Review before importing</span>
      </footer>
    </div>
  );
}
