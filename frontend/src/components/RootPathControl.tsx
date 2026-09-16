import { useState } from "react";
import * as api from "../api/client.js";

type Props = {
  musicRoot: string | undefined;
  isDark: boolean;
  onSave: (newPath: string) => Promise<void>;
};

export default function RootPathControl({ musicRoot, isDark, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function startEditing() {
    setInput(musicRoot ?? "");
    setError(undefined);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError(undefined);
  }

  async function applyPath(path: string) {
    setSaving(true);
    setError(undefined);
    try {
      await onSave(path);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the production folder");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const trimmed = input.trim();
    if (!trimmed || trimmed === musicRoot) {
      setEditing(false);
      return;
    }
    await applyPath(trimmed);
  }

  async function handleBrowse() {
    setBrowsing(true);
    setError(undefined);
    try {
      const chosen = await api.chooseMusicRoot();
      if (!chosen) return; // user dismissed the folder picker
      setInput(chosen);
      await applyPath(chosen);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the folder picker");
    } finally {
      setBrowsing(false);
    }
  }

  const inputCls = isDark
    ? "bg-white/5 border-white/10 text-slate-300 placeholder-slate-600"
    : "bg-white border-slate-300 text-slate-800 placeholder-slate-400";
  const iconCls = isDark ? "text-slate-600 hover:text-slate-300" : "text-slate-400 hover:text-slate-700";
  const secondaryBtnCls = isDark
    ? "border-white/10 text-slate-400 hover:text-slate-200"
    : "border-black/10 text-slate-500 hover:text-slate-800";
  const busy = saving || browsing;

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") cancelEditing();
            }}
            placeholder="/path/to/music/folder"
            disabled={busy}
            className={`text-xs font-mono rounded-[var(--rt-radius)] border px-2 py-1 w-56 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 transition-colors disabled:opacity-50 ${inputCls}`}
            aria-label="Production folder path"
          />
          <button
            onClick={handleBrowse}
            disabled={busy}
            className={`px-2 py-1 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed ${secondaryBtnCls}`}
          >
            {browsing ? "Waiting…" : "Browse…"}
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            className="px-2 py-1 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={cancelEditing}
            disabled={busy}
            className={`px-2 py-1 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed ${secondaryBtnCls}`}
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-xs font-mono text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className={`text-xs font-mono truncate max-w-[220px] ${isDark ? "text-slate-500" : "text-slate-500"}`}
        title={musicRoot}
      >
        {musicRoot ?? "…"}
      </span>
      <button
        onClick={startEditing}
        aria-label="Change production folder"
        title="Change production folder"
        className={`p-0.5 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${iconCls}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
          />
        </svg>
      </button>
    </div>
  );
}
