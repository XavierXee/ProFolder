import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { getScanSettings } from "../src/config/scanSettings.js";
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

// Covers the configurable-duplicate-threshold cycle's Task 3: GET/PUT /api/config/scan-settings
// had zero HTTP-level test coverage at all (only src/config/scanSettings.ts's module-level
// get/setScanSettings functions were tested directly). This file exercises the ROUTE: request
// body validation (type checks before the setter is even called), the setter's own thrown
// range/integer validation surfacing as a 400 (not a 500), and that a partial patch touching
// only one field never accidentally requires/rejects on the others.

describe("GET/PUT /api/config/scan-settings", () => {
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

  it("GET returns the default duplicateMatchThresholdPercent (58) on a fresh DB", async () => {
    const res = await request(app).get("/api/config/scan-settings");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      excludeSamplesFolders: true,
      excludeBackupFolders: true,
      duplicateMatchThresholdPercent: 58,
    });
  });

  it("PUT with a valid duplicateMatchThresholdPercent persists it, reflected by a subsequent GET", async () => {
    const putRes = await request(app).put("/api/config/scan-settings").send({ duplicateMatchThresholdPercent: 45 });

    expect(putRes.status).toBe(200);
    expect(putRes.body.duplicateMatchThresholdPercent).toBe(45);

    const getRes = await request(app).get("/api/config/scan-settings");
    expect(getRes.body.duplicateMatchThresholdPercent).toBe(45);
  });

  it("PUT with a non-number duplicateMatchThresholdPercent returns 400 and does not persist anything", async () => {
    const res = await request(app)
      .put("/api/config/scan-settings")
      .send({ duplicateMatchThresholdPercent: "not-a-number" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/duplicateMatchThresholdPercent/);
    expect(getScanSettings(db).duplicateMatchThresholdPercent).toBe(58);
  });

  it("PUT with an out-of-range integer (5, below the minimum) returns 400 with the setter's own descriptive message, and does not persist", async () => {
    const res = await request(app).put("/api/config/scan-settings").send({ duplicateMatchThresholdPercent: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "duplicateMatchThresholdPercent must be an integer between 10 and 100"
    );
    expect(getScanSettings(db).duplicateMatchThresholdPercent).toBe(58);
  });

  it("PUT with a non-integer number (50.5) returns 400 with the setter's own descriptive message, and does not persist", async () => {
    const res = await request(app).put("/api/config/scan-settings").send({ duplicateMatchThresholdPercent: 50.5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "duplicateMatchThresholdPercent must be an integer between 10 and 100"
    );
    expect(getScanSettings(db).duplicateMatchThresholdPercent).toBe(58);
  });

  it("PUT with a bad boolean value (excludeSamplesFolders: \"yes\") still returns its own clear 400, not swallowed by the numeric validation's try/catch", async () => {
    const res = await request(app).put("/api/config/scan-settings").send({ excludeSamplesFolders: "yes" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("excludeSamplesFolders must be a boolean");
    expect(getScanSettings(db).excludeSamplesFolders).toBe(true);
  });

  it("PUT with only a boolean field (no duplicateMatchThresholdPercent) still works — the numeric field stays optional at the HTTP layer", async () => {
    const res = await request(app).put("/api/config/scan-settings").send({ excludeBackupFolders: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      excludeSamplesFolders: true,
      excludeBackupFolders: false,
      duplicateMatchThresholdPercent: 58,
    });
  });
});
