import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { ScanSettings } from "../api/client.js";

type Props = {
  open: boolean;
  isDark: boolean;
  onClose: () => void;
};

function SettingRow({
  label,
  description,
  checked,
  disabled,
  isDark,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  isDark: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-start gap-3 py-2.5 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-blue-500 mt-0.5"
      />
      <span>
        <span className={`block text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>{label}</span>
        <span className={`block text-xs mt-0.5 ${isDark ? "text-slate-500" : "text-slate-500"}`}>{description}</span>
      </span>
    </label>
  );
}

export default function SettingsPanel({ open, isDark, onClose }: Props) {
  const [settings, setSettings] = useState<ScanSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | undefined>();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(undefined);
    setSaveState("idle");
    api
      .getScanSettings()
      .then(setSettings)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setLoading(false));
    setTimeout(() => closeRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleChange(patch: Partial<ScanSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaveState("saving");
    api
      .setScanSettings(patch)
      .then(setSettings)
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  }

  const panel = isDark ? "bg-[#13161e] border-white/8 text-slate-200" : "bg-white border-black/8 text-slate-800";
  const meta = "text-slate-500";
  const divider = isDark ? "border-white/8" : "border-slate-200";

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
        aria-label="Settings"
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col shadow-2xl transition-transform duration-250 ease-out ${panel} ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className={`flex items-start justify-between gap-4 px-6 py-5 border-b ${divider}`}>
          <div className="min-w-0">
            <h2 className="text-base font-mono font-medium text-blue-400">Settings</h2>
            <p className={`text-xs mt-1 ${meta}`}>Application preferences</p>
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

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex items-center justify-between mb-1">
            <p className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Scan Settings</p>
            <div className="h-4">
              {saveState === "saving" && <span className={`text-xs font-mono ${meta}`}>Saving…</span>}
              {saveState === "saved" && <span className="text-xs font-mono text-emerald-400">Saved</span>}
              {saveState === "error" && <span className="text-xs font-mono text-red-400">Failed to save</span>}
            </div>
          </div>

          {loading ? (
            <p className={`text-sm mt-3 ${meta}`}>Loading…</p>
          ) : error ? (
            <p className="text-sm mt-3 text-red-400">{error}</p>
          ) : settings ? (
            <div className={`divide-y ${isDark ? "divide-white/8" : "divide-slate-200"}`}>
              <SettingRow
                label="Exclude Samples folders"
                description="Skip any folder named “Samples” — usually imported/library audio, not your own production content."
                checked={settings.excludeSamplesFolders}
                disabled={saveState === "saving"}
                isDark={isDark}
                onChange={(checked) => handleChange({ excludeSamplesFolders: checked })}
              />
              <SettingRow
                label="Exclude Backup folders"
                description="Skip any folder named “Backup” — Ableton's auto-saved project versions, not real production content."
                checked={settings.excludeBackupFolders}
                disabled={saveState === "saving"}
                isDark={isDark}
                onChange={(checked) => handleChange({ excludeBackupFolders: checked })}
              />
            </div>
          ) : null}

          <p className={`text-xs mt-4 ${meta}`}>Changes apply the next time you run a scan.</p>
        </div>
      </div>
    </>
  );
}
