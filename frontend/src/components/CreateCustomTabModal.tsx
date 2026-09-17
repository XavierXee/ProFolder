import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { CustomTab, CustomTabType, TrackStatus } from "../types.js";
import { MultiSelectDropdown } from "./MultiSelectDropdown.js";
import { STATUS_OPTIONS, STATUS_RESERVE_LABEL, SCORE_OPTIONS, SCORE_RESERVE_LABEL, TAGS_RESERVE_LABEL } from "./FilterToolbar.js";

type ScoreOption = number | "unscored";

type Props = {
  open: boolean;
  isDark: boolean;
  allTags: string[];
  onClose: () => void;
  onCreated: (tab: CustomTab) => void;
};

export default function CreateCustomTabModal({ open, isDark, allTags, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomTabType>("projects");
  const [statuses, setStatuses] = useState<TrackStatus[]>([]);
  const [scores, setScores] = useState<ScoreOption[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setType("projects");
    setStatuses([]);
    setScores([]);
    setTags([]);
    setNameError(undefined);
    setError(undefined);
    setSubmitting(false);
    setTimeout(() => closeRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Name is required");
      return;
    }
    setNameError(undefined);
    setError(undefined);
    setSubmitting(true);
    try {
      const tab = await api.createCustomTab({ name: trimmedName, type, statuses, scores, tags });
      onCreated(tab);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tab");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const panel = isDark ? "bg-[#13161e] border-white/8 text-slate-200" : "bg-white border-black/8 text-slate-800";
  const meta = "text-slate-500";
  const divider = isDark ? "border-white/8" : "border-slate-200";
  const inputBg = isDark
    ? "bg-white/5 border-white/10 text-slate-300 placeholder-slate-600"
    : "bg-white border-slate-300 text-slate-800 placeholder-slate-400";
  const tagOptions = allTags.map((t) => ({ value: t, label: t }));

  return (
    <>
      <div
        className={`fixed inset-0 z-30 ${isDark ? "bg-black/50" : "bg-black/20"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create custom tab"
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col shadow-2xl ${panel}`}
      >
        <div className={`flex items-start justify-between gap-4 px-6 py-5 border-b ${divider}`}>
          <div className="min-w-0">
            <h2 className="text-base font-mono font-medium text-blue-400">New Custom Tab</h2>
            <p className={`text-xs mt-1 ${meta}`}>Name it, choose a type, and set an optional filter</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className={`mt-0.5 p-1.5 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 ${isDark ? "text-slate-500 hover:text-slate-300 hover:bg-white/8" : "text-slate-400 hover:text-slate-700 hover:bg-black/5"}`}
            aria-label="Close panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <label htmlFor="custom-tab-name" className={`block text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>
                Name
              </label>
              <input
                id="custom-tab-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full border rounded-[var(--rt-radius)] text-sm px-2.5 py-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:border-blue-500/50 transition-colors ${inputBg}`}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "custom-tab-name-error" : undefined}
              />
              {nameError && (
                <p id="custom-tab-name-error" className="text-xs text-red-400 mt-1.5">
                  {nameError}
                </p>
              )}
            </div>

            <fieldset>
              <legend className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>Type</legend>
              <div className="flex gap-4">
                <label className={`flex items-center gap-2 text-sm cursor-pointer ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  <input
                    type="radio"
                    name="custom-tab-type"
                    value="projects"
                    checked={type === "projects"}
                    onChange={() => setType("projects")}
                    className="accent-blue-500"
                  />
                  Project Folders
                </label>
                <label className={`flex items-center gap-2 text-sm cursor-pointer ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  <input
                    type="radio"
                    name="custom-tab-type"
                    value="files"
                    checked={type === "files"}
                    onChange={() => setType("files")}
                    className="accent-blue-500"
                  />
                  Audio Files
                </label>
              </div>
            </fieldset>

            <div>
              <p className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>Filter</p>
              <div className="flex flex-wrap gap-2">
                <MultiSelectDropdown
                  label="Status"
                  options={STATUS_OPTIONS}
                  selected={statuses}
                  onChange={setStatuses}
                  reserveLabel={STATUS_RESERVE_LABEL}
                />
                <MultiSelectDropdown
                  label="Score"
                  options={SCORE_OPTIONS}
                  selected={scores}
                  onChange={setScores}
                  reserveLabel={SCORE_RESERVE_LABEL}
                />
                <MultiSelectDropdown
                  label="Tags"
                  options={tagOptions}
                  selected={tags}
                  onChange={setTags}
                  reserveLabel={TAGS_RESERVE_LABEL}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          <div className={`px-6 py-4 border-t ${divider} flex items-center justify-end gap-2`}>
            <button
              onClick={onClose}
              type="button"
              className={`px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isDark ? "border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20" : "border-black/10 text-slate-500 hover:text-slate-700 hover:border-black/20"}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
