import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import waitOn from "wait-on";
// Type-only imports — erased at compile time, so unlike the dynamic `import()`s inside
// `createProductionWindow` below, these do NOT trigger `better-sqlite3`'s/`config.ts`'s
// module-level side effects at load time. They exist purely so the module-level tracking
// variables below (`embeddedDb`/`embeddedServer`, used by the graceful-shutdown handler) can be
// typed precisely.
import type Database from "better-sqlite3";
import type { Server as HttpServer } from "node:http";

/**
 * Electron main process entry point.
 *
 * Dev mode (`npm run dev:electron`, Task 9 — UNCHANGED here): points the window at the
 * already-running `npm run dev` dev servers — Vite's dev server for the frontend, and the
 * plain Express API server it proxies `/api/*` requests to (see `vite.config.ts`'s
 * `server.proxy` config) — rather than embedding its own server.
 *
 * Production mode (Task 11): a packaged build has no separate dev servers to wait on, so this
 * embeds its own Express API server in-process — wired with the `Electron*Service` classes for
 * native OS integration (folder picker / trash / reveal-in-Finder) instead of the `Mac*`
 * classes the plain web entrypoint uses — and loads that server's own origin directly.
 *
 * `app.isPackaged` (Electron's own built-in flag, true only when running from a real packaged
 * build, false under `electron .` in a dev checkout) is the mode signal, per the task spec —
 * not `NODE_ENV` or a custom env var, since those are easy to leave mis-set in a real packaged
 * build in a way `app.isPackaged` cannot be.
 */

// Vite's dev server: `vite.config.ts` configures no `server.port` override, so this is Vite's
// own default port.
const VITE_DEV_SERVER_URL = "http://localhost:5173";
// The plain API server's default port (see `src/config/config.ts`'s `config.port`), used ONLY
// by dev mode below to probe the separately-running `npm run dev:api` process — unrelated to
// the packaged production server, which binds to an OS-assigned free port instead (see
// `createProductionWindow`) so a packaged install never conflicts with this or any other
// localhost process.
const API_DEV_SERVER_PORT = 5175;

// The app icon (the same logo mark rendered by `frontend/src/components/Logo.tsx`'s splash
// screen), used for the dev-mode window/Dock icon below. `app.getAppPath()` resolves to the
// project root under `electron .` (dev mode) — this is NOT used for a packaged build's icon,
// which comes from the bundle itself via `electron-builder.yml`'s `mac.icon`/`win.icon`/
// `linux.icon` config instead (`build/` is a build-time-only asset directory, never copied into
// the packaged app, so this path wouldn't resolve there anyway).
const DEV_ICON_PATH = path.join(app.getAppPath(), "build/icon.png");

// Populated only by `createProductionWindow` (dev mode has nothing of its own to track here —
// its dev servers are separate processes, unaffected by this Electron window closing). Read by
// the `before-quit` graceful-shutdown handler below. Typed via the type-only imports above so
// this file never has to statically import `better-sqlite3`/the server itself (see
// `createProductionWindow`'s own doc comment for why those must stay dynamic imports).
let embeddedDb: Database.Database | undefined;
let embeddedServer: HttpServer | undefined;
// The actual OS-assigned port the embedded server ended up bound to (see `createProductionWindow`),
// read by the reuse-guard branch below to reopen a window against the already-running server.
let embeddedServerPort: number | undefined;

async function createWindow(): Promise<void> {
  // Block until both dev servers are actually up before loading the window — without this, the
  // window can race `npm run dev:api`/`npm run dev:frontend`'s startup and either fail to load
  // or hit Vite before it's ready to serve.
  //
  // The API server is checked via a raw TCP-listen probe (`tcp:...`) rather than an HTTP GET:
  // in dev mode (no `npm run build:frontend` having run), `createServer`'s root `"/"` route
  // 404s because `dist/frontend` doesn't exist yet (see `src/api/server.ts`), so an HTTP-based
  // 2XX check against it would never succeed and would hang forever. Vite's dev server root
  // does return 2XX in dev mode, so it's checked with `http-get:...`.
  await waitOn({
    resources: [`tcp:localhost:${API_DEV_SERVER_PORT}`, `http-get://localhost:5173`],
  });

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: DEV_ICON_PATH,
  });

  // BrowserWindow's `icon` option above covers the window/taskbar icon on Windows/Linux, but is
  // ignored on macOS — macOS instead takes the Dock icon from the running app process itself
  // (Electron's own icon by default under `electron .`), so it needs setting explicitly here.
  // Only relevant in dev mode: a packaged build's Dock icon comes from the bundle automatically.
  app.dock?.setIcon(DEV_ICON_PATH);

  await win.loadURL(VITE_DEV_SERVER_URL);
}

/**
 * Production-mode boot: embeds the API server in-process instead of waiting on separate dev
 * servers, then loads the resulting server's own origin (which itself serves the built
 * frontend — see `src/api/server.ts`'s static-file wiring).
 *
 * Every module that transitively depends on `src/config/config.ts` (whose module-level
 * `config` object computes its `MUSIC_ROOT`/`DB_PATH` defaults from `process.env` the instant
 * it's first imported) is loaded here via a dynamic `import()` rather than a static top-level
 * one. A static `import ... from "../src/api/server.js"` would be hoisted and evaluated before
 * ANY of this function's own code runs, which would compute `config.ts`'s env-derived defaults
 * before the desktop-specific `MUSIC_ROOT`/`DB_PATH` overrides below are set — silently
 * defaulting to the plain web-mode fallbacks (`~/Music`, `./data/library.db` relative to
 * whatever the packaged app's cwd happens to be) instead. The `if (!process.env...)` guards
 * mirror `config.ts`'s own `loadDotEnv`'s "only fill in if unset" convention, so an
 * operator-provided `MUSIC_ROOT`/`DB_PATH` env var (e.g. pointing at a scratch DB for manual
 * testing) still takes priority over these desktop defaults.
 *
 * Task 12: the whole body below is now wrapped in an outer try/catch (carried forward from
 * Task 11's Reviewer, non-blocking there) — previously only the `listen()` call had error
 * handling, so a failure in the dynamic `import()`s, `openDb()`, or `win.loadURL()` was an
 * unhandled rejection with no dialog, the same "packaged app fails silently" problem Task 11
 * fixed for `listen()` specifically. The inner try/catch around `listen()` is unchanged and
 * still takes priority for that specific failure — the outer catch is a generic safety net for
 * everything else, and is written defensively (it never assumes `config`/`expressApp`/etc. were
 * successfully obtained, since the failure that lands here might have happened before any of
 * those existed).
 *
 * Reuse guard (window-lifecycle bug fix): closing every window does NOT quit the app on macOS
 * (see the `window-all-closed` handler below) — the embedded server/db from that first window
 * stay alive, tracked in `embeddedServer`/`embeddedDb`. Both the initial `whenReady` boot and the
 * `activate` handler dispatch through this same function, so without this check, clicking the
 * Dock icon (or double-clicking the app again) after closing the window would re-run the WHOLE
 * startup sequence — opening a second, redundant `openDb()` connection against the same DB file
 * and a second embedded server next to the still-running first one (wasteful at best; two live
 * writer connections to the same SQLite file at worst). Confirmed via a real packaged-app repro
 * (close the window, then reactivate) before this fix existed. When a server/db are already
 * running, just open another window against them instead.
 */
async function createProductionWindow(): Promise<void> {
  if (embeddedServer && embeddedDb) {
    try {
      const { config } = await import("../src/config/config.js");
      const win = new BrowserWindow({ width: 1400, height: 900 });
      await win.loadURL(`http://${config.host}:${embeddedServerPort}`);
    } catch (err) {
      // Deliberately no `app.quit()` here, unlike the fresh-startup failure paths below — the
      // existing embedded server/db are still fine; a failure to open a NEW window on top of them
      // shouldn't kill the whole running app.
      console.error("ProFolder failed to reopen a window against the running embedded server:", err);
      dialog.showErrorBox(
        "Failed to reopen",
        `ProFolder is still running, but a new window could not be opened: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return;
  }

  try {
    // Computed unconditionally (not just inside the `!process.env.DB_PATH` branch below) since
    // Task 15's `PUT /api/config/db-location` route also needs this same path to call
    // `setDbPathOverride` — it must match Task 14's startup-time `getDbPathOverride` read
    // exactly, or a write from the running app's own settings UI would silently target a
    // different file than the one actually consulted on next launch.
    const prefsFilePath = path.join(app.getPath("userData"), "desktop-prefs.json");

    // Tracks whether an override was ACTUALLY read from the prefs file this launch — distinct
    // from simply checking `process.env.DB_PATH` afterward, since that env var could in
    // principle already be set by something else (e.g. an operator-provided value for manual
    // testing) even when no prefs-file override exists. This is consulted below if `openDb()`
    // throws, to decide whether there's a sensible "reset to default" recovery available or not.
    let dbPathOverrideInEffect: string | undefined;
    if (!process.env.DB_PATH) {
      // Task 14: a user-configured DB location override (written by Task 15's
      // `setDbPathOverride` call in the `/api/config/db-location` route, via the desktop
      // settings UI — Task 16) takes priority over the plain `userData/library.db` default
      // when present. The prefs file lives next to `library.db` inside the same `userData`
      // dir, matching that existing naming.
      const { getDbPathOverride } = await import("../src/config/desktopPrefs.js");
      dbPathOverrideInEffect = getDbPathOverride(prefsFilePath);
      process.env.DB_PATH = dbPathOverrideInEffect ?? path.join(app.getPath("userData"), "library.db");
    }
    if (!process.env.MUSIC_ROOT) {
      // Web mode defaults MUSIC_ROOT to "~/Music" (see config.ts) when nothing else is
      // configured. app.getPath("music") is Electron's own cross-platform equivalent — the same
      // folder on macOS, but the correct per-OS "Music" folder on Windows/Linux too. A desktop
      // user needs SOME real folder to scan on first launch, unlike the DB path (which can start
      // empty and simply gets created by `openDb`).
      process.env.MUSIC_ROOT = app.getPath("music");
    }

    const [
      { openDb },
      { getEffectiveMusicRoot },
      { createServer },
      { config },
      { ElectronFinderService },
      { ElectronFolderPickerService },
      { ElectronTrashService },
      { NodeFileOpsService },
      { ElectronDbFilePickerService },
    ] = await Promise.all([
      import("../src/database/db.js"),
      import("../src/config/musicRoot.js"),
      import("../src/api/server.js"),
      import("../src/config/config.js"),
      import("../src/services/ElectronFinderService.js"),
      import("../src/services/ElectronFolderPickerService.js"),
      import("../src/services/ElectronTrashService.js"),
      import("../src/services/FileOpsService.js"),
      import("../src/services/ElectronDbFilePickerService.js"),
    ]);

    // Task 17: `openDb()` throwing here is only recoverable in-app when a user-configured DB
    // path override (see `dbPathOverrideInEffect` above) was actually in effect for this launch
    // — e.g. the external drive it lives on got unmounted, or the file was deleted/corrupted by
    // something outside the app. If there's no override in effect, the plain default
    // `userData/library.db` path itself is somehow broken, there's nothing sensible to "reset"
    // to, and this is left to propagate to the outer catch below unchanged (its existing generic
    // "Failed to start" dialog + quit).
    let db: Database.Database;
    try {
      db = openDb(config.dbPath);
    } catch (err) {
      if (dbPathOverrideInEffect === undefined) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(`ProFolder could not open the custom database location "${dbPathOverrideInEffect}":`, err);
      // The actual choice-to-side-effects branching (reset-then-relaunch vs. quit) lives in
      // `recoverFromDbOpenFailure`, a pure function with zero Electron dependency, so that
      // branch gets real unit test coverage — this file only supplies the real Electron-backed
      // callbacks (showing the native dialog, `clearDbPathOverride`, `app.relaunch`/`app.quit`),
      // none of which can be meaningfully unit-tested outside a real Electron process.
      const [{ recoverFromDbOpenFailure }, { clearDbPathOverride }] = await Promise.all([
        import("../src/config/dbOpenRecovery.js"),
        import("../src/config/desktopPrefs.js"),
      ]);
      recoverFromDbOpenFailure(prefsFilePath, {
        showRecoveryDialog: () => {
          const choice = dialog.showMessageBoxSync({
            type: "error",
            title: "Cannot open database",
            message: "ProFolder could not open your custom database location.",
            detail:
              `The database at "${dbPathOverrideInEffect}" could not be opened (${message}).\n\n` +
              "This can happen if the drive it lives on was unmounted, or the file was moved, " +
              "deleted, or corrupted outside the app.\n\n" +
              'Choose "Reset to Default Location" to switch back to the default database location ' +
              'and restart the app, or "Quit" to fix the issue yourself first (e.g. reconnect the ' +
              "drive) and relaunch.",
            buttons: ["Reset to Default Location", "Quit"],
            defaultId: 0,
            cancelId: 1,
          });
          return choice === 0 ? "reset" : "quit";
        },
        clearDbPathOverride,
        // Same relaunch mechanism as the `/api/config/db-location` route's own `relaunchApp`
        // below, for consistency: `app.relaunch()` schedules a fresh launch of the app once the
        // current process exits, and `app.exit()` (not `app.quit()`, which would instead emit
        // `before-quit`/`window-all-closed` and could be intercepted) exits it immediately.
        relaunch: () => {
          app.relaunch();
          app.exit();
        },
        quit: () => app.quit(),
      });
      return;
    }
    embeddedDb = db;

    const expressApp = createServer(db, {
      finderService: new ElectronFinderService(() => getEffectiveMusicRoot(db)),
      folderPickerService: new ElectronFolderPickerService(),
      trashService: new ElectronTrashService(() => getEffectiveMusicRoot(db)),
      fileOpsService: new NodeFileOpsService(() => getEffectiveMusicRoot(db)),
      runtimeMode: "desktop",
      dbFilePickerService: new ElectronDbFilePickerService(),
      dbPrefsFilePath: prefsFilePath,
      relaunchApp: () => {
        app.relaunch();
        app.exit();
      },
    });

    // Binds to port 0 (an OS-assigned free port) rather than `config.port` — a packaged install
    // should never be able to collide with another localhost process (a dev server, another
    // app, anything else bound to a fixed port). The single-instance lock requested below
    // already prevents two copies of THIS app from racing each other against the same DB, which
    // was the only scenario the old fixed-port collision was actually protecting against.
    try {
      embeddedServer = await new Promise<HttpServer>((resolve, reject) => {
        const server = expressApp.listen(0, config.host, () => resolve(server));
        server.on("error", (err) => {
          reject(err);
        });
      });
    } catch (err) {
      console.error(`Failed to start the embedded API server on ${config.host}:`, err);
      dialog.showErrorBox(
        "Failed to start",
        `ProFolder could not start its embedded server on ${config.host}. ` +
          "Close any other running instance of this app and try again.",
      );
      app.quit();
      return;
    }

    const address = embeddedServer.address();
    if (address === null || typeof address === "string") {
      throw new Error(`Embedded server returned an unexpected address: ${String(address)}`);
    }
    embeddedServerPort = address.port;

    const win = new BrowserWindow({
      width: 1400,
      height: 900,
    });

    await win.loadURL(`http://${config.host}:${embeddedServerPort}`);
  } catch (err) {
    console.error("ProFolder failed to start in production mode:", err);
    dialog.showErrorBox(
      "Failed to start",
      `ProFolder failed to start: ${err instanceof Error ? err.message : String(err)}\n\n` +
        "If this keeps happening, check that no other instance of the app (or a running " +
        "web-mode dev server) is already using the required port, and that the app's data " +
        "directory is accessible.",
    );
    app.quit();
  }
}

// Dispatches to whichever window-creation function matches the current mode — shared by the
// initial `whenReady` boot and the macOS `activate` handler below, so both stay in sync.
function createWindowForCurrentMode(): Promise<void> {
  return app.isPackaged ? createProductionWindow() : createWindow();
}

// Single-instance lock (Task 12). Must be requested before `app.whenReady()` — a second launch
// of the same packaged binary while one is already running is normal, expected behavior (e.g. a
// user double-clicking the app icon again), not an error, so it quits immediately and silently
// here with NO dialog (unlike the error-dialog convention used for genuine startup failures
// above). Without this lock, a second launch would otherwise reach `createProductionWindow()`
// and open a second, redundant `openDb()` connection and embedded server against the same DB
// file next to the still-running first instance (the embedded server's dynamic port means this
// wouldn't even fail loudly — it would just silently duplicate state) — this lock intercepts
// that case before it ever gets there.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  // Fired in the *primary* instance when a second launch attempt is made. Standard Electron
  // convention: bring the existing window to the front instead of doing nothing (or, worse,
  // silently letting the second instance's own `requestSingleInstanceLock()` call above have
  // already quit it with no feedback to the user at all).
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) {
      // No window exists (e.g. it was closed but the app — and its embedded server, on macOS —
      // stayed running per the `window-all-closed` gate below). `createWindowForCurrentMode()`
      // reuses the already-running server/db in this case rather than re-initializing them.
      createWindowForCurrentMode().catch((err) => {
        console.error("ProFolder failed to reopen a window for a second launch attempt:", err);
        dialog.showErrorBox(
          "Failed to reopen",
          `ProFolder is still running, but a new window could not be opened: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      return;
    }
    if (win.isMinimized()) {
      win.restore();
    }
    win.focus();
  });

  // The `.catch()` here is a final safety net (Task 12, carried forward from Task 11's Reviewer)
  // for anything that escapes `createProductionWindow`'s own now-widened try/catch — in practice
  // that means a rejection from `createWindow()` itself (dev mode), which still has no try/catch
  // of its own. That's a deliberate, disclosed scope call, not an oversight: dev mode is always
  // launched from a terminal (via `npm run dev:electron`'s `concurrently`), so a `waitOn` failure
  // there is already visible as a printed stack trace/unhandled-rejection warning even without
  // this handler — this `.catch()` additionally surfaces it as a native dialog too (reusing the
  // same log+dialog+quit convention as every other startup failure in this file), which is a
  // strict improvement with no extra dev-mode-specific code needed, rather than a gap left open.
  app.whenReady().then(createWindowForCurrentMode).catch((err) => {
    console.error("ProFolder failed to start:", err);
    dialog.showErrorBox(
      "Failed to start",
      `ProFolder failed to start: ${err instanceof Error ? err.message : String(err)}`,
    );
    app.quit();
  });

  // macOS apps conventionally stay running (with no windows, accessible again via the dock icon)
  // when the last window closes, rather than quitting outright — Windows/Linux apps quit. Task 9
  // added this handler with an unconditional `app.quit()` and no platform gate (deferring the
  // gate — and the `activate` handler below that makes it meaningful — to this task). Since this
  // task is explicitly the window-lifecycle task, the gate is added now rather than left as a
  // known simplification.
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  // macOS-only in practice (Electron only emits `activate` on darwin — see the type comment on
  // this event upstream); registering it unconditionally is harmless on other platforms since the
  // event simply never fires there. Recreates a window via whichever mode is active, mirroring
  // `whenReady`'s own dispatch, so clicking the dock icon after every window has been closed
  // (without quitting the app, per the platform gate above) brings the app back rather than
  // leaving the dock icon inert.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindowForCurrentMode().catch((err) => {
        console.error("ProFolder failed to start:", err);
        dialog.showErrorBox(
          "Failed to start",
          `ProFolder failed to start: ${err instanceof Error ? err.message : String(err)}`,
        );
        app.quit();
      });
    }
  });

  // Graceful shutdown (Task 12). Dev mode has nothing to clean up here (see `embeddedDb`/
  // `embeddedServer`'s own doc comment above) — this is a no-op whenever they're still
  // `undefined`. `before-quit` (rather than `will-quit`/`quit`) is used because it's the last
  // point at which quitting can still be deferred via `event.preventDefault()`, which is needed
  // here since both the server close and the DB close are worth waiting on before the process
  // actually exits.
  let isShuttingDown = false;
  app.on("before-quit", (event) => {
    if (isShuttingDown || (!embeddedServer && !embeddedDb)) {
      return;
    }
    isShuttingDown = true;
    event.preventDefault();

    const server = embeddedServer;
    const db = embeddedDb;
    embeddedServer = undefined;
    embeddedDb = undefined;
    embeddedServerPort = undefined;

    const closeServer = () =>
      new Promise<void>((resolve) => {
        if (!server) {
          resolve();
          return;
        }
        server.close(() => resolve());
        // Force-close any still-open keep-alive sockets (e.g. the window's own long-lived
        // connection) immediately, rather than waiting for them to drain naturally — without
        // this, `server.close()`'s callback above would only fire once every open connection
        // ends on its own, which could stall a quit for the length of the HTTP keep-alive
        // timeout. `closeAllConnections` is available on the Node versions Electron 44 bundles.
        server.closeAllConnections();
      });

    closeServer()
      .catch((err) => {
        console.error("Error while closing the embedded server during shutdown:", err);
      })
      .finally(() => {
        try {
          // Closing the last (only) connection to a WAL-mode SQLite database checkpoints and
          // truncates the WAL file automatically — this is what "flush WAL" means here, not a
          // separate explicit pragma call.
          db?.close();
        } catch (err) {
          console.error("Error while closing the database during shutdown:", err);
        } finally {
          // `app.exit()`, not `app.quit()` — `quit()` would re-emit `before-quit` and loop back
          // into this same handler.
          app.exit();
        }
      });
  });
}
