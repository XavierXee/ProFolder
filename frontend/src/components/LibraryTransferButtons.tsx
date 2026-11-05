import { useRef, useState } from "react";
import * as api from "../api/client.js";
import type { ImportSummary } from "../types.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Holds the import summary across the page reload that follows a successful import. */
const PENDING_IMPORT_MESSAGE_KEY = "musicLibraryManager.importMessage";

// The File System Access API's save picker (Chromium and Electron), missing from TypeScript's DOM types.
type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;

const buttonClass =
  "flex items-center justify-center px-3 py-1.5 pr-[6px] pl-[6px] rounded-[var(--rt-radius)] text-xs font-mono font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-wait border-chrome-border text-chrome-ink-secondary hover:text-chrome-ink hover:border-chrome-border-hover";

/** One sentence describing what an import changed. */
export function describeImport(s: ImportSummary): string {
  const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;
  const parts: string[] = [];
  const updated = [
    s.files.updated > 0 ? plural(s.files.updated, "audio file") : "",
    s.projects.updated > 0 ? plural(s.projects.updated, "project folder") : "",
  ].filter(Boolean);
  if (updated.length > 0) parts.push(`${updated.join(" and ")} filled in`);
  const added = [
    s.statusesAdded > 0 ? plural(s.statusesAdded, "status", "statuses") : "",
    s.tagsAdded > 0 ? plural(s.tagsAdded, "tag") : "",
    s.customTabsAdded > 0 ? plural(s.customTabsAdded, "custom tab") : "",
  ].filter(Boolean);
  if (added.length > 0) parts.push(`${added.join(", ")} added`);
  if (s.settingsApplied > 0) parts.push(`${plural(s.settingsApplied, "setting")} applied`);
  if (s.scanExclusionsApplied) parts.push("scan exclusions applied");

  let message = parts.length > 0 ? `Import complete: ${parts.join("; ")}.` : "Import complete: nothing new to add.";
  const skipped = s.files.notInLibrary + s.projects.notInLibrary;
  if (skipped > 0) message += ` ${plural(skipped, "item")} not in this library skipped.`;
  return message;
}

/** The import summary saved before the post-import reload, if any. Only reads it: React may run
 * a state initializer twice in development, so clearing it happens separately (below). */
export function peekPendingImportMessage(): string | undefined {
  try {
    return sessionStorage.getItem(PENDING_IMPORT_MESSAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Forgets the post-import summary once it's been shown, so a later reload doesn't repeat it. */
export function clearPendingImportMessage(): void {
  try {
    sessionStorage.removeItem(PENDING_IMPORT_MESSAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * The header's Export and Import buttons. Export asks where to save the library workbook (.xlsx)
 * and writes it there; Import asks for a workbook, sends it to the server, then reloads the app so
 * every list, catalog and setting shows the imported data.
 */
export default function LibraryTransferButtons({
  onMessage,
  reload = () => window.location.reload(),
}: {
  /** Shows a message to the user (the app's notification badge). */
  onMessage: (message: string) => void;
  reload?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  async function handleExport() {
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
    setBusy("export");
    try {
      if (picker) {
        // Asked first, while the click still counts as a user gesture (the picker requires one).
        const date = new Date().toISOString().slice(0, 10);
        const handle = await picker({
          suggestedName: `ProFolder export ${date}.xlsx`,
          types: [{ description: "Excel workbook", accept: { [XLSX_MIME]: [".xlsx"] } }],
        });
        const { blob } = await api.exportLibrary();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        // No save picker (Firefox, Safari): a regular download, saved where the browser saves them.
        const { blob, filename } = await api.exportLibrary();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }
      onMessage("Library exported.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // picker cancelled
      onMessage(err instanceof Error ? `Export failed: ${err.message}` : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be chosen again later
    if (!file) return;
    setBusy("import");
    try {
      const message = describeImport(await api.importLibrary(file));
      try {
        sessionStorage.setItem(PENDING_IMPORT_MESSAGE_KEY, message);
      } catch {
        // Not shown after the reload; the data is imported regardless.
      }
      reload();
    } catch (err) {
      onMessage(err instanceof Error ? `Import failed: ${err.message}` : "Import failed.");
      setBusy(null);
    }
  }

  return (
    <>
      <button
        onClick={handleExport}
        disabled={busy !== null}
        aria-label="Export library"
        title="Export the library to an Excel workbook"
        className={buttonClass}
      >
        {/* Arrow out of a tray */}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 0l-4 4m4-4l4 4M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
        </svg>
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={busy !== null}
        aria-label="Import library"
        title="Import an exported Excel workbook (fills in missing data only)"
        className={buttonClass}
      >
        {/* Arrow into a tray */}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
        </svg>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={`.xlsx,${XLSX_MIME}`}
        onChange={handleFileChosen}
        className="hidden"
        data-testid="library-import-input"
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  );
}
