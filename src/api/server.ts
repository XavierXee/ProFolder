import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "../config/config.js";
import { getEffectiveMusicRoot } from "../config/musicRoot.js";
import { openDb } from "../database/db.js";
import { MacFinderService, type FinderService } from "../services/FinderService.js";
import { MacFolderPickerService, type FolderPickerService } from "../services/FolderPickerService.js";
import { MacTrashService, type TrashService } from "../services/TrashService.js";
import { NodeFileOpsService, type FileOpsService } from "../services/FileOpsService.js";
import type { DbFilePickerService } from "../services/DbFilePickerService.js";
import { createFilesRouter } from "./routes/files.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createScanRouter } from "./routes/scan.js";
import { createRevealRouter } from "./routes/reveal.js";
import { createStatsRouter } from "./routes/stats.js";
import { createFoldersRouter } from "./routes/folders.js";
import { createConfigRouter } from "./routes/config.js";
import { createTagsRouter } from "./routes/tags.js";
import { createCustomTabsRouter } from "./routes/customTabs.js";
import { createStatusesRouter } from "./routes/statuses.js";
import { hostCheck, resolveAllowedHosts } from "./hostCheck.js";

/** Platform-specific services `createServer` needs but does not itself construct — the
 * plain web-mode entrypoint at the bottom of this file passes the existing Mac* classes;
 * the upcoming Electron packaging will pass its own Electron*Service implementations
 * instead. Every router that needs one of these services (currently `files.ts` and
 * `projects.ts`) receives it as an explicit constructor param from here rather than
 * constructing a `Mac*`/`Node*` class itself — this file's own bottom-of-file entrypoint is
 * the ONLY place in the repo that still does so for the plain web-mode path. */
export interface ServerServices {
  finderService: FinderService;
  folderPickerService: FolderPickerService;
  trashService: TrashService;
  fileOpsService: FileOpsService;
  /**
   * "web" for the plain Express entrypoint at the bottom of this file, "desktop" for
   * `electron/main.ts`'s `createProductionWindow()`. Passed explicitly as DI rather than the
   * route layer sniffing `process.versions.electron`/similar itself, per this codebase's
   * established "selection by which script launches the process, never runtime detection"
   * principle (see the Trash/Finder/FolderPicker cross-platform abstraction section).
   */
  runtimeMode: "web" | "desktop";
  /**
   * Desktop-only, used by `PUT /api/config/db-location`'s "choose an existing DB file" flow
   * (Task 16 wires the actual UI trigger for this). Optional because web mode has no such
   * concept at all — `GET`/`PUT /api/config/db-location` 400 in web mode before ever touching
   * this, rather than relying on its absence to fail safely.
   */
  dbFilePickerService?: DbFilePickerService;
  /**
   * Desktop-only: absolute path to `electron/main.ts`'s `desktop-prefs.json` (the same path
   * Task 14's startup-time `getDbPathOverride` read uses), needed by
   * `PUT /api/config/db-location` to call `setDbPathOverride`.
   */
  dbPrefsFilePath?: string;
  /**
   * Desktop-only: restarts the whole app (`app.relaunch()` + `app.exit()`) after a successful
   * DB location change. A live DB handle can't be safely relocated mid-process, so this route
   * never attempts a hot DB-handle swap — it always restarts instead.
   */
  relaunchApp?: () => void;
}

export function createServer(db: ReturnType<typeof openDb>, services: ServerServices) {
  const {
    finderService,
    folderPickerService,
    trashService,
    fileOpsService,
    runtimeMode,
    dbFilePickerService,
    dbPrefsFilePath,
    relaunchApp,
  } = services;

  const app = express();
  // First, so no route (or the static frontend) ever answers a request addressed to an
  // unrecognized host — see hostCheck.ts.
  app.use(hostCheck(resolveAllowedHosts(config.host, process.env.ALLOWED_HOSTS)));
  app.use(express.json());

  app.use(
    "/api/config",
    createConfigRouter(db, folderPickerService, runtimeMode, {
      dbFilePickerService,
      dbPrefsFilePath,
      relaunchApp,
    })
  );
  app.use("/api/files", createFilesRouter(db, fileOpsService, trashService));
  app.use("/api/projects", createProjectsRouter(db, fileOpsService, trashService));
  app.use("/api/scan", createScanRouter(db));
  app.use("/api/reveal", createRevealRouter(finderService));
  app.use("/api/stats", createStatsRouter(db));
  app.use("/api/folders", createFoldersRouter(db));
  app.use("/api/tags", createTagsRouter(db));
  app.use("/api/custom-tabs", createCustomTabsRouter(db));
  app.use("/api/statuses", createStatusesRouter(db));

  // Serves the built frontend (npm run build:frontend -> dist/frontend), for running the
  // app as a single deployable unit (also needed by the upcoming Electron packaging, whose
  // embedded server must serve the frontend and /api/* from the same origin). Registered
  // AFTER every /api/* route above, so an /api/* request is always resolved by its own
  // router first and can never be shadowed by static-file lookup or the root route below.
  // `express.static` itself is a no-op (calls next()) for any request that doesn't match a
  // real file on disk, so this is also inert whenever dist/frontend doesn't exist (e.g.
  // during `npm run dev`/`npm run test:backend`, where no build has been run).
  // FRONTEND_DIST_PATH lets tests point this at an isolated temp directory instead of the
  // real repo-relative dist/frontend, matching config.ts's existing env-override convention
  // (MUSIC_ROOT/DB_PATH) for filesystem paths.
  //
  // The non-override fallback is resolved relative to this file's own compiled location
  // (via import.meta.url), NOT process.cwd(): `npm start` happens to run from the repo root
  // so cwd matches, but a packaged Electron app launched from Finder/Dock has an unrelated
  // cwd (typically "/"), which silently made this path never exist and the embedded server
  // 404 everything with Express's default "Cannot GET /" instead of serving the built
  // frontend. Both compiled trees this file ends up in (`dist/src/api/server.js` from
  // tsconfig.json, `dist-electron/src/api/server.js` from tsconfig.electron.json) mirror
  // `src/api/server.ts`'s own path 1:1, so three levels up from this file's directory is
  // always the repo root (or the asar root in a packaged build) either way.
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const frontendDistPath = process.env.FRONTEND_DIST_PATH
    ? path.resolve(process.env.FRONTEND_DIST_PATH)
    : path.join(repoRoot, "dist/frontend");
  const frontendIndexPath = path.join(frontendDistPath, "index.html");

  app.use(express.static(frontendDistPath));

  // No client-side router exists in the frontend (no react-router or similar dependency,
  // no <Route>/<Router> usage in App.tsx), so no SPA-fallback wildcard route is needed here
  // — just the app's own root.
  app.get("/", (_req, res, next) => {
    if (!fs.existsSync(frontendIndexPath)) {
      next();
      return;
    }
    res.sendFile(frontendIndexPath);
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    // body-parser sets a real `statusCode` (e.g. 400) on the SyntaxError it throws for
    // malformed JSON bodies — echo it back when present instead of always answering 500
    // Anything without a valid HTTP status still falls back to 500.
    const statusCode =
      err && typeof err === "object" && "statusCode" in err && typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;
    res.status(statusCode).json({ error: err instanceof Error ? err.message : "Internal server error" });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb(config.dbPath);
  const app = createServer(db, {
    finderService: new MacFinderService(() => getEffectiveMusicRoot(db)),
    folderPickerService: new MacFolderPickerService(),
    trashService: new MacTrashService(() => getEffectiveMusicRoot(db)),
    fileOpsService: new NodeFileOpsService(() => getEffectiveMusicRoot(db)),
    runtimeMode: "web",
  });
  app.listen(config.port, config.host, () => {
    console.log(`API server listening on http://${config.host}:${config.port}`);
    console.log(`Music root: ${getEffectiveMusicRoot(db)}`);
  });
}
