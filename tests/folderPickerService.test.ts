import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { MacFolderPickerService } from "../src/services/FolderPickerService.js";

type ExecFileCallback = (error: (Error & { code?: number }) | null, stdout: string, stderr: string) => void;

function mockExecFile(error: (Error & { code?: number }) | null, stdout: string, stderr: string): void {
  vi.mocked(execFile).mockImplementation(((..._args: unknown[]) => {
    const callback = _args[_args.length - 1] as ExecFileCallback;
    callback(error, stdout, stderr);
    return {} as ReturnType<typeof execFile>;
  }) as typeof execFile);
}

describe("MacFolderPickerService", () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset();
  });

  it("resolves with the trimmed chosen path on success", async () => {
    mockExecFile(null, "/Users/test/Music\n", "");

    const result = await new MacFolderPickerService().chooseFolder("Select a folder");

    expect(result).toBe("/Users/test/Music");
  });

  it("resolves with undefined when the user cancels the dialog", async () => {
    const error = new Error("Command failed");
    mockExecFile(error, "", "execution error: User canceled. (-128)");

    const result = await new MacFolderPickerService().chooseFolder("Select a folder");

    expect(result).toBeUndefined();
  });

  it("rejects for errors unrelated to cancellation", async () => {
    const error = new Error("spawn osascript ENOENT");
    mockExecFile(error, "", "");

    await expect(new MacFolderPickerService().chooseFolder("Select a folder")).rejects.toThrow(
      "spawn osascript ENOENT"
    );
  });
});
