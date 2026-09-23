import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { createServer } from "../src/api/server.js";
import { MacFinderService } from "../src/services/FinderService.js";
import { MacFolderPickerService } from "../src/services/FolderPickerService.js";
import { MacTrashService } from "../src/services/TrashService.js";
import { NodeFileOpsService } from "../src/services/FileOpsService.js";
import { getEffectiveMusicRoot } from "../src/config/musicRoot.js";

// createServer now takes its platform services as explicit DI params instead of
// constructing them internally (see src/api/server.ts). This helper constructs the same
// real Mac* classes the plain web-mode entrypoint uses, matching this test's pre-refactor
// behavior exactly.
function makeServerServices(db: Database.Database) {
  return {
    finderService: new MacFinderService(() => getEffectiveMusicRoot(db)),
    folderPickerService: new MacFolderPickerService(),
    trashService: new MacTrashService(() => getEffectiveMusicRoot(db)),
    fileOpsService: new NodeFileOpsService(() => getEffectiveMusicRoot(db)),
    runtimeMode: "web" as const,
  };
}

describe("PATCH /api/files/:id/{status,tags,score} — unknown id returns 404, not 500", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    app = createServer(db, makeServerServices(db));
  });

  afterEach(() => {
    db.close();
  });

  it("returns 404 for PATCH /:id/status on an unknown file id", async () => {
    const res = await request(app).patch("/api/files/UNKNOWN/status").send({ status: "unknown" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });

  it("returns 404 for PATCH /:id/tags on an unknown file id", async () => {
    const res = await request(app).patch("/api/files/UNKNOWN/tags").send({ tags: ["drums"] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });

  it("returns 404 for PATCH /:id/score on an unknown file id", async () => {
    const res = await request(app).patch("/api/files/UNKNOWN/score").send({ score: 3 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "File not found" });
  });
});
