import { useEffect, useRef, useState } from "react";
import type { AudioFile, TrackStatus } from "../types.js";
import StatusBadge from "./StatusBadge.js";
import ExportBadge from "./ExportBadge.js";
import ConfidenceBar from "./ConfidenceBar.js";
import { TagEditor } from "./TagEditor.js";
import { ALL_STATUSES, STATUS_LABELS, STATUS_PILL_DARK, STATUS_PILL_LIGHT, STATUS_PILL_UNSELECTED_DARK, STATUS_PILL_UNSELECTED_LIGHT } from "../statusStyles.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFull(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

type Props = {
  file: AudioFile | null;
  isDark: boolean;
  onClose: () => void;
  onSave: (id: string, patch: { status: TrackStatus; tags: string[] }) => Promise<void>;
  onReveal: (path: string) => void;
};

export default function FileDetailPanel({ file, isDark, onClose, onSave, onReveal }: Props) {
  const [status, setStatus] = useState<TrackStatus>("unknown");
  const [tags, setTags] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (file) {
      setStatus(file.status);
      setTags(file.tags);
      setDirty(false);
      setSaved(false);
      setTimeout(() => closeRef.current?.focus(), 50);
    }
  }, [file?.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleStatusChange(s: TrackStatus) {
    setStatus(s);
    setDirty(s !== file?.status || tagsChanged(tags, file?.tags ?? []));
    setSaved(false);
  }

  function handleTagsChange(next: string[]) {
    setTags(next);
    setDirty(status !== file?.status || tagsChanged(next, file?.tags ?? []));
    setSaved(false);
  }

  function tagsChanged(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return true;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.some((t, i) => t !== sortedB[i]);
  }

  async function handleSave() {
    if (!file) return;
    setSaving(true);
    try {
      await onSave(file.id, { status, tags });
      setDirty(false);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const panel = isDark ? "bg-[#13161e] border-white/8 text-slate-200" : "bg-white border-black/8 text-slate-800";
  const meta = "text-slate-500";
  const divider = isDark ? "border-white/8" : "border-slate-200";
  const statusColors = isDark ? STATUS_PILL_DARK : STATUS_PILL_LIGHT;
  const statusUnselected = isDark ? STATUS_PILL_UNSELECTED_DARK : STATUS_PILL_UNSELECTED_LIGHT;

  return (
    <>
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-200 ${file ? "opacity-100" : "opacity-0 pointer-events-none"} ${isDark ? "bg-black/50" : "bg-black/20"}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={file ? `File detail: ${file.filename}` : "File detail"}
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col shadow-2xl transition-transform duration-250 ease-out ${panel} ${file ? "translate-x-0" : "translate-x-full"}`}
      >
        {file && (
          <>
            <div className={`flex items-start justify-between gap-4 px-6 py-5 border-b ${divider}`}>
              <div className="min-w-0">
                <p className={`text-xs font-mono mb-1 ${meta}`}>File</p>
                <h2 className="text-base font-mono font-medium text-blue-400 truncate">{file.filename}</h2>
                <p className={`text-xs mt-1 ${meta}`}>Updated {formatFull(file.modifiedAt)}</p>
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                className={`mt-0.5 p-1.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 ${isDark ? "text-slate-500 hover:text-slate-300 hover:bg-white/8" : "text-slate-400 hover:text-slate-700 hover:bg-black/5"}`}
                aria-label="Close panel"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>Project</p>
                <p className="text-lg font-semibold truncate">{file.projectId ?? "Unassociated"}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <StatusBadge status={file.status} isDark={isDark} />
                  <ExportBadge isExportCandidate={file.isExportCandidate} exportConfidence={file.exportConfidence} isDark={isDark} />
                  <span className={`text-xs font-mono ${meta}`}>{file.extension}</span>
                </div>
              </div>

              <div className={`grid grid-cols-2 gap-3 p-4 rounded-lg border ${isDark ? "bg-white/3 border-white/8" : "bg-slate-50 border-slate-200"}`}>
                <div>
                  <p className={`text-xs font-mono uppercase tracking-wider mb-1 ${meta}`}>Size</p>
                  <p className="text-xl font-mono font-semibold tabular-nums">{formatBytes(file.size)}</p>
                </div>
                <div>
                  <p className={`text-xs font-mono uppercase tracking-wider mb-1 ${meta}`}>Export Confidence</p>
                  <div className="pt-1">
                    <ConfidenceBar value={file.exportConfidence} isDark={isDark} />
                  </div>
                </div>
              </div>

              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>Location</p>
                <p className={`text-sm leading-relaxed break-all ${isDark ? "text-slate-300" : "text-slate-600"}`}>{file.relativePath}</p>
                <p className={`text-xs font-mono mt-2 break-all ${meta}`}>{file.path}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onReveal(file.path)}
                    className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? "border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20" : "border-black/10 text-slate-600 hover:text-slate-900 hover:border-black/20"}`}
                  >
                    Reveal file in Finder
                  </button>
                  {file.projectPath && (
                    <button
                      onClick={() => onReveal(file.projectPath!)}
                      className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? "border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20" : "border-black/10 text-slate-600 hover:text-slate-900 hover:border-black/20"}`}
                    >
                      Reveal project
                    </button>
                  )}
                </div>
              </div>

              <div className={`border-t ${divider}`} />

              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-3 ${meta}`}>Status</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Select status">
                  {ALL_STATUSES.map((s) => {
                    const selected = status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        aria-pressed={selected}
                        className={`px-3 py-1.5 rounded text-xs font-mono font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          selected ? `ring-1 ${statusColors[s]}` : statusUnselected
                        }`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>Tags</p>
                <TagEditor tags={tags} onChange={handleTagsChange} isDark={isDark} />
              </div>
            </div>

            <div className={`px-6 py-4 border-t ${divider} flex items-center justify-between gap-3`}>
              {saved ? (
                <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Saved
                </span>
              ) : (
                <span className={`text-xs font-mono ${dirty ? "text-amber-400" : meta}`}>{dirty ? "Unsaved changes" : "No changes"}</span>
              )}
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? "border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20" : "border-black/10 text-slate-500 hover:text-slate-700 hover:border-black/20"}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
