/**
 * Wraps the desktop app's "open a window" startup so it is safe to call from several triggers
 * at once: the initial launch, the macOS `activate` event (Dock click, or opening the app again)
 * and a second-instance launch.
 *
 * - It waits for `whenReady` before opening anything. macOS can deliver `activate` before the
 *   app is ready, for example when the app is opened again while a freshly installed, unsigned
 *   build is still being verified on first launch; creating a window then throws "Cannot create
 *   BrowserWindow before app is ready".
 * - Calls made while a startup is still running share it rather than starting a second one,
 *   which would otherwise open the database and start the embedded server twice.
 *
 * Electron-free (the ready check and the window opening are passed in) so it can be unit tested.
 */
export function createWindowLauncher(
  whenReady: () => Promise<void>,
  openWindow: () => Promise<void>,
): () => Promise<void> {
  let inFlight: Promise<void> | undefined;
  return () => {
    inFlight ??= whenReady()
      .then(openWindow)
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };
}
