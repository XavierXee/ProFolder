import { useEffect, useRef, useState } from "react";
import StatusBadge from "./StatusBadge.js";
import { useStatusCatalog } from "../contexts/StatusCatalogContext.js";
import * as api from "../api/client.js";
import type { StatusDef } from "../api/client.js";
import DeleteStatusConfirmDialog from "./DeleteStatusConfirmDialog.js";
import DeleteCatalogTagConfirmDialog from "./DeleteCatalogTagConfirmDialog.js";

type Props = {
  allTags: string[];
  onClose: () => void;
  /** Called after any successful tag create/rename/delete, so App.tsx can refetch `allTags`
   * (allTags is plain App.tsx state, not Context-based like the status catalog). */
  onTagsChanged: () => void;
  /** Called after a successful status delete, so App.tsx can refetch already-loaded file/project
   * rows (and stats) whose `status` column may have been reassigned to "unknown" server-side, and
   * prune the deleted key out of any active filter that references it. Not called for status
   * create/edit — those never touch any row's data, only the catalog entry's name/color, which is
   * already covered by this component's own `refetchStatuses()` above. */
  onStatusDeleted: (key: string) => void;
  /** Called after a successful tag delete (in addition to `onTagsChanged`), so App.tsx can prune
   * the deleted tag out of any active filter that references it. */
  onTagDeleted: (name: string) => void;
  /** Called after a successful tag rename (in addition to `onTagsChanged`), so App.tsx can update
   * any active filter referencing the old tag name to the new one instead. */
  onTagRenamed: (oldName: string, newName: string) => void;
};

/** Neutral starting point for a brand-new status's color, before the user picks their own. */
const DEFAULT_NEW_STATUS_COLOR = "#64748b";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function PlusIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M4 20h4L18.5 9.5a2.5 2.5 0 00-3.536-3.536L4 16.5V20z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 0v12a1 1 0 001 1h6a1 1 0 001-1V7H8z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function TagsStatusesPanel({ allTags, onClose, onTagsChanged, onStatusDeleted, onTagDeleted, onTagRenamed }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const newStatusNameRef = useRef<HTMLInputElement>(null);
  const newTagNameRef = useRef<HTMLInputElement>(null);
  const { statuses, refetch: refetchStatuses } = useStatusCatalog();

  const [addStatusOpen, setAddStatusOpen] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState(DEFAULT_NEW_STATUS_COLOR);
  const [addStatusError, setAddStatusError] = useState<string | undefined>();
  const [addStatusSaving, setAddStatusSaving] = useState(false);

  const [editingStatusKey, setEditingStatusKey] = useState<string | null>(null);
  const [editStatusName, setEditStatusName] = useState("");
  const [editStatusColor, setEditStatusColor] = useState("");
  const [editStatusError, setEditStatusError] = useState<string | undefined>();
  const [editStatusSaving, setEditStatusSaving] = useState(false);

  const [deletingStatus, setDeletingStatus] = useState<{ key: string; name: string } | null>(null);

  const [addTagOpen, setAddTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [addTagError, setAddTagError] = useState<string | undefined>();
  const [addTagSaving, setAddTagSaving] = useState(false);

  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  const [renameTagValue, setRenameTagValue] = useState("");
  const [renameTagError, setRenameTagError] = useState<string | undefined>();
  const [renameTagSaving, setRenameTagSaving] = useState(false);

  const [deletingTag, setDeletingTag] = useState<string | null>(null);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      // While a delete-confirmation dialog is open, it owns all outside-click handling itself
      // (its own backdrop click cancels just the dialog) — this panel must not also react to
      // that same click. This check has to be state-based, not DOM-containment-based: both
      // dialogs are portaled to document.body (so their `position: fixed` overlay escapes the
      // header's backdrop-filter containing block — see those files' own comments), so their
      // backdrop is a sibling of this panel in the DOM, not a descendant reachable via
      // panelRef.current.contains(...) or an ancestor closest('[role="dialog"]') lookup from it.
      if (deletingStatus !== null || deletingTag !== null) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, deletingStatus, deletingTag]);

  // The name field only exists in the DOM once its form is open (conditionally rendered, not
  // just CSS-hidden like this app's slide-in panels — see the `!addStatusOpen ? <button> :
  // <form>` ternary below), so the ref is only ever non-null by the time this effect's own
  // render has happened — no setTimeout/mount-delay hack needed here, unlike those panels' own
  // close-button auto-focus.
  useEffect(() => {
    if (addStatusOpen) newStatusNameRef.current?.focus();
  }, [addStatusOpen]);

  useEffect(() => {
    if (addTagOpen) newTagNameRef.current?.focus();
  }, [addTagOpen]);

  function startAddStatus() {
    setAddStatusOpen(true);
    setNewStatusName("");
    setNewStatusColor(DEFAULT_NEW_STATUS_COLOR);
    setAddStatusError(undefined);
  }

  function cancelAddStatus() {
    setAddStatusOpen(false);
    setAddStatusError(undefined);
  }

  async function submitAddStatus() {
    const name = newStatusName.trim();
    if (!name || addStatusSaving) return;
    setAddStatusSaving(true);
    setAddStatusError(undefined);
    try {
      await api.createStatus(name, newStatusColor);
      await refetchStatuses();
      setAddStatusOpen(false);
      setNewStatusName("");
      setNewStatusColor(DEFAULT_NEW_STATUS_COLOR);
    } catch (err) {
      setAddStatusError(errorMessage(err, "Failed to create status"));
    } finally {
      setAddStatusSaving(false);
    }
  }

  function startEditStatus(status: StatusDef) {
    setEditingStatusKey(status.key);
    setEditStatusName(status.name);
    setEditStatusColor(status.color);
    setEditStatusError(undefined);
  }

  function cancelEditStatus() {
    setEditingStatusKey(null);
    setEditStatusError(undefined);
  }

  async function submitEditStatus(key: string) {
    const name = editStatusName.trim();
    if (!name || editStatusSaving) return;
    setEditStatusSaving(true);
    setEditStatusError(undefined);
    try {
      await api.editStatus(key, { name, color: editStatusColor });
      await refetchStatuses();
      setEditingStatusKey(null);
    } catch (err) {
      setEditStatusError(errorMessage(err, "Failed to update status"));
    } finally {
      setEditStatusSaving(false);
    }
  }

  async function confirmDeleteStatus() {
    const target = deletingStatus;
    if (!target) return;
    try {
      await api.deleteStatus(target.key);
      await refetchStatuses();
      onStatusDeleted(target.key);
    } catch {
      // Best-effort, mirroring App.tsx's own catch(() => {}) convention for fire-and-forget
      // refresh calls — the dialog has already closed, so there's no inline surface left for
      // a deletion failure here.
    } finally {
      setDeletingStatus(null);
    }
  }

  function startAddTag() {
    setAddTagOpen(true);
    setNewTagName("");
    setAddTagError(undefined);
  }

  function cancelAddTag() {
    setAddTagOpen(false);
    setAddTagError(undefined);
  }

  async function submitAddTag() {
    const name = newTagName.trim();
    if (!name || addTagSaving) return;
    setAddTagSaving(true);
    setAddTagError(undefined);
    try {
      await api.createTag(name);
      onTagsChanged();
      setAddTagOpen(false);
      setNewTagName("");
    } catch (err) {
      setAddTagError(errorMessage(err, "Failed to create tag"));
    } finally {
      setAddTagSaving(false);
    }
  }

  function startRenameTag(tag: string) {
    setRenamingTag(tag);
    setRenameTagValue(tag);
    setRenameTagError(undefined);
  }

  function cancelRenameTag() {
    setRenamingTag(null);
    setRenameTagError(undefined);
  }

  async function submitRenameTag(oldName: string) {
    const name = renameTagValue.trim();
    if (!name || renameTagSaving) return;
    setRenameTagSaving(true);
    setRenameTagError(undefined);
    try {
      await api.renameTag(oldName, name);
      onTagsChanged();
      onTagRenamed(oldName, name);
      setRenamingTag(null);
    } catch (err) {
      setRenameTagError(errorMessage(err, "Failed to rename tag"));
    } finally {
      setRenameTagSaving(false);
    }
  }

  async function confirmDeleteTag() {
    const target = deletingTag;
    if (!target) return;
    try {
      await api.deleteTag(target);
      onTagsChanged();
      onTagDeleted(target);
    } catch {
      // Best-effort, mirrors confirmDeleteStatus above.
    } finally {
      setDeletingTag(null);
    }
  }

  // Same popover-panel token pattern as MetricsPanel.tsx/ThemeSelector.tsx/MultiSelectDropdown.tsx.
  const panelCls = "bg-surface border-border text-ink";
  const meta = "text-ink-muted";
  const divider = "border-border";
  // Byte-faithful reuse of TagEditor.tsx's read-only chip styling.
  const chipCls = "bg-chip-surface text-ink-secondary";
  const iconBtnCls =
    "p-1 rounded-[var(--rt-radius)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-ink-muted hover:text-ink hover:bg-surface-hover flex-shrink-0";
  // Square icon-button variant of the app's canonical primary/"save" blue (same color, hover, and
  // profolder-theme override as the Scan Library header button in App.tsx), used for the inline
  // Add/Save confirm actions instead of a rectangular text button.
  const primaryIconBtnCls =
    "p-1 rounded-[var(--rt-radius)] bg-blue-600 text-white hover:bg-blue-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed profolder:bg-surface-selected profolder:hover:bg-surface-selected profolder:text-chrome-ink-secondary profolder:border profolder:border-chrome-ink-secondary flex-shrink-0";
  const textInputCls =
    "flex-1 min-w-0 px-2 py-1 text-xs rounded-[var(--rt-radius)] border border-border bg-canvas text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
  const colorInputCls = "h-6 w-6 flex-shrink-0 rounded-[var(--rt-radius)] border border-border bg-canvas p-0.5 cursor-pointer";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Statuses and tags"
      className={`absolute right-0 top-full mt-2 w-72 rounded-[var(--rt-radius-lg)] border shadow-2xl z-50 ${panelCls}`}
    >
      <div className={`flex items-center justify-between px-4 py-3 border-b ${divider}`}>
        <span className="text-xs font-mono uppercase tracking-wider">Statuses &amp; Tags</span>
        <button
          onClick={onClose}
          aria-label="Close statuses and tags panel"
          className={iconBtnCls}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className={`px-4 py-3 border-b ${divider}`}>
        <span className={`text-xs font-mono uppercase tracking-wider ${meta}`}>
          Statuses {statuses.length > 0 && `(${statuses.length})`}
        </span>

        <div className="mt-2">
          {!addStatusOpen ? (
            <button type="button" onClick={startAddStatus} aria-label="Add status" className={`py-0.5 px-1 self-start ${iconBtnCls}`}>
              <PlusIcon />
            </button>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="py-0.5 px-1 flex items-center gap-1.5">
                <input
                  ref={newStatusNameRef}
                  type="text"
                  aria-label="New status name"
                  placeholder="Status name"
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitAddStatus();
                  }}
                  className={textInputCls}
                />
                <input
                  type="color"
                  aria-label="New status color"
                  value={newStatusColor}
                  onChange={(e) => setNewStatusColor(e.target.value)}
                  className={colorInputCls}
                />
                <button type="button" onClick={cancelAddStatus} aria-label="Cancel" className={iconBtnCls}>
                  <XIcon />
                </button>
                <button
                  type="button"
                  onClick={submitAddStatus}
                  disabled={!newStatusName.trim() || addStatusSaving}
                  aria-label="Add"
                  className={primaryIconBtnCls}
                >
                  <CheckIcon />
                </button>
              </div>
              {addStatusError && <p className="text-xs text-red-400">{addStatusError}</p>}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 mt-2 max-h-64 overflow-y-auto">
          {statuses.map((status) =>
            editingStatusKey === status.key ? (
              <div key={status.key} className="flex flex-col gap-1.5">
                <div className="py-0.5 px-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    aria-label={`Edit name for ${status.name}`}
                    value={editStatusName}
                    onChange={(e) => setEditStatusName(e.target.value)}
                    className={textInputCls}
                  />
                  <input
                    type="color"
                    aria-label={`Edit color for ${status.name}`}
                    value={editStatusColor}
                    onChange={(e) => setEditStatusColor(e.target.value)}
                    className={colorInputCls}
                  />
                  <button type="button" onClick={cancelEditStatus} aria-label="Cancel" className={iconBtnCls}>
                    <XIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => submitEditStatus(status.key)}
                    disabled={!editStatusName.trim() || editStatusSaving}
                    aria-label="Save"
                    className={primaryIconBtnCls}
                  >
                    <CheckIcon />
                  </button>
                </div>
                {editStatusError && <p className="text-xs text-red-400">{editStatusError}</p>}
              </div>
            ) : (
              <div key={status.key} className="py-1 px-1 flex items-center justify-between gap-1.5">
                <StatusBadge status={status.key} className="truncate" />
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    aria-label={`Edit status ${status.name}`}
                    onClick={() => startEditStatus(status)}
                    className={iconBtnCls}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete status ${status.name}`}
                    onClick={() => setDeletingStatus({ key: status.key, name: status.name })}
                    className={iconBtnCls}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        <span className={`text-xs font-mono uppercase tracking-wider ${meta}`}>
          Tags {allTags.length > 0 && `(${allTags.length})`}
        </span>

        <div className="mt-2">
          {!addTagOpen ? (
            <button type="button" onClick={startAddTag} aria-label="Add tag" className={`self-start ${iconBtnCls}`}>
              <PlusIcon />
            </button>
          ) : (
            <div className="flex flex-col gap-1.5 mb-2">
              <div className="py-1 px-1 flex items-center gap-1.5">
                <input
                  ref={newTagNameRef}
                  type="text"
                  aria-label="New tag name"
                  placeholder="Tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitAddTag();
                  }}
                  className={textInputCls}
                />
                <button type="button" onClick={cancelAddTag} aria-label="Cancel" className={iconBtnCls}>
                  <XIcon />
                </button>
                <button
                  type="button"
                  onClick={submitAddTag}
                  disabled={!newTagName.trim() || addTagSaving}
                  aria-label="Add"
                  className={primaryIconBtnCls}
                >
                  <CheckIcon />
                </button>
              </div>
              {addTagError && <p className="text-xs text-red-400">{addTagError}</p>}
            </div>
          )}
        </div>

        {allTags.length === 0 ? (
          <p className={`text-sm mt-2 ${meta}`}>No tags yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5 mt-2 max-h-64 overflow-y-auto">
            {allTags.map((tag) =>
              renamingTag === tag ? (
                <div key={tag} className="py-0.5 px-1 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      aria-label={`Rename tag ${tag}`}
                      value={renameTagValue}
                      onChange={(e) => setRenameTagValue(e.target.value)}
                      className={textInputCls}
                    />
                    <button type="button" onClick={cancelRenameTag} aria-label="Cancel" className={iconBtnCls}>
                      <XIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => submitRenameTag(tag)}
                      disabled={!renameTagValue.trim() || renameTagSaving}
                      aria-label="Save"
                      className={primaryIconBtnCls}
                    >
                      <CheckIcon />
                    </button>
                  </div>
                  {renameTagError && <p className="text-xs text-red-400">{renameTagError}</p>}
                </div>
              ) : (
                <div key={tag} className="py-1 px-1 flex items-center justify-between gap-1.5">
                  <span className={`text-xs font-mono truncate ${chipCls} px-2 py-0.5 rounded-[var(--rt-radius)]`}>{tag}</span>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      type="button"
                      aria-label={`Edit tag ${tag}`}
                      onClick={() => startRenameTag(tag)}
                      className={iconBtnCls}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete tag ${tag}`}
                      onClick={() => setDeletingTag(tag)}
                      className={iconBtnCls}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      <DeleteStatusConfirmDialog
        open={deletingStatus !== null}
        statusName={deletingStatus?.name ?? ""}
        onConfirm={confirmDeleteStatus}
        onCancel={() => setDeletingStatus(null)}
      />
      <DeleteCatalogTagConfirmDialog
        open={deletingTag !== null}
        tagName={deletingTag ?? ""}
        onConfirm={confirmDeleteTag}
        onCancel={() => setDeletingTag(null)}
      />
    </div>
  );
}
