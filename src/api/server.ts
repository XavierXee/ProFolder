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

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    // body-parser sets a real `statusCode` (e.g. 400) on the SyntaxError it throws for
    // malformed JSON bodies — echo it back when present instead of always answering 500
    // (docs/TODO.md item 24). Anything without a valid HTTP status still falls back to 500.
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
