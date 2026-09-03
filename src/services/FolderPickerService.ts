import { execFile } from "node:child_process";

export interface FolderPickerService {
  /** Opens a native folder picker. Resolves with the chosen absolute path, or `undefined` if the user canceled. */
  chooseFolder(promptText: string): Promise<string | undefined>;
}

const USER_CANCELED_PATTERN = /-128|user canceled/i;

/** Opens the native macOS "Choose Folder" dialog via AppleScript. */
export class MacFolderPickerService implements FolderPickerService {
  async chooseFolder(promptText: string): Promise<string | undefined> {
    const escapedPrompt = promptText.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const script = `POSIX path of (choose folder with prompt "${escapedPrompt}")`;

    return new Promise((resolve, reject) => {
      execFile("osascript", ["-e", script], (error, stdout, stderr) => {
        if (error) {
          if (USER_CANCELED_PATTERN.test(stderr) || USER_CANCELED_PATTERN.test(error.message)) {
            resolve(undefined);
          } else {
            reject(error);
          }
          return;
        }
        resolve(stdout.trim());
      });
    });
  }
}
