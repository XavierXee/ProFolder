import { dialog } from "electron";
import type { DbFilePickerService } from "./DbFilePickerService.js";

/**
 * Opens Electron's native "choose file" dialog, scoped to SQLite database files. Only usable
 * inside an Electron main-process runtime (imports `electron`, which is unavailable/unnecessary
 * in plain web-server mode) — kept in its own file, separate from `DbFilePickerService.ts`, so
 * that the plain Node/Express entrypoint's module graph never pulls in the `electron` package
 * (mirrors `ElectronFolderPickerService.ts`'s existing convention).
 */
export class ElectronDbFilePickerService implements DbFilePickerService {
  async chooseDbFile(promptText: string): Promise<string | undefined> {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: promptText,
      properties: ["openFile"],
      filters: [{ name: "SQLite Database", extensions: ["db"] }],
    });

    if (canceled || filePaths.length === 0) {
      return undefined;
    }

    return filePaths[0];
  }
}
