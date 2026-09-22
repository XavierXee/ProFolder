import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config } from "../config/config.js";
import { getEffectiveMusicRoot } from "../config/musicRoot.js";
import { openDb } from "../database/db.js";
import { MacFinderService } from "../services/FinderService.js";
import { MacFolderPickerService } from "../services/FolderPickerService.js";
import { MacTrashService } from "../services/TrashService.js";
import { NodeFileOpsService } from "../services/FileOpsService.js";
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

export function createServer(db: ReturnType<typeof openDb>) {
  const finderService = new MacFinderService(() => getEffectiveMusicRoot(db));
  const folderPickerService = new MacFolderPickerService();
  const trashService = new MacTrashService(() => getEffectiveMusicRoot(db));
  const fileOpsService = new NodeFileOpsService(() => getEffectiveMusicRoot(db));

  const app = express();
  app.use(express.json());

  app.use("/api/config", createConfigRouter(db, folderPickerService));
  app.use("/api/files", createFilesRouter(db, fileOpsService, trashService));
  app.use("/api/projects", createProjectsRouter(db));
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
  const frontendDistPath = process.env.FRONTEND_DIST_PATH
    ? path.resolve(process.env.FRONTEND_DIST_PATH)
    : path.resolve(process.cwd(), "dist/frontend");
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
  const app = createServer(db);
  app.listen(config.port, config.host, () => {
    console.log(`API server listening on http://${config.host}:${config.port}`);
    console.log(`Music root: ${getEffectiveMusicRoot(db)}`);
  });
}
