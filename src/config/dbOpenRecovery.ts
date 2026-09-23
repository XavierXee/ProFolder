/**
 * Pure orchestration for the "openDb() failed while a DB-path override was in effect" recovery
 * flow (see `electron/main.ts`'s `createProductionWindow`). Deliberately has ZERO Electron
 * dependency (no `dialog`/`app` imports) — every side effect (showing the actual native dialog,
 * clearing the override, relaunching, quitting) is injected as a callback, matching this
 * codebase's existing "explicit provider function" convention (see `desktopPrefs.ts`'s own doc
 * comment). This is what makes the branch-selection logic itself (which choice leads to which
 * sequence of side effects) unit-testable without a real Electron process, which the two
 * Electron-dependent halves of this flow (showing a real native dialog, actually relaunching a
 * packaged app) are not.
 */

/** The two choices offered by the recovery dialog. */
export type DbOpenRecoveryChoice = "reset" | "quit";

export interface DbOpenRecoveryDeps {
  /** Shows the actual native recovery dialog and returns which button the user picked. */
  showRecoveryDialog: () => DbOpenRecoveryChoice;
  /** Same as `desktopPrefs.ts`'s `clearDbPathOverride` — injected so this stays dependency-free. */
  clearDbPathOverride: (prefsFilePath: string) => void;
  /** Relaunches the app (expected to itself exit the current process — never returns). */
  relaunch: () => void;
  /** Quits the app. */
  quit: () => void;
}

/**
 * Runs the "Reset to Default Location" vs "Quit" decision: on "reset", clears the override
 * BEFORE relaunching (so the fresh launch actually sees no override and falls back to the
 * default path, rather than looping back into the same failure) and never quits; on "quit",
 * quits without touching the override or relaunching. The ordering of the "reset" branch's two
 * calls is the specific regression this function's own tests guard — swapping them, or dropping
 * either one, would silently break the recovery flow in a way that's easy to get wrong when
 * editing this code by hand.
 */
export function recoverFromDbOpenFailure(prefsFilePath: string, deps: DbOpenRecoveryDeps): void {
  const choice = deps.showRecoveryDialog();
  if (choice === "reset") {
    deps.clearDbPathOverride(prefsFilePath);
    deps.relaunch();
    return;
  }
  deps.quit();
}
