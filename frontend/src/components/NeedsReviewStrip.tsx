import type { AudioFile } from "../types.js";
import StatusBadge from "./StatusBadge.js";
import ExportBadge from "./ExportBadge.js";

type Props = {
  files: AudioFile[];
  selectedId: string | null;
  isDark: boolean;
  onSelect: (id: string) => void;
};

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default function NeedsReviewStrip({ files, selectedId, isDark, onSelect }: Props) {
  const border = isDark ? "border-white/8" : "border-slate-200";
  const bg = isDark ? "bg-[#0d0f14]" : "bg-[#f4f6f9]";
  const headerCls = isDark ? "text-slate-600" : "text-slate-400";
  const emptyText = isDark ? "text-slate-700" : "text-slate-400";
  const rowHover = isDark ? "hover:bg-white/4" : "hover:bg-black/3";
  const rowSelected = isDark ? "bg-blue-500/8 border-l-2 border-l-blue-500" : "bg-blue-50 border-l-2 border-l-blue-500";
  const rowDefault = `border-l-2 border-l-transparent ${rowHover}`;
  const divider = isDark ? "divide-white/5" : "divide-slate-100";
  const timeText = isDark ? "text-slate-600" : "text-slate-400";

  return (
    <div className={`border-b ${border} ${bg} sticky top-[73px] z-10`}>
      <div className="flex items-center gap-2 px-6 pt-2 pb-1">
        <span className={`text-xs font-mono uppercase tracking-wider ${headerCls}`}>Needs Review</span>
        <span className={`text-xs font-mono ${isDark ? "text-slate-700" : "text-slate-400"}`}>({files.length})</span>
      </div>

      {files.length === 0 ? (
        <div className={`px-6 pb-2 text-xs font-mono ${emptyText}`}>
          No likely exports waiting on a status decision
        </div>
      ) : (
        <div className={`overflow-y-auto divide-y ${divider}`} style={{ maxHeight: 108 }}>
          {files.map((file) => {
            const isSelected = file.id === selectedId;
            return (
              <button
                key={file.id}
                onClick={() => onSelect(file.id)}
                aria-pressed={isSelected}
                aria-label={`Open ${file.filename}`}
                className={`w-full flex items-center gap-4 px-6 py-1.5 text-left transition-colors focus:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isSelected ? rowSelected : rowDefault
                }`}
              >
                <span className={`text-xs font-medium flex-1 truncate ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {file.filename}
                </span>
                <span className="flex-shrink-0">
                  <StatusBadge status={file.status} isDark={isDark} />
                </span>
                <span className="flex-shrink-0 w-32">
                  <ExportBadge isExportCandidate={file.isExportCandidate} exportConfidence={file.exportConfidence} isDark={isDark} />
                </span>
                <span className={`text-xs font-mono w-28 text-right flex-shrink-0 ${timeText}`}>
                  {formatTime(file.modifiedAt)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
