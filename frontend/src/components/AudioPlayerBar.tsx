import { useEffect, useRef, useState } from "react";
import type { AudioFile } from "../types.js";
import { getFileAudioUrl } from "../api/client.js";

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  file: AudioFile | null;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  onClose: () => void;
};

export default function AudioPlayerBar({ file, isPlaying, onPlayingChange, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setError(undefined);
  }, [file?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !file) return;
    if (isPlaying) {
      audio.play().catch(() => {
        setError("Could not play this file");
        onPlayingChange(false);
      });
    } else {
      audio.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, file?.id]);

  if (!file) return null;

  function handleStop() {
    onPlayingChange(false);
    if (audioRef.current) audioRef.current.currentTime = 0;
    setCurrentTime(0);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const next = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = next;
    setCurrentTime(next);
  }

  // Token-driven: reuses the established "floating panel on canvas" role (bg-surface
  // border-border) shared by FileDetailPanel.tsx/BatchEditPanel.tsx/etc.'s own `panel` const,
  // since this bar is the same kind of persistent overlay chrome, just docked to the bottom
  // edge instead of a side/center panel.
  const border = "border-border bg-surface";
  const meta = "text-slate-500";
  // Reuses ThemeSelector.tsx's established bordered-icon-button idle/hover pattern (border
  // changes on hover, not a background fill). The idle TEXT color is text-ink-secondary, not
  // text-ink-muted: this button's original literal was isDark ? "text-slate-300" : "text-slate-600"
  // — byte-exact to --rt-ink-secondary's dark value (#cbd5e1) and one step higher-contrast than
  // its light value (#334155 vs the old slate-600), not the dimmer --rt-ink-muted role (which
  // would drop dark-theme contrast from ~11.6:1 to ~3.6:1 and light from ~7.6:1 to ~2.6:1,
  // both well under WCAG SC 1.4.11's 3:1 minimum for a UI-control icon rendered via
  // fill="currentColor" — caught in Reviewer pass on this task). hover:text-ink is byte-exact
  // for light (old hover:text-slate-900 = --rt-ink's light value #0f172a) and still moves toward
  // higher contrast for dark (old hover:text-slate-100, new resolves to slate-200) — same
  // "shift toward higher contrast, never lower" discipline documented in index.css's chrome-ink
  // consolidation. The border classes are unchanged (border-border/hover:border-ink-muted) since
  // the contrast finding is specifically about the icon's rendered fill color, not the border.
  const iconBtn = "border-border text-ink-secondary hover:text-ink hover:border-ink-muted";

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-40 border-t px-6 py-3 flex items-center gap-4 shadow-2xl ${border}`}>
      <audio
        ref={audioRef}
        src={getFileAudioUrl(file.id)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => onPlayingChange(false)}
        onError={() => setError("Could not play this file — the format may not be supported by your browser.")}
      />

      <div className="min-w-0 w-56 flex-shrink-0">
        <p className="text-sm font-medium truncate text-ink" title={file.filename}>
          {file.filename}
        </p>
        {error ? (
          <p className="text-xs text-red-400 truncate">{error}</p>
        ) : (
          <p className={`text-xs font-mono truncate ${meta}`} title={file.relativePath}>
            {file.relativePath}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onPlayingChange(!isPlaying)}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-600 text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {isPlaying ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          onClick={handleStop}
          aria-label="Stop"
          className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${iconBtn}`}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" />
          </svg>
        </button>
      </div>

      <span className={`text-xs font-mono tabular-nums flex-shrink-0 ${meta}`}>{formatTime(currentTime)}</span>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        aria-label="Seek"
        className="flex-1 accent-blue-500"
      />
      <span className={`text-xs font-mono tabular-nums flex-shrink-0 ${meta}`}>{formatTime(duration)}</span>

      <button
        onClick={onClose}
        aria-label="Close player"
        className="p-1.5 rounded-[var(--rt-radius)] transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-ink-muted hover:text-ink hover:bg-surface-hover"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
