import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { ConfirmationSettings, PaginationSettings, ScanSettings } from "../api/client.js";
import { setItemsPerPageGlobally } from "../hooks/useItemsPerPage.js";
import {ThemeSelector} from "./ThemeSelector";
import {Theme} from "../types";

const MIN_ITEMS_PER_PAGE = 5;
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
    <label
      // The description only shows as a native tooltip on hover (title) rather than always
      // taking up a second line below the label — saves a line per row across 8 rows in this
      // panel. It's on the <label> (not just the checkbox) so hovering either the checkbox or
      // its text shows it. It's still part of the checkbox's accessible name via the sr-only
      // span below, same as when it was visible (name-from-content still folds in CSS
      // visually-hidden text, unlike display:none/visibility:hidden).
      title={description}
      className={`flex items-center gap-3 py-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-blue-500"
      />
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="sr-only">{description}</span>
    </label>
  );
}

export default function SettingsPanel({ theme, setTheme, open, onClose }: Props) {
  const [settings, setSettings] = useState<ScanSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanSettingsSaving, setScanSettingsSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [duplicateThresholdInputValue, setDuplicateThresholdInputValue] = useState("");
  const [duplicateThresholdSaving, setDuplicateThresholdSaving] = useState(false);
  const [excludeFolderPatternInputValue, setExcludeFolderPatternInputValue] = useState("");
  const [excludeFolderPatternSaving, setExcludeFolderPatternSaving] = useState(false);
  const [confirmSettings, setConfirmSettings] = useState<ConfirmationSettings | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmSettingsSaving, setConfirmSettingsSaving] = useState(false);
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [paginationSettings, setPaginationSettingsState] = useState<PaginationSettings | null>(null);
  const [paginationInputValue, setPaginationInputValue] = useState("");
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [paginationSaving, setPaginationSaving] = useState(false);
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
  const [dbApplyState, setDbApplyState] = useState<"idle" | "applying" | "restarting">("idle");
  const closeRef = useRef<HTMLButtonElement>(null);

  // Every section used to show its own "Saving…"/"Saved"/"Failed to save" indicator right next
  // to its own heading — a single save action could leave up to half a dozen of these scattered
  // around the panel. This single piece of state (rendered once, at the bottom of the panel —
  // see the footer near the end of the JSX below) replaces all of them. "saving" is left to be
  // superseded by the real request's own resolution rather than auto-dismissed on a timer — a
  // slow request must not have its only feedback vanish after 2s while still in flight.
  const [notification, setNotification] = useState<{ type: "saving" | "success" | "error"; message: string } | null>(
    null
  );
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotification(type: "saving" | "success" | "error", message: string) {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
      notificationTimeoutRef.current = null;
    }
    setNotification({ type, message });
    if (type !== "saving") {
      notificationTimeoutRef.current = setTimeout(() => {
        setNotification(null);
        notificationTimeoutRef.current = null;
      }, 2000);
    }
  }

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
      notificationTimeoutRef.current = null;
    }
    setNotification(null);
    setLoading(true);
    setError(undefined);
    setScanSettingsSaving(false);
    setDuplicateThresholdSaving(false);
    setExcludeFolderPatternSaving(false);
    api
      .getScanSettings()
      .then((settings) => {
        setSettings(settings);
        setDuplicateThresholdInputValue(String(settings.duplicateMatchThresholdPercent));
        setExcludeFolderPatternInputValue(settings.excludeFolderPattern);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setLoading(false));
    setConfirmLoading(true);
    setConfirmError(undefined);
    setConfirmSettingsSaving(false);
    api
      .getConfirmationSettings()
      .then(setConfirmSettings)
      .catch((err) => setConfirmError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setConfirmLoading(false));
    setPaginationLoading(true);
    setPaginationError(undefined);
    setPaginationSaving(false);
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
    setScanSettingsSaving(true);
    showNotification("saving", "Saving…");
    api
      .setScanSettings(patch)
      .then((result) => {
        setSettings(result);
        showNotification("success", "Saved");
      })
      .catch(() => showNotification("error", "Failed to save"))
      .finally(() => setScanSettingsSaving(false));
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
    duplicateThresholdSaving || !isDuplicateThresholdInputValid || isDuplicateThresholdInputUnchanged;

  function handleDuplicateThresholdApply() {
    if (isDuplicateThresholdApplyDisabled) return;
    setDuplicateThresholdSaving(true);
    showNotification("saving", "Saving…");
    api
      .setScanSettings({ duplicateMatchThresholdPercent: parsedDuplicateThresholdInput })
      .then((result) => {
        setSettings(result);
        setDuplicateThresholdInputValue(String(result.duplicateMatchThresholdPercent));
        showNotification("success", "Saved");
      })
      .catch((err) => {
        showNotification("error", err instanceof Error ? err.message : "Failed to save settings");
      })
      .finally(() => setDuplicateThresholdSaving(false));
  }

  const isExcludeFolderPatternInputValid = (() => {
    if (excludeFolderPatternInputValue.trim() === "") return false;
    try {
      new RegExp(excludeFolderPatternInputValue);
      return true;
    } catch {
      return false;
    }
  })();
  const isExcludeFolderPatternInputUnchanged =
    settings !== null && excludeFolderPatternInputValue === settings.excludeFolderPattern;
  const isExcludeFolderPatternApplyDisabled =
    excludeFolderPatternSaving || !isExcludeFolderPatternInputValid || isExcludeFolderPatternInputUnchanged;

  function handleExcludeFolderPatternApply() {
    if (isExcludeFolderPatternApplyDisabled) return;
    setExcludeFolderPatternSaving(true);
    showNotification("saving", "Saving…");
    api
      .setScanSettings({ excludeFolderPattern: excludeFolderPatternInputValue })
      .then((result) => {
        setSettings(result);
        setExcludeFolderPatternInputValue(result.excludeFolderPattern);
        showNotification("success", "Saved");
      })
      .catch((err) => {
        showNotification("error", err instanceof Error ? err.message : "Failed to save settings");
      })
      .finally(() => setExcludeFolderPatternSaving(false));
  }

  function handleConfirmChange(patch: Partial<ConfirmationSettings>) {
    setConfirmSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    setConfirmSettingsSaving(true);
    showNotification("saving", "Saving…");
    api
      .setConfirmationSettings(patch)
      .then((result) => {
        setConfirmSettings(result);
        showNotification("success", "Saved");
      })
      .catch(() => showNotification("error", "Failed to save"))
      .finally(() => setConfirmSettingsSaving(false));
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
    paginationSaving || !isPaginationInputValid || isPaginationInputUnchanged;

  function handlePaginationApply() {
    if (isPaginationApplyDisabled) return;
    setPaginationSaving(true);
    showNotification("saving", "Saving…");
    api
      .setPaginationSettings({ itemsPerPage: parsedPaginationInput })
      .then((result) => {
        setPaginationSettingsState(result);
        setPaginationInputValue(String(result.itemsPerPage));
        setItemsPerPageGlobally(result.itemsPerPage);
        showNotification("success", "Saved");
      })
      .catch((err) => {
        showNotification("error", err instanceof Error ? err.message : "Failed to save settings");
      })
      .finally(() => setPaginationSaving(false));
  }

  async function handleChooseDbLocation() {
    setDbChoosing(true);
    try {
      const chosen = await api.chooseDbLocation();
      if (chosen) setPendingDbPath(chosen);
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Could not open the file picker");
    } finally {
      setDbChoosing(false);
    }
  }

  function handleCancelDbLocation() {
    setPendingDbPath(undefined);
    setDbApplyState("idle");
  }

  // Deliberately does NOT auto-apply on selection the way RootPathControl's folder browse does:
  // this action restarts the whole app, so it needs an explicit confirm step rather than firing
  // from a single misclick.
  async function handleApplyDbLocation() {
    if (!pendingDbPath) return;
    setDbApplyState("applying");
    try {
      await api.setDbLocation(pendingDbPath);
      // Success: the app is about to relaunch. There is nothing more to poll or confirm, and the
      // resulting connection drop is expected, not an error. The dedicated "Restarting…" message
      // below already communicates this better than the shared bottom notification would (which
      // auto-dismisses after 2s — this state should not, since the app hasn't restarted yet).
      setDbApplyState("restarting");
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Could not update the database location");
      setDbApplyState("idle");
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
          </div>

          {paginationLoading ? (
            <p className={`text-sm mt-3 ${meta}`}>Loading…</p>
          ) : paginationError && !paginationSettings ? (
            <p className="text-sm mt-3 text-red-400">{paginationError}</p>
          ) : paginationSettings ? (
            <div className="flex items-center gap-2">
              <input
                id="items-per-page-input"
                type="number"
                min={MIN_ITEMS_PER_PAGE}
                max={MAX_ITEMS_PER_PAGE}
                value={paginationInputValue}
                disabled={paginationSaving}
                onChange={(e) => setPaginationInputValue(e.target.value)}
                className="w-[62px] px-2 py-1 text-sm rounded-[var(--rt-radius)] border border-border bg-surface text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
          ) : null}
        </div>

        <div className={`flex items-start justify-between gap-4 px-6 py-2 border-b ${divider}`}>
          <div className="flex items-center justify-between mt-2">
            <label htmlFor="duplicate-threshold-input" className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Duplicate match threshold (%)</label>
          </div>
          {settings ? (
            <div className="flex items-center gap-2">
              <input
                id="duplicate-threshold-input"
                type="number"
                min={MIN_DUPLICATE_MATCH_THRESHOLD_PERCENT}
                max={MAX_DUPLICATE_MATCH_THRESHOLD_PERCENT}
                value={duplicateThresholdInputValue}
                disabled={duplicateThresholdSaving}
                onChange={(e) => setDuplicateThresholdInputValue(e.target.value)}
                className="w-[62px] px-2 py-1 text-sm rounded-[var(--rt-radius)] border border-border bg-surface text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
          ) : null}
        </div>
        {runtimeMode === "desktop" ? (
          <div className={`flex-0.5 overflow-y-auto px-6 pt-2 pb-4 border-b ${divider}`}>
            <div className="flex items-center justify-between mb-1 mt-2">
              <p className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Data Location</p>
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
                <div className="flex justify-between items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleApplyDbLocation}
                    disabled={dbApplyState === "applying"}
                    className="w-[126px] px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed profolder:bg-surface-selected profolder:hover:bg-surface-selected profolder:text-chrome-ink-secondary profolder:border profolder:border-chrome-ink-secondary"
                  >
                    {dbApplyState === "applying" ? "Applying…" : "Apply & Restart"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelDbLocation}
                    disabled={dbApplyState === "applying"}
                    className="w-[126px] px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs font-mono truncate max-w-[220px] text-slate-500" title={dbPath}>
                  {dbPath ?? "…"}
                </span>
                <button
                  type="button"
                  onClick={handleChooseDbLocation}
                  disabled={dbChoosing}
                  className="w-[126px] px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {dbChoosing ? "Waiting…" : "Choose…"}
                </button>
              </div>
            )}
          </div>
        ) : null}
        <div className={`flex-0.5 overflow-y-auto px-6 py-2 border-b ${divider}`}>
          <div className="flex items-center justify-between mb-1 mt-2">
            <p className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Scan Settings</p>
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
                disabled={scanSettingsSaving}
                onChange={(checked) => handleChange({excludeSamplesFolders: checked})}
              />
              <SettingRow
                label="Exclude Backup folders"
                description="Skip any folder named “Backup” — Ableton's auto-saved project versions, not real production content."
                checked={settings.excludeBackupFolders}
                disabled={scanSettingsSaving}
                onChange={(checked) => handleChange({excludeBackupFolders: checked})}
              />
              <SettingRow
                label="Exclude folders by pattern"
                description="Skip any folder whose name matches the regular expression below."
                checked={settings.excludeFolderPatternEnabled}
                disabled={scanSettingsSaving}
                onChange={(checked) => handleChange({excludeFolderPatternEnabled: checked})}
              />
            </div>
          ) : null}
          {settings ? (
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <label htmlFor="exclude-folder-pattern-input" className={`text-xs font-mono uppercase tracking-wider ${meta}`}>
                  Pattern (regular expression)
                </label>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input
                  id="exclude-folder-pattern-input"
                  type="text"
                  value={excludeFolderPatternInputValue}
                  disabled={!settings.excludeFolderPatternEnabled || excludeFolderPatternSaving}
                  onChange={(e) => setExcludeFolderPatternInputValue(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 text-sm font-mono rounded-[var(--rt-radius)] border border-border bg-surface text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleExcludeFolderPatternApply}
                  disabled={isExcludeFolderPatternApplyDisabled || !settings.excludeFolderPatternEnabled}
                  aria-label="Apply exclude folder pattern"
                  className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed profolder:bg-surface-selected profolder:hover:bg-surface-selected profolder:text-chrome-ink-secondary profolder:border profolder:border-chrome-ink-secondary"
                >
                  Apply
                </button>
              </div>
            </div>
          ) : null}
          <p className={`text-xs mt-4 mb-2 ${meta}`}>Folder exclusion changes apply the next time you run a scan.</p>
        </div>
        <div className={`flex-1 overflow-y-auto px-6 py-2 ${runtimeMode === "desktop" ? `border-b ${divider}` : ""}`}>
          <div className="flex items-center justify-between mb-1 mt-2">
            <p className={`text-xs font-mono uppercase tracking-wider ${meta}`}>Confirmation Settings</p>
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
                disabled={confirmSettingsSaving}
                onChange={(checked) => handleConfirmChange({confirmTabDeletion: checked})}
              />
              <SettingRow
                label="Confirm copy"
                description="Require typing COPY before a copy operation runs."
                checked={confirmSettings.confirmCopy}
                disabled={confirmSettingsSaving}
                onChange={(checked) => handleConfirmChange({confirmCopy: checked})}
              />
              <SettingRow
                label="Confirm move"
                description="Require typing MOVE before a move operation runs."
                checked={confirmSettings.confirmMove}
                disabled={confirmSettingsSaving}
                onChange={(checked) => handleConfirmChange({confirmMove: checked})}
              />
              <SettingRow
                label="Confirm delete"
                description="Require typing DELETE before a delete operation runs."
                checked={confirmSettings.confirmDelete}
                disabled={confirmSettingsSaving}
                onChange={(checked) => handleConfirmChange({confirmDelete: checked})}
              />
              <SettingRow
                label="Confirm status deletion"
                description="Require typing the status's exact name before it can be deleted from the catalog."
                checked={confirmSettings.confirmStatusDeletion}
                disabled={confirmSettingsSaving}
                onChange={(checked) => handleConfirmChange({confirmStatusDeletion: checked})}
              />
              <SettingRow
                label="Confirm tag deletion"
                description="Require typing the tag's exact name before it can be deleted from the catalog."
                checked={confirmSettings.confirmTagDeletion}
                disabled={confirmSettingsSaving}
                onChange={(checked) => handleConfirmChange({confirmTagDeletion: checked})}
              />
            </div>
          ) : null}
        </div>

        <div className={`px-6 h-[47px] flex items-center flex-shrink-0 border-t ${divider}`}>
          {notification && (
            <span
              className={`text-xs font-mono ${
                notification.type === "error"
                  ? "text-red-400"
                  : notification.type === "success"
                    ? "text-emerald-400"
                    : meta
              }`}
            >
              {notification.message}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
