/**
 * Picks an EXISTING database FILE (not a folder) — a sibling to `FolderPickerService`, not a
 * modification of it, since choosing a `.db` file needs Electron's `openFile` dialog mode
 * (with a file-type filter) rather than `openDirectory`.
 *
 * Desktop-only: there is no web-mode/Mac counterpart (no `MacDbFilePickerService`), since the
 * desktop-data-location setting this backs has no web-mode UI at all — see
 * `electron/main.ts`/`src/api/routes/config.ts`'s `runtimeMode`-gated `/api/config/db-location`
 * routes.
 */
export interface DbFilePickerService {
  /** Opens a native "choose file" dialog scoped to database files. Resolves with the chosen
   * absolute path, or `undefined` if the user canceled. */
  chooseDbFile(promptText: string): Promise<string | undefined>;
}
