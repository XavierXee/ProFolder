import { dialog } from "electron";
import type { FolderPickerService } from "./FolderPickerService.js";

/**
 * Opens Electron's native "choose folder" dialog. Only usable inside an Electron main-process
 * runtime (imports `electron`, which is unavailable/unnecessary in plain web-server mode) —
 * kept in its own file, separate from `FolderPickerService.ts`, so that the plain Node/Express
 * entrypoint's module graph never pulls in the `electron` package.
 */
export class ElectronFolderPickerService implements FolderPickerService {
  async chooseFolder(promptText: string): Promise<string | undefined> {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: promptText,
      properties: ["openDirectory"],
    });

    if (canceled || filePaths.length === 0) {
      return undefined;
    }

    return filePaths[0];
  }
}
