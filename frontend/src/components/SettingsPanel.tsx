import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { ConfirmationSettings, PaginationSettings, ScanSettings } from "../api/client.js";
import { setItemsPerPageGlobally } from "../hooks/useItemsPerPage.js";
import {ThemeSelector} from "./ThemeSelector";
import {Theme} from "../types";

const MIN_ITEMS_PER_PAGE = 10;
const MAX_ITEMS_PER_PAGE = 500;
const MIN_DUPLICATE_MATCH_THRESHOLD_PERCENT = 10;
const MAX_DUPLICATE_MATCH_THRESHOLD_PERCENT = 100;

type Props = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  open: boolean;
  onClose: () => void;
};

function SettingRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
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
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs mt-0.5 text-slate-500">{description}</span>
      </span>
    </label>
  );
}

export default function SettingsPanel({ theme, setTheme, open, onClose }: Props) {
  const [settings, setSettings] = useState<ScanSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | undefined>();
  const [duplicateThresholdInputValue, setDuplicateThresholdInputValue] = useState("");
  const [duplicateThresholdSaveState, setDuplicateThresholdSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [duplicateThresholdError, setDuplicateThresholdError] = useState<string | undefined>();
  const [confirmSettings, setConfirmSettings] = useState<ConfirmationSettings | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmSaveState, setConfirmSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [paginationSettings, setPaginationSettingsState] = useState<PaginationSettings | null>(null);
  const [paginationInputValue, setPaginationInputValue] = useState("");
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [paginationSaveState, setPaginationSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [paginationError, setPaginationError] = useState<string | undefined>();
  // Desktop-only "Data Location" section: `runtimeMode` starts `null` (unknown) so the whole
  // section stays unrendered until `api.getConfig()` resolves, rather than flashing visible then
  // disappearing for web-mode users.
  const [runtimeMode, setRuntimeMode] = useState<"web" | "desktop" | null>(null);
  const [dbPath, setDbPath] = useState<string | undefined>();
  const [dbLoading, setDbLoading] = useState(false);
  const [dbLoadError, setDbLoadError] = useState<string | undefined>();
  const [pendingDbPath, setPendingDbPath] = useState<string | undefined>();
  const [dbChoosing, setDbChoosing] = useState(false);
  const [dbApplyState, setDbApplyState] = useState<"idle" | "applying" | "restarting" | "error">("idle");
  const [dbError, setDbError] = useState<string | undefined>();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(undefined);
    setSaveState("idle");
    setDuplicateThresholdError(undefined);
    setDuplicateThresholdSaveState("idle");
    api
      .getScanSettings()
      .then((settings) => {
        setSettings(settings);
        setDuplicateThresholdInputValue(String(settings.duplicateMatchThresholdPercent));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setLoading(false));
    setConfirmLoading(true);
    setConfirmError(undefined);
    setConfirmSaveState("idle");
    api
      .getConfirmationSettings()
      .then(setConfirmSettings)
      .catch((err) => setConfirmError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setConfirmLoading(false));
    setPaginationLoading(true);
    setPaginationError(undefined);
    setPaginationSaveState("idle");
    api
      .getPaginationSettings()
      .then((settings) => {
        setPaginationSettingsState(settings);
        setPaginationInputValue(String(settings.itemsPerPage));
      })
      .catch((err) => setPaginationError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setPaginationLoading(false));
    setRuntimeMode(null);
    setDbPath(undefined);
    setDbLoadError(undefined);
    setPendingDbPath(undefined);
    setDbChoosing(false);
    setDbApplyState("idle");
    setDbError(undefined);
    api
      .getConfig()
      .then((config) => {
        setRuntimeMode(config.runtimeMode);
        if (config.runtimeMode !== "desktop") return;
        setDbLoading(true);
        api
          .getDbLocation()
          .then((result) => setDbPath(result.dbPath))
          .catch((err) => setDbLoadError(err instanceof Error ? err.message : "Failed to load settings"))
          .finally(() => setDbLoading(false));
      })
      .catch(() => setRuntimeMode("web"));
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

  const parsedDuplicateThresholdInput = Number(duplicateThresholdInputValue);
  const isDuplicateThresholdInputValid =
    duplicateThresholdInputValue.trim() !== "" &&
    Number.isInteger(parsedDuplicateThresholdInput) &&
    parsedDuplicateThresholdInput >= MIN_DUPLICATE_MATCH_THRESHOLD_PERCENT &&
    parsedDuplicateThresholdInput <= MAX_DUPLICATE_MATCH_THRESHOLD_PERCENT;
  const isDuplicateThresholdInputUnchanged =
    settings !== null && parsedDuplicateThresholdInput === settings.duplicateMatchThresholdPercent;
  const isDuplicateThresholdApplyDisabled =
    duplicateThresholdSaveState === "saving" || !isDuplicateThresholdInputValid || isDuplicateThresholdInputUnchanged;

  function handleDuplicateThresholdApply() {
    if (isDuplicateThresholdApplyDisabled) return;
    setDuplicateThresholdSaveState("saving");
    setDuplicateThresholdError(undefined);
    api
      .setScanSettings({ duplicateMatchThresholdPercent: parsedDuplicateThresholdInput })
      .then((result) => {
        setSettings(result);
        setDuplicateThresholdInputValue(String(result.duplicateMatchThresholdPercent));
        setDuplicateThresholdSaveState("saved");
      })
      .catch((err) => {
        setDuplicateThresholdError(err instanceof Error ? err.message : "Failed to save settings");
        setDuplicateThresholdSaveState("error");
      });
  }

  function handleConfirmChange(patch: Partial<ConfirmationSettings>) {
    setConfirmSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    setConfirmSaveState("saving");
    api
      .setConfirmationSettings(patch)
      .then(setConfirmSettings)
      .then(() => setConfirmSaveState("saved"))
      .catch(() => setConfirmSaveState("error"));
  }

  const parsedPaginationInput = Number(paginationInputValue);
  const isPaginationInputValid =
    paginationInputValue.trim() !== "" &&
    Number.isInteger(parsedPaginationInput) &&
    parsedPaginationInput >= MIN_ITEMS_PER_PAGE &&
    parsedPaginationInput <= MAX_ITEMS_PER_PAGE;
  const isPaginationInputUnchanged =
    paginationSettings !== null && parsedPaginationInput === paginationSettings.itemsPerPage;
  const isPaginationApplyDisabled =
    paginationSaveState === "saving" || !isPaginationInputValid || isPaginationInputUnchanged;

  function handlePaginationApply() {
    if (isPaginationApplyDisabled) return;
    setPaginationSaveState("saving");
    setPaginationError(undefined);
    api
      .setPaginationSettings({ itemsPerPage: parsedPaginationInput })
      .then((result) => {
        setPaginationSettingsState(result);
        setPaginationInputValue(String(result.itemsPerPage));
        setItemsPerPageGlobally(result.itemsPerPage);
        setPaginationSaveState("saved");
      })
      .catch((err) => {
        setPaginationError(err instanceof Error ? err.message : "Failed to save settings");
        setPaginationSaveState("error");
      });
  }

  async function handleChooseDbLocation() {
    setDbChoosing(true);
    setDbError(undefined);
    try {
      const chosen = await api.chooseDbLocation();
      if (chosen) setPendingDbPath(chosen);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : "Could not open the file picker");
    } finally {
      setDbChoosing(false);
    }
  }

  function handleCancelDbLocation() {
    setPendingDbPath(undefined);
    setDbError(undefined);
    setDbApplyState("idle");
  }

  // Deliberately does NOT auto-apply on selection the way RootPathControl's folder browse does:
  // this action restarts the whole app, so it needs an explicit confirm step rather than firing
  // from a single misclick.
  async function handleApplyDbLocation() {
    if (!pendingDbPath) return;
    setDbApplyState("applying");
    setDbError(undefined);
    try {
      await api.setDbLocation(pendingDbPath);
      // Success: the app is about to relaunch. There is nothing more to poll or confirm, and the
      // resulting connection drop is expected, not an error.
      setDbApplyState("restarting");
    } catch (err) {
      setDbError(err instanceof Error ? err.message : "Could not update the database location");
      setDbApplyState("error");
    }
  }

  const panel = "bg-surface border-border text-ink";
  const meta = "text-slate-500";
  const divider = "border-border";

  return (
    <>
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"} bg-scrim`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        // Stays mounted (CSS-slid off-screen) while "closed" so its slide transition can animate
        // — without `inert`, its controls were still real, keyboard-reachable "ghost" Tab stops
        // despite being invisible and unclickable. See FileDetailPanel.tsx's identical comment.
        inert={open ? undefined : ""}
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col transition-transform duration-250 ease-out ${panel} ${open ? "translate-x-0 shadow-2xl" : "translate-x-full"}`}
      >
        <div className={`flex items-start justify-between gap-4 px-6 py-5 border-b ${divider}`}>
          <div className="min-w-0">
            <h2 className="text-base font-mono font-medium text-blue-400">Settings</h2>
            <p className={`text-xs mt-1 ${meta}`}>Application preferences</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="mt-0.5 p-1.5 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 text-ink-muted hover:text-ink hover:bg-surface-hover"
            aria-label="Close panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className={`flex items-start justify-between gap-4 px-6 py-2 border-b ${divider}`}>
          <div className="w-full flex items-center justify-between">
            <div className={`text-xs font-mono uppercase tracking-wider ${meta}`}>THEME</div>
            <div><ThemeSelector value={theme} onChange={setTheme}/></div>
          </div>
        </div>

        <div className={`flex items-start justify-between gap-4 px-6 py-2 border-b ${divider}`}>
          <div className="flex items-center justify-between mt-2">
            <label htmlFor="items-per-page-input" className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Items per page</label>
            <div className="h-4">
              {paginationSaveState === "saving" && <span className={`text-xs font-mono ${meta}`}>Saving…</span>}
              {paginationSaveState === "saved" && <span className="text-xs font-mono text-emerald-400">Saved</span>}
              {paginationSaveState === "error" && <span className="text-xs font-mono text-red-400">Failed to save</span>}
            </div>
          </div>

          {paginationLoading ? (
            <p className={`text-sm mt-3 ${meta}`}>Loading…</p>
          ) : paginationError && !paginationSettings ? (
            <p className="text-sm mt-3 text-red-400">{paginationError}</p>
          ) : paginationSettings ? (
            <div>
              <div className="flex items-center gap-2">
                <input
                  id="items-per-page-input"
                  type="number"
                  min={MIN_ITEMS_PER_PAGE}
                  max={MAX_ITEMS_PER_PAGE}
                  value={paginationInputValue}
                  disabled={paginationSaveState === "saving"}
                  onChange={(e) => setPaginationInputValue(e.target.value)}
                  className="px-2 py-1 text-sm rounded-[var(--rt-radius)] border border-border bg-surface text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handlePaginationApply}
                  disabled={isPaginationApplyDisabled}
                  className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed profolder:bg-surface-selected profolder:hover:bg-surface-selected profolder:text-chrome-ink-secondary profolder:border profolder:border-chrome-ink-secondary"
                >
                  Apply
                </button>
              </div>
              {paginationError ? <p className="text-sm mt-2 text-red-400">{paginationError}</p> : null}
            </div>
          ) : null}
        </div>

        <div className={`flex items-start justify-between gap-4 px-6 py-2 border-b ${divider}`}>
          <div className="flex items-center justify-between mt-2">
            <label htmlFor="duplicate-threshold-input" className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Duplicate match threshold (%)</label>
            <div className="h-4">
              {duplicateThresholdSaveState === "saving" && <span className={`text-xs font-mono ${meta}`}>Saving…</span>}
              {duplicateThresholdSaveState === "saved" && <span className="text-xs font-mono text-emerald-400">Saved</span>}
              {duplicateThresholdSaveState === "error" && <span className="text-xs font-mono text-red-400">Failed to save</span>}
            </div>
          </div>
          {settings ? (
            <div>
              <div className="flex items-center gap-2">
                <input
                  id="duplicate-threshold-input"
                  type="number"
                  min={MIN_DUPLICATE_MATCH_THRESHOLD_PERCENT}
                  max={MAX_DUPLICATE_MATCH_THRESHOLD_PERCENT}
                  value={duplicateThresholdInputValue}
                  disabled={duplicateThresholdSaveState === "saving"}
                  onChange={(e) => setDuplicateThresholdInputValue(e.target.value)}
                  className="px-2 py-1 text-sm rounded-[var(--rt-radius)] border border-border bg-surface text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleDuplicateThresholdApply}
                  disabled={isDuplicateThresholdApplyDisabled}
                  aria-label="Apply duplicate match threshold"
                  className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed profolder:bg-surface-selected profolder:hover:bg-surface-selected profolder:text-chrome-ink-secondary profolder:border profolder:border-chrome-ink-secondary"
                >
                  Apply
                </button>
              </div>
              {duplicateThresholdError ? <p className="text-sm mt-2 text-red-400">{duplicateThresholdError}</p> : null}
            </div>
          ) : null}
        </div>
        <div className={`flex-0.5 overflow-y-auto px-6 py-2 border-b ${divider}`}>
          <div className="flex items-center justify-between mb-1 mt-2">
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
            <div className="divide-y divide-border">
              <SettingRow
                label="Exclude Samples folders"
                description="Skip any folder named “Samples” — usually imported/library audio, not your own production content."
                checked={settings.excludeSamplesFolders}
                disabled={saveState === "saving"}
                onChange={(checked) => handleChange({excludeSamplesFolders: checked})}
              />
              <SettingRow
                label="Exclude Backup folders"
                description="Skip any folder named “Backup” — Ableton's auto-saved project versions, not real production content."
                checked={settings.excludeBackupFolders}
                disabled={saveState === "saving"}
                onChange={(checked) => handleChange({excludeBackupFolders: checked})}
              />
            </div>
          ) : null}
          <p className={`text-xs mt-4 mb-2 ${meta}`}>Folder exclusion changes apply the next time you run a scan.</p>
        </div>
        <div className={`flex-1 overflow-y-auto px-6 py-2 ${runtimeMode === "desktop" ? `border-b ${divider}` : ""}`}>
          <div className="flex items-center justify-between mb-1 mt-2">
            <p className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Confirmation Settings</p>
            <div className="h-4">
              {confirmSaveState === "saving" && <span className={`text-xs font-mono ${meta}`}>Saving…</span>}
              {confirmSaveState === "saved" && <span className="text-xs font-mono text-emerald-400">Saved</span>}
              {confirmSaveState === "error" && <span className="text-xs font-mono text-red-400">Failed to save</span>}
            </div>
          </div>

          {confirmLoading ? (
            <p className={`text-sm mt-3 ${meta}`}>Loading…</p>
          ) : confirmError ? (
            <p className="text-sm mt-3 text-red-400">{confirmError}</p>
          ) : confirmSettings ? (
            <div className="divide-y divide-border">
              <SettingRow
                label="Confirm tab deletion"
                description="Require typing the tab's exact name before it can be deleted."
                checked={confirmSettings.confirmTabDeletion}
                disabled={confirmSaveState === "saving"}
                onChange={(checked) => handleConfirmChange({confirmTabDeletion: checked})}
              />
              <SettingRow
                label="Confirm copy"
                description="Require typing COPY before a copy operation runs."
                checked={confirmSettings.confirmCopy}
                disabled={confirmSaveState === "saving"}
                onChange={(checked) => handleConfirmChange({confirmCopy: checked})}
              />
              <SettingRow
                label="Confirm move"
                description="Require typing MOVE before a move operation runs."
                checked={confirmSettings.confirmMove}
                disabled={confirmSaveState === "saving"}
                onChange={(checked) => handleConfirmChange({confirmMove: checked})}
              />
              <SettingRow
                label="Confirm delete"
                description="Require typing DELETE before a delete operation runs."
                checked={confirmSettings.confirmDelete}
                disabled={confirmSaveState === "saving"}
                onChange={(checked) => handleConfirmChange({confirmDelete: checked})}
              />
              <SettingRow
                label="Confirm status deletion"
                description="Require typing the status's exact name before it can be deleted from the catalog."
                checked={confirmSettings.confirmStatusDeletion}
                disabled={confirmSaveState === "saving"}
                onChange={(checked) => handleConfirmChange({confirmStatusDeletion: checked})}
              />
              <SettingRow
                label="Confirm tag deletion"
                description="Require typing the tag's exact name before it can be deleted from the catalog."
                checked={confirmSettings.confirmTagDeletion}
                disabled={confirmSaveState === "saving"}
                onChange={(checked) => handleConfirmChange({confirmTagDeletion: checked})}
              />
            </div>
          ) : null}
        </div>
        {runtimeMode === "desktop" ? (
          <div className="flex-1 overflow-y-auto px-6 py-2">
            <div className="flex items-center justify-between mb-1 mt-2">
              <p className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Data Location</p>
              <div className="h-4">
                {dbApplyState === "applying" && <span className={`text-xs font-mono ${meta}`}>Saving…</span>}
                {dbApplyState === "error" && <span className="text-xs font-mono text-red-400">Failed to save</span>}
              </div>
            </div>

            {dbLoading ? (
              <p className={`text-sm mt-3 ${meta}`}>Loading…</p>
            ) : dbLoadError ? (
              <p className="text-sm mt-3 text-red-400">{dbLoadError}</p>
            ) : dbApplyState === "restarting" ? (
              <p className="text-sm mt-3 text-emerald-400">Restarting… the app will relaunch shortly to use the new database location.</p>
            ) : pendingDbPath ? (
              <div>
                <p className={`text-xs mt-1 mb-2 ${meta}`}>New database location:</p>
                <span className="block text-xs font-mono truncate max-w-[280px] text-slate-500" title={pendingDbPath}>
                  {pendingDbPath}
                </span>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleApplyDbLocation}
                    disabled={dbApplyState === "applying"}
                    className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed profolder:bg-surface-selected profolder:hover:bg-surface-selected profolder:text-chrome-ink-secondary profolder:border profolder:border-chrome-ink-secondary"
                  >
                    {dbApplyState === "applying" ? "Applying…" : "Apply & Restart"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelDbLocation}
                    disabled={dbApplyState === "applying"}
                    className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
                {dbError ? <p className="text-sm mt-2 text-red-400">{dbError}</p> : null}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono truncate max-w-[220px] text-slate-500" title={dbPath}>
                    {dbPath ?? "…"}
                  </span>
                  <button
                    type="button"
                    onClick={handleChooseDbLocation}
                    disabled={dbChoosing}
                    className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {dbChoosing ? "Waiting…" : "Choose…"}
                  </button>
                </div>
                {dbError ? <p className="text-sm mt-2 text-red-400">{dbError}</p> : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
