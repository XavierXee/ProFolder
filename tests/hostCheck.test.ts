import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/database/db.js";
import { createServer } from "../src/api/server.js";
import { parseHostHeader, resolveAllowedHosts } from "../src/api/hostCheck.js";
import { MacFinderService } from "../src/services/FinderService.js";
import { MacFolderPickerService } from "../src/services/FolderPickerService.js";
import { MacTrashService } from "../src/services/TrashService.js";
import { NodeFileOpsService } from "../src/services/FileOpsService.js";
import { getEffectiveMusicRoot } from "../src/config/musicRoot.js";

function makeServerServices(db: Database.Database) {
  return {
    finderService: new MacFinderService(() => getEffectiveMusicRoot(db)),
    folderPickerService: new MacFolderPickerService(),
    trashService: new MacTrashService(() => getEffectiveMusicRoot(db)),
    fileOpsService: new NodeFileOpsService(() => getEffectiveMusicRoot(db)),
    runtimeMode: "web" as const,
  };
}

describe("parseHostHeader", () => {
  it("strips the port and lowercases the hostname", () => {
    expect(parseHostHeader("LocalHost:5175")).toBe("localhost");
    expect(parseHostHeader("127.0.0.1")).toBe("127.0.0.1");
  });

  it("keeps bracketed IPv6 addresses intact", () => {
    expect(parseHostHeader("[::1]:5175")).toBe("[::1]");
    expect(parseHostHeader("[::1]")).toBe("[::1]");
  });

  it("drops a trailing dot so 'localhost.' can't sidestep the comparison", () => {
    expect(parseHostHeader("localhost.:5175")).toBe("localhost");
  });

  it("returns undefined for a missing or malformed header", () => {
    expect(parseHostHeader(undefined)).toBeUndefined();
    expect(parseHostHeader("")).toBeUndefined();
    expect(parseHostHeader(":5175")).toBeUndefined();
    expect(parseHostHeader("[::1")).toBeUndefined();
  });
});

describe("resolveAllowedHosts", () => {
  it("allows only loopback names by default", () => {
    expect(resolveAllowedHosts("127.0.0.1", undefined).sort()).toEqual(["127.0.0.1", "[::1]", "localhost"]);
  });

  it("adds a specific bind address, but never a wildcard one", () => {
    expect(resolveAllowedHosts("192.168.1.5", undefined)).toContain("192.168.1.5");
    expect(resolveAllowedHosts("::1", undefined)).toContain("[::1]");
    for (const wildcard of ["0.0.0.0", "::", "0"]) {
      expect(resolveAllowedHosts(wildcard, undefined).sort()).toEqual(["127.0.0.1", "[::1]", "localhost"]);
    }
  });

  it("adds trimmed, lowercased ALLOWED_HOSTS entries and ignores empty ones", () => {
    const allowed = resolveAllowedHosts("0.0.0.0", " My-Mac.local , 192.168.1.20,,");
    expect(allowed).toContain("my-mac.local");
    expect(allowed).toContain("192.168.1.20");
    expect(allowed).not.toContain("");
  });
});

describe("Host header check on the API server", () => {
  let db: Database.Database;
  let savedAllowedHosts: string | undefined;

  beforeEach(() => {
    savedAllowedHosts = process.env.ALLOWED_HOSTS;
    delete process.env.ALLOWED_HOSTS;
    db = new Database(":memory:");
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
    if (savedAllowedHosts === undefined) delete process.env.ALLOWED_HOSTS;
    else process.env.ALLOWED_HOSTS = savedAllowedHosts;
  });

  it.each(["localhost:5175", "127.0.0.1:5175", "[::1]:5175", "localhost"])("serves requests addressed to %s", async (host) => {
    const app = createServer(db, makeServerServices(db));
    const res = await request(app).get("/api/custom-tabs").set("Host", host);
    expect(res.status).toBe(200);
  });

  it("rejects a request addressed to another host (DNS rebinding) with 403", async () => {
    const app = createServer(db, makeServerServices(db));
    const res = await request(app).get("/api/custom-tabs").set("Host", "attacker.example:5175");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden: unrecognized Host header" });
  });

  it("rejects a hostname that merely starts with an allowed name", async () => {
    const app = createServer(db, makeServerServices(db));
    const res = await request(app).get("/api/custom-tabs").set("Host", "localhost.attacker.example");
    expect(res.status).toBe(403);
  });

  it("blocks a rejected request before it can change anything", async () => {
    const app = createServer(db, makeServerServices(db));
    const res = await request(app)
      .post("/api/custom-tabs")
      .set("Host", "attacker.example")
      .send({ name: "Injected", type: "files" });
    expect(res.status).toBe(403);

    const list = await request(app).get("/api/custom-tabs").set("Host", "localhost");
    expect(list.body.tabs).toHaveLength(0);
  });

  it("serves hosts listed in ALLOWED_HOSTS", async () => {
    process.env.ALLOWED_HOSTS = "my-mac.local";
    const app = createServer(db, makeServerServices(db));
    const res = await request(app).get("/api/custom-tabs").set("Host", "my-mac.local:5175");
    expect(res.status).toBe(200);
  });
});
