import net from "node:net";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it, afterEach, beforeEach } from "vitest";

import { resolveHost, config } from "../src/config/config.js";
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
  };
}

describe("resolveHost", () => {
  it("defaults to loopback when no env value is given", () => {
    expect(resolveHost(undefined)).toBe("127.0.0.1");
  });

  it("returns the trimmed env value when explicitly set", () => {
    expect(resolveHost("0.0.0.0")).toBe("0.0.0.0");
    expect(resolveHost("  192.168.1.5  ")).toBe("192.168.1.5");
  });

  it("falls back to loopback for an empty string", () => {
    expect(resolveHost("")).toBe("127.0.0.1");
  });

  it("falls back to loopback for a whitespace-only string", () => {
    expect(resolveHost("   ")).toBe("127.0.0.1");
  });
});

/**
 * Attempts a raw TCP connection to `host:port` and resolves with whether a `connect` event
 * fired within `timeoutMs`. Deliberately does NOT key success/failure off any particular error
 * code — on at least one verified environment, a VPN/tunnel interface produces a `TIMEOUT`
 * rather than an `ECONNREFUSED`, so "connect event fired" is the only reliable signal.
 */
function tryConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    let settled = false;

    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };

    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function getNonInternalIPv4Addresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

describe("API server network binding", () => {
  let db: Database.Database;
  let root: string;
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    root = fs.mkdtempSync(path.join(os.tmpdir(), "server-binding-test-"));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("binds to loopback by default and is unreachable from LAN interfaces", async () => {
    // No HOST env var should be set during a normal test run, so config.host should resolve
    // to the default 127.0.0.1.
    expect(config.host).toBe("127.0.0.1");

    app = createServer(db, makeServerServices(db));
    const server = app.listen(0, config.host);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    try {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected an AddressInfo object from server.address()");
      }
      expect(address.address).toBe("127.0.0.1");

      const port = address.port;
      const lanAddresses = getNonInternalIPv4Addresses();

      if (lanAddresses.length === 0) {
        // Environment-dependent probe (e.g. a CI container with only loopback) — skip rather
        // than failing, per task spec.
        return;
      }

      for (const lanAddress of lanAddresses) {
        const connected = await tryConnect(lanAddress, port, 1500);
        expect(connected).toBe(false);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("positive control: binding with no host argument IS reachable from LAN interfaces", async () => {
    const lanAddresses = getNonInternalIPv4Addresses();
    if (lanAddresses.length === 0) {
      // Nothing to prove the control against in this environment — skip, matching the main test.
      return;
    }

    app = createServer(db, makeServerServices(db));
    // Deliberately reproduces the pre-fix behavior: no host argument at all binds all
    // interfaces. Without this control, the "unreachable from LAN" assertion above could pass
    // vacuously in an environment where LAN probes always fail for unrelated reasons (firewall,
    // network config), and would silently stop meaning anything if a future regression
    // reintroduced all-interfaces binding.
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    try {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected an AddressInfo object from server.address()");
      }
      const port = address.port;

      const results = await Promise.all(lanAddresses.map((addr) => tryConnect(addr, port, 1500)));
      expect(results.some((connected) => connected)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
