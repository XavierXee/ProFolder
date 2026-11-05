import { useEffect, useRef, useState } from "react";
import * as api from "../api/client.js";
import type { CustomTab, CustomTabType, TrackStatus } from "../types.js";
import { MultiSelectDropdown } from "./MultiSelectDropdown.js";
import { SCORE_OPTIONS, SCORE_RESERVE_LABEL, TAGS_RESERVE_LABEL } from "./FilterToolbar.js";
import { buildStatusOptions } from "../statusStyles.js";
import { useStatusCatalog } from "../contexts/StatusCatalogContext.js";

type ScoreOption = number | "unscored";

type Props = {
  open: boolean;
  allTags: string[];
  onClose: () => void;
  onCreated: (tab: CustomTab) => void;
  /** When set, the panel edits this tab instead of creating one: its fields start from the tab,
   * the button reads "Save", and the result goes to `onSaved`. */
  editingTab?: CustomTab | null;
  onSaved?: (tab: CustomTab) => void;
};

export default function CreateCustomTabModal({ open, allTags, onClose, onCreated, editingTab = null, onSaved }: Props) {
  const editing = editingTab !== null;
  const { statuses: catalogStatuses } = useStatusCatalog();
  const statusOptions = buildStatusOptions(catalogStatuses);
  /** Widest realistic "Status" trigger label: every status (including "Unknown") selected at once. */
  const statusReserveLabel = `Status (${statusOptions.length})`;
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomTabType>("projects");
  const [statuses, setStatuses] = useState<TrackStatus[]>([]);
  const [scores, setScores] = useState<ScoreOption[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [association, setAssociation] = useState<"associated" | "unassociated" | undefined>(undefined);
  // Checked by default: an Audio Files tab is usually a release (album, EP) whose track order matters.
  const [ordered, setOrdered] = useState(true);
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(editingTab?.name ?? "");
    setType(editingTab?.type ?? "projects");
    setStatuses(editingTab?.statuses ?? []);
    setScores(editingTab?.scores ?? []);
    setTags(editingTab?.tags ?? []);
    setAssociation(editingTab?.association);
    // A projects tab being edited may switch to Audio Files: offer Ordered ticked, as for a new tab.
    setOrdered(editingTab?.type === "files" ? editingTab.ordered : true);
    setNameError(undefined);
    setError(undefined);
    setSubmitting(false);
    setTimeout(() => closeRef.current?.focus(), 50);
  }, [open, editingTab]);

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
      const input = {
        name: trimmedName,
        type,
        statuses,
        scores,
        tags,
        association: type === "files" ? association : undefined,
        ordered: type === "files" && ordered,
      };
      if (editingTab) {
        onSaved?.(await api.updateCustomTab(editingTab.id, input));
      } else {
        onCreated(await api.createCustomTab(input));
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : editing ? "Failed to save tab" : "Failed to create tab");
    } finally {
      setSubmitting(false);
    }
  }

  const panel = "bg-surface border-border text-ink";
  const meta = "text-slate-500";
  const divider = "border-border";
  const inputBg = "bg-canvas border-border text-ink placeholder-ink-muted";
  const outlineBtn =
    "px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-border text-ink-muted hover:text-ink hover:bg-surface-hover";
  const tagOptions = allTags.map((t) => ({ value: t, label: t }));

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
        aria-label={editing ? "Edit custom tab" : "Create custom tab"}
        // Stays mounted (CSS-slid off-screen) while "closed" so its slide transition can animate
        // — without `inert`, its controls were still real, keyboard-reachable "ghost" Tab stops
        // despite being invisible and unclickable. See FileDetailPanel.tsx's identical comment.
        inert={open ? undefined : ""}
        className={`fixed right-0 top-0 h-full w-full max-w-md z-40 border-l flex flex-col transition-transform duration-250 ease-out ${panel} ${open ? "translate-x-0 shadow-2xl" : "translate-x-full"}`}
      >
        <div className={`flex items-start justify-between gap-4 px-6 py-4 border-b ${divider}`}>
          <div className="min-w-0">
            <h2 className="text-base font-mono font-medium text-blue-400">{editing ? "Edit Custom Tab" : "New Custom Tab"}</h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="mt-0.5 p-1.5 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 text-ink-muted hover:text-ink hover:bg-surface-hover"
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
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(undefined);
                }}
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
                <label className="flex items-center gap-2 text-sm cursor-pointer text-ink-secondary">
                  <input
                    type="radio"
                    name="custom-tab-type"
                    value="projects"
                    checked={type === "projects"}
                    onChange={() => {
                      setType("projects");
                      setAssociation(undefined);
                    }}
                    className="accent-blue-500"
                  />
                  Project Folders
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer text-ink-secondary">
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
                  options={statusOptions}
                  selected={statuses}
                  onChange={setStatuses}
                  reserveLabel={statusReserveLabel}
                />
                <MultiSelectDropdown
                  label="Tags"
                  options={tagOptions}
                  selected={tags}
                  onChange={setTags}
                  reserveLabel={TAGS_RESERVE_LABEL}
                />
                <MultiSelectDropdown
                  label="Score"
                  options={SCORE_OPTIONS}
                  selected={scores}
                  onChange={setScores}
                  reserveLabel={SCORE_RESERVE_LABEL}
                />
              </div>
            </div>

            {type === "files" && (
              <fieldset>
                <legend className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>Locations</legend>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-ink-secondary">
                    <input
                      type="radio"
                      name="custom-tab-association"
                      checked={association === undefined}
                      onChange={() => setAssociation(undefined)}
                      className="accent-blue-500"
                    />
                    All locations
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-ink-secondary">
                    <input
                      type="radio"
                      name="custom-tab-association"
                      checked={association === "associated"}
                      onChange={() => setAssociation("associated")}
                      className="accent-blue-500"
                    />
                    Only files within project folders
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-ink-secondary">
                    <input
                      type="radio"
                      name="custom-tab-association"
                      checked={association === "unassociated"}
                      onChange={() => setAssociation("unassociated")}
                      className="accent-blue-500"
                    />
                    Only files outside of project folders
                  </label>
                </div>
              </fieldset>
            )}

            {type === "files" && (
              <div>
                <p className={`text-xs font-mono uppercase tracking-wider mb-2 ${meta}`}>Order</p>
                <label className="flex items-start gap-2 text-sm cursor-pointer text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={ordered}
                    onChange={(e) => setOrdered(e.target.checked)}
                    className="accent-blue-500 mt-1"
                    aria-describedby="custom-tab-ordered-hint"
                  />
                  <span>
                    Ordered
                    <span id="custom-tab-ordered-hint" className={`block text-xs ${meta}`}>
                      Number the files and reorder them by drag and drop, like an album's track list.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          <div className={`px-6 py-2 border-t ${divider} flex items-center justify-end gap-2`}>
            <button
              onClick={onClose}
              type="button"
              className={outlineBtn}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 rounded-[var(--rt-radius)] text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 profolder:bg-surface-selected profolder:hover:bg-surface-selected profolder:text-chrome-ink-secondary profolder:border profolder:border-chrome-ink-secondary"
            >
              {editing ? (submitting ? "Saving…" : "Save") : submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
