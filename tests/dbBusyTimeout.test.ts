import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

/**
 * These tests prove that `openDb`'s `busy_timeout` pragma (src/database/db.ts)
 * is load-bearing for real multi-connection contention on a real file-backed
 * database, not just present.
 *
 * better-sqlite3 is fully synchronous: a blocked write call sleeps the
 * *calling* OS thread inside the native addon. That means we cannot exercise
 * "connection A holds a write lock while connection B waits on it" within a
 * single Node process/thread — whichever connection is blocked would freeze
 * the only thread available to release the other connection's lock. So each
 * connection here is a real, separate child process (spawned via `tsx`,
 * already a project devDependency), each importing and calling the actual
 * `openDb` from src/database/db.ts against the same real temp file. This is
 * the only way to genuinely reproduce SQLITE_BUSY/wait-then-succeed behavior.
 *
 * IMPORTANT MUTATION-TESTING CAVEAT: this test does NOT fail if
 * `db.pragma("busy_timeout = 5000")` is deleted from openDb. Investigated and
 * confirmed why: better-sqlite3's `Database` constructor already defaults its
 * own `timeout` option to 5000ms and applies it via `sqlite3_busy_timeout()`
 * at connection-open time regardless of any pragma call (see
 * node_modules/better-sqlite3/lib/database.js:34 and
 * node_modules/better-sqlite3/src/better_sqlite3.cpp:498). So — as of this
 * writing — the explicit pragma in openDb is redundant with the library's own
 * default, and no revert-the-pragma-only mutation of openDb can make this
 * test observe a difference. What *does* make this test observe a difference
 * (verified manually, not committed here): passing `{ timeout: 0 }` to `new
 * Database(dbPath)` in openDb while the pragma is absent reliably reproduces
 * an immediate SQLITE_BUSY error in the writer; restoring the explicit
 * `busy_timeout` pragma (with `{ timeout: 0 }` still in place) reliably fixes
 * it. That confirms the explicit pragma is a genuine, working defensive
 * override — it's just not exercised by the *current* constructor call. This
 * test is kept because it's a real, valuable regression test for "connections
 * to this database wait-then-retry instead of failing immediately under
 * write contention" as a whole (whichever mechanism provides it), and because
 * it would immediately catch a future change that lowered/removed
 * better-sqlite3's effective timeout (e.g. someone later passing
 * `{ timeout: 0 }` to the constructor) *if* the explicit pragma were also
 * removed at the same time.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsxBin = path.join(__dirname, "..", "node_modules", ".bin", "tsx");
const dbModulePath = path.join(__dirname, "..", "src", "database", "db.ts");

const HOLDER_SCRIPT = `
import { openDb } from ${JSON.stringify(dbModulePath)};

const dbPath = process.argv[2];
const holdMs = Number(process.argv[3]);
const db = openDb(dbPath);
db.exec("CREATE TABLE IF NOT EXISTS busy_test (id INTEGER PRIMARY KEY, val TEXT)");
db.exec("BEGIN IMMEDIATE");
db.prepare("INSERT INTO busy_test (val) VALUES (?)").run("holder");
console.log("READY " + Date.now());
setTimeout(() => {
  db.exec("COMMIT");
  console.log("HOLDER_COMMITTED " + Date.now());
  db.close();
}, holdMs);
`;

// Prints wall-clock timestamps (not durations measured from this process's
// own start) so the test can compare this process's timeline directly
// against the holder process's timeline — a cross-process-startup-overhead
// safe way to prove ordering (attempted-while-locked, succeeded-after-commit)
// without depending on how long tsx/module loading/migrations took to spin
// this process up before it ever reached the INSERT call.
const WRITER_SCRIPT = `
import { openDb } from ${JSON.stringify(dbModulePath)};

const dbPath = process.argv[2];
const db = openDb(dbPath);
console.log("WRITER_ATTEMPT_START " + Date.now());
try {
  db.prepare("INSERT INTO busy_test (val) VALUES (?)").run("writer");
  console.log("RESULT SUCCESS " + Date.now());
} catch (err) {
  const code = err && err.code ? err.code : String(err);
  console.log("RESULT ERROR " + Date.now() + " " + code);
}
db.close();
`;

let tmpDir: string;
const children: ChildProcessByStdio<null, Readable, Readable>[] = [];

afterEach(() => {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  children.length = 0;
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

/** Spawns a child process running the given inline TS source via tsx. */
function spawnScript(source: string, args: string[]): ChildProcessByStdio<null, Readable, Readable> {
  const scriptPath = path.join(tmpDir, `script-${Math.random().toString(36).slice(2)}.mts`);
  fs.writeFileSync(scriptPath, source);
  const child = spawn(tsxBin, [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  return child;
}

/** Collects stdout lines from a child process into an array as they arrive. */
function collectLines(child: ChildProcessByStdio<null, Readable, Readable>, lines: string[]): void {
  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      lines.push(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
    }
  });
}

function waitForLine(lines: string[], predicate: (line: string) => boolean, timeoutMs: number): Promise<string> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const found = lines.find(predicate);
      if (found) return resolve(found);
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timed out waiting for matching line. Lines so far: ${JSON.stringify(lines)}`));
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

function waitForExit(child: ChildProcessByStdio<null, Readable, Readable>, timeoutMs: number): Promise<number | null> {
  // The child may already have exited by the time this is called (e.g. the
  // holder process, which finishes shortly after signaling READY, well
  // before the caller gets around to awaiting it) — in that case the "exit"
  // event has already fired and a new listener would never see it.
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(child.exitCode);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for child process exit")), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe("openDb busy_timeout pragma (real multi-process contention)", () => {
  it(
    "lets a second connection's blocked write wait and succeed once the holder commits, instead of failing immediately",
    async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "busy-timeout-test-"));
      const dbPath = path.join(tmpDir, "test.db");
      // Generous relative to typical tsx/module-load/migration startup
      // overhead (empirically a few hundred ms), so the writer process is
      // virtually guaranteed to reach its INSERT attempt well before the
      // holder commits — giving a real contention window rather than a
      // lock-free coincidence.
      const holdMs = 2500;

      const holderLines: string[] = [];
      const holder = spawnScript(HOLDER_SCRIPT, [dbPath, String(holdMs)]);
      collectLines(holder, holderLines);

      // Don't proceed until the holder has actually opened its BEGIN IMMEDIATE
      // transaction and inserted a row — otherwise the writer might race ahead
      // of the holder acquiring the lock.
      await waitForLine(holderLines, (l) => l.startsWith("READY "), 10_000);

      const writerLines: string[] = [];
      const writer = spawnScript(WRITER_SCRIPT, [dbPath]);
      collectLines(writer, writerLines);

      await waitForExit(writer, 10_000);
      await waitForExit(holder, 10_000);

      const attemptLine = writerLines.find((l) => l.startsWith("WRITER_ATTEMPT_START "));
      const resultLine = writerLines.find((l) => l.startsWith("RESULT "));
      const commitLine = holderLines.find((l) => l.startsWith("HOLDER_COMMITTED "));
      expect(attemptLine, `writer produced no WRITER_ATTEMPT_START line. Lines: ${JSON.stringify(writerLines)}`).toBeDefined();
      expect(resultLine, `writer produced no RESULT line. Lines: ${JSON.stringify(writerLines)}`).toBeDefined();
      expect(commitLine, `holder produced no HOLDER_COMMITTED line. Lines: ${JSON.stringify(holderLines)}`).toBeDefined();

      const attemptStartTs = Number(attemptLine!.split(" ")[1]);
      const [, outcome, resultTsStr] = resultLine!.split(" ");
      const resultTs = Number(resultTsStr);
      const commitTs = Number(commitLine!.split(" ")[1]);

      // Real cross-process ordering proof, using wall-clock timestamps
      // (comparable across processes on the same host) instead of
      // per-process elapsed durations, which are noisy relative to each
      // process's own tsx/module-load/migration startup overhead:
      //  1. The writer must have attempted its INSERT *before* the holder
      //     committed — i.e. genuine contention actually occurred, not a
      //     lock-free coincidence where the holder had already released by
      //     the time the writer tried.
      //  2. The writer's INSERT must not have completed until *at or after*
      //     the holder's commit — i.e. it genuinely waited for the lock
      //     rather than failing immediately or succeeding through some
      //     other path.
      expect(attemptStartTs).toBeLessThan(commitTs);
      expect(outcome).toBe("SUCCESS");
      expect(resultTs).toBeGreaterThanOrEqual(commitTs);

      // Both writes actually landed.
      const { default: Database } = await import("better-sqlite3");
      const verifyDb = new Database(dbPath, { readonly: true });
      const rows = verifyDb.prepare("SELECT val FROM busy_test ORDER BY id").all() as { val: string }[];
      verifyDb.close();
      expect(rows.map((r) => r.val)).toEqual(["holder", "writer"]);
    },
    20_000
  );
});
