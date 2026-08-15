import express from "express";
import { config } from "../config/config.js";
import { openDb } from "../database/db.js";
import { MacFinderService } from "../services/FinderService.js";
import { createFilesRouter } from "./routes/files.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createScanRouter } from "./routes/scan.js";
import { createRevealRouter } from "./routes/reveal.js";
import { createStatsRouter } from "./routes/stats.js";
import { createFoldersRouter } from "./routes/folders.js";

export function createServer() {
  const db = openDb(config.dbPath);
  const finderService = new MacFinderService(config.musicRoot);

  const app = express();
  app.use(express.json());

  app.get("/api/config", (_req, res) => {
    res.json({ musicRoot: config.musicRoot });
  });

  app.use("/api/files", createFilesRouter(db));
  app.use("/api/projects", createProjectsRouter(db));
  app.use("/api/scan", createScanRouter(db));
  app.use("/api/reveal", createRevealRouter(finderService));
  app.use("/api/stats", createStatsRouter(db));
  app.use("/api/folders", createFoldersRouter());

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createServer();
  app.listen(config.port, () => {
    console.log(`API server listening on http://localhost:${config.port}`);
    console.log(`Music root: ${config.musicRoot}`);
  });
}
