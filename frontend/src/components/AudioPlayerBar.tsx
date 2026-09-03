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
  isDark: boolean;
  onPlayingChange: (playing: boolean) => void;
  onClose: () => void;
};

export default function AudioPlayerBar({ file, isPlaying, isDark, onPlayingChange, onClose }: Props) {
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

  const border = isDark ? "border-white/8 bg-[#13161e]" : "border-black/8 bg-white";
  const meta = "text-slate-500";
  const iconBtn = isDark
    ? "border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20"
    : "border-black/10 text-slate-600 hover:text-slate-900 hover:border-black/20";

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
        <p className={`text-sm font-medium truncate ${isDark ? "text-slate-200" : "text-slate-800"}`} title={file.filename}>
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
        className={`p-1.5 rounded transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? "text-slate-500 hover:text-slate-300 hover:bg-white/8" : "text-slate-400 hover:text-slate-700 hover:bg-black/5"}`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
