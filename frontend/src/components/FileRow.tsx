import type { RefObject } from "react";
import type { AudioFile } from "../types.js";
import StatusBadge from "./StatusBadge.js";
import ScoreBadge from "./ScoreBadge.js";
import { RowCheckbox } from "./RowCheckbox.js";

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Derives the display location from a file's relative path: everything but the
 * filename itself, joined with " / ", or "(root)" when the file has no containing folder. */
export function computeLocation(relativePath: string): string {
  const locationParts = relativePath.split("/").slice(0, -1);
  return locationParts.length > 0 ? locationParts.join(" / ") : "(root)";
}

export function FileRow({
  file,
  isDark,
  isSelected,
  isFlash,
  flashRef,
  onClick,
  checked,
  onToggleCheck,
  isPlayingThis,
  onPlayClick,
}: {
  file: AudioFile;
  isDark: boolean;
  isSelected: boolean;
  isFlash: boolean;
  flashRef: RefObject<HTMLTableRowElement> | null;
  onClick: () => void;
  checked: boolean;
  onToggleCheck: () => void;
  isPlayingThis: boolean;
  onPlayClick: () => void;
}) {
  const location = computeLocation(file.relativePath);

  return (
    <tr
      ref={isFlash ? flashRef : null}
      onClick={onClick}
      aria-selected={isSelected}
      className={`border-b cursor-pointer transition-colors ${
        isSelected
          ? isDark
            ? "border-white/5 bg-blue-500/8"
            : "border-black/5 bg-blue-50"
          : isDark
            ? "border-white/5 hover:bg-white/3"
            : "border-black/5 hover:bg-black/3"
      }`}
    >
      <td className="px-4 py-3.5 text-center">
        <RowCheckbox checked={checked} onChange={onToggleCheck} ariaLabel={`Select ${file.filename}`} />
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlayClick();
            }}
            aria-label={isPlayingThis ? `Pause ${file.filename}` : `Play ${file.filename}`}
            className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isPlayingThis
                ? isDark
                  ? "text-blue-400 bg-blue-500/15"
                  : "text-blue-700 bg-blue-100"
                : isDark
                  ? "text-slate-400 hover:text-slate-100 hover:bg-white/10"
                  : "text-slate-500 hover:text-slate-900 hover:bg-black/10"
            }`}
          >
            {isPlayingThis ? (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            ) : (
              <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <div className="min-w-0">
            <div className={`text-sm font-medium truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>{file.filename}</div>
            <div className={`text-xs font-mono mt-0.5 ${isDark ? "text-slate-600" : "text-slate-400"}`}>{file.extension}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5 w-32">
        <StatusBadge status={file.status} isDark={isDark} />
      </td>
      <td className="px-4 py-3.5 max-w-40">
        {file.tags.length === 0 ? (
          <span className={`text-xs font-mono ${isDark ? "text-slate-700" : "text-slate-400"}`}>—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {file.tags.map((tag) => (
              <span
                key={tag}
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono ${isDark ? "bg-white/5 text-slate-400" : "bg-slate-100 text-slate-600"}`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3.5">
        <span className={`block truncate text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>{file.projectId ?? "—"}</span>
      </td>
      <td className="px-4 py-3.5 min-w-28">
        <ScoreBadge score={file.score} isDark={isDark} />
      </td>
      <td className="px-4 py-3.5 max-w-xs">
        <p className={`text-xs leading-relaxed truncate ${isDark ? "text-slate-500" : "text-slate-400"}`} title={file.path}>
          {location}
        </p>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className={`text-xs font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>{formatTime(file.modifiedAt)}</span>
      </td>
    </tr>
  );
}
