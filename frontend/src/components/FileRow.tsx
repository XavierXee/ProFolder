import type { RefObject } from "react";
import type { AudioFile } from "../types.js";
import StatusBadge from "./StatusBadge.js";
import ExportBadge from "./ExportBadge.js";
import ConfidenceBar from "./ConfidenceBar.js";

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function FileRow({
  file,
  isDark,
  isSelected,
  isFlash,
  flashRef,
  onClick,
}: {
  file: AudioFile;
  isDark: boolean;
  isSelected: boolean;
  isFlash: boolean;
  flashRef: RefObject<HTMLTableRowElement> | null;
  onClick: () => void;
}) {
  const locationParts = file.relativePath.split("/").slice(0, -1);
  const location = locationParts.length > 0 ? locationParts.join(" / ") : "(root)";

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
      <td className="px-4 py-3.5">
        <div className={`text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>{file.filename}</div>
        <div className={`text-xs font-mono mt-0.5 ${isDark ? "text-slate-600" : "text-slate-400"}`}>{file.extension}</div>
      </td>
      <td className="px-4 py-3.5">
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
        <span className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>{file.projectId ?? "—"}</span>
      </td>
      <td className="px-4 py-3.5 min-w-28">
        <ExportBadge isExportCandidate={file.isExportCandidate} exportConfidence={file.exportConfidence} isDark={isDark} />
        <div className="mt-1">
          <ConfidenceBar value={file.exportConfidence} isDark={isDark} />
        </div>
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
