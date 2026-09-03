import { useEffect, useRef, useState } from "react";
import { ScoreEditor } from "./ScoreEditor.js";
import { TagAutocompleteInput } from "./TagAutocompleteInput.js";

type Props = {
  open: boolean;
  count: number;
  itemLabel: string;
  isDark: boolean;
  allTags?: string[];
  onClose: () => void;
  onApplyScore: (score: number | null) => Promise<void>;
  onApplyTag: (tag: string) => Promise<void>;
};

export default function BatchEditPanel({ open, count, itemLabel, isDark, allTags = [], onClose, onApplyScore, onApplyTag }: Props) {
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [scoreSaving, setScoreSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [appliedTags, setAppliedTags] = useState<string[]>([]);
  const [tagSaving, setTagSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setLastScore(null);
      setTagInput("");
      setAppliedTags([]);
      setTimeout(() => closeRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleScoreChange(score: number | null) {
    if (scoreSaving) return;
    setScoreSaving(true);
    try {
      await onApplyScore(score);
      setLastScore(score);
    } finally {
      setScoreSaving(false);
    }
  }

  async function handleAddTag(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || tagSaving) return;
    setTagSaving(true);
    try {
      await onApplyTag(trimmed);
      setAppliedTags((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
      setTagInput("");
    } finally {
      setTagSaving(false);
    }
  }

  const panel = isDark ? "bg-[#13161e] border-white/8 text-slate-200" : "bg-white border-black/8 text-slate-800";
  const meta = "text-slate-500";
  const divider = isDark ? "border-white/8" : "border-slate-200";
  const chipCls = isDark ? "bg-white/8 text-slate-300" : "bg-slate-100 text-slate-700";

  return (
    <>
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"} ${isDark ? "bg-black/50" : "bg-black/20"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Batch edit ${itemLabel}s`}
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col shadow-2xl transition-transform duration-250 ease-out ${panel} ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className={`flex items-start justify-between gap-4 px-6 py-5 border-b ${divider}`}>
          <div className="min-w-0">
            <h2 className="text-base font-mono font-medium text-blue-400">Batch Edit</h2>
            <p className={`text-xs mt-1 ${meta}`}>
              {count} {itemLabel}
              {count === 1 ? "" : "s"} selected
            </p>
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
            <p className={`text-xs font-mono uppercase tracking-wider mb-2 flex items-center gap-2 ${meta}`}>
              Set Score
              {scoreSaving && <span className="normal-case tracking-normal">Applying…</span>}
            </p>
            <p className={`text-xs mb-3 ${meta}`}>
              Applies immediately to all {count} selected {itemLabel}
              {count === 1 ? "" : "s"}, overwriting whatever score each already has.
            </p>
            <ScoreEditor score={lastScore} onChange={handleScoreChange} disabled={scoreSaving} isDark={isDark} />
          </div>

          <div className={`border-t ${divider}`} />

          <div>
            <p className={`text-xs font-mono uppercase tracking-wider mb-2 flex items-center gap-2 ${meta}`}>
              Add Tags
              {tagSaving && <span className="normal-case tracking-normal">Applying…</span>}
            </p>
            <p className={`text-xs mb-3 ${meta}`}>
              Each tag is added to all {count} selected {itemLabel}
              {count === 1 ? "" : "s"}, on top of any tags they already have.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <TagAutocompleteInput
                  value={tagInput}
                  onChange={setTagInput}
                  onCommit={handleAddTag}
                  suggestions={allTags}
                  placeholder="Add tag, press Enter…"
                  isDark={isDark}
                  disabled={tagSaving}
                />
              </div>
              <button
                onClick={() => handleAddTag(tagInput)}
                disabled={tagSaving || !tagInput.trim()}
                className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                Add
              </button>
            </div>
            {appliedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {appliedTags.map((tag) => (
                  <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${chipCls}`}>
                    {tag}
                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={`px-6 py-4 border-t ${divider}`}>
          <button
            onClick={onClose}
            className={`w-full px-3 py-1.5 rounded text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? "border-white/10 text-slate-300 hover:text-slate-100 hover:border-white/20" : "border-black/10 text-slate-600 hover:text-slate-900 hover:border-black/20"}`}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
