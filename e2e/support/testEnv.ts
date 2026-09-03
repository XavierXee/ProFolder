import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Isolated scratch directory for the e2e run: a fresh copy of the fixture music root plus
 * a throwaway SQLite database, so the suite never touches the real `data/library.db` or a
 * developer's real `MUSIC_ROOT`.
 *
 * A single `npm run test:e2e` invocation loads `playwright.config.ts` (and therefore calls
 * `getScratchDir()`) from more than one independent Node process — the `bddgen` CLI and
 * Playwright's own config-loading process — which do NOT share in-memory state (`globalTeardown`
 * runs in-process inside the `playwright test` runner, so it *does* share memory with that one,
 * but not with `bddgen`'s separate process). So the resolved path is persisted to a marker file
 * under the OS temp dir: the first caller (in either process) creates the scratch dir and writes
 * the marker, the other caller reads the marker and reuses the same directory.
 *
 * That marker file is named after `E2E_RUN_ID` — a random ID generated once per `npm run
 * test:e2e`/`test:e2e:headed` invocation (see package.json) and exported to every process
 * spawned within that one invocation. This is what makes reuse safe: a marker written by run A
 * can only ever be found by a process that also has run A's `E2E_RUN_ID`, which no later,
 * separate invocation (run B, with its own fresh random ID) will ever have — even if run A
 * crashed mid-suite (e.g. Ctrl+C, CI kill) and left its marker + scratch dir behind. Every
 * invocation is therefore guaranteed a fresh scratch dir + DB, never a leftover/possibly-
 * corrupted one from a previous run, regardless of how that previous run ended.
 *
 * (If `E2E_RUN_ID` isn't set — e.g. `playwright test` invoked directly, outside the npm scripts
 * — this falls back to the current process's PID, which is still enough for a single process to
 * be internally consistent with itself.)
 */

const MARKER_PREFIX = "musicfoldercron-e2e-scratch-dir.";
const RUN_ID = process.env.E2E_RUN_ID ?? String(process.pid);
const MARKER_PATH = path.join(os.tmpdir(), `${MARKER_PREFIX}${RUN_ID}.txt`);

// Any *other* invocation's marker file older than this is assumed abandoned (its process
// crashed before `globalTeardown` could run) rather than a genuinely concurrent `test:e2e` run,
// and gets swept up as OS-temp hygiene — see `sweepAbandonedLeftovers()`. This is generous
// relative to how long an e2e run actually takes. Note this age check is only ever used for
// hygiene, never for the reuse decision above (that's keyed on `RUN_ID` alone), so guessing
// wrong here can only leave a stale dir around a little longer — it can never cause a false
// reuse of another run's directory.
const ABANDONED_MARKER_MAX_AGE_MS = 2 * 60 * 60 * 1000;

let scratchDir: string | undefined;

export function getScratchDir(): string {
  if (scratchDir) return scratchDir;

  const marked = readMarker();
  if (marked && fs.existsSync(marked)) {
    scratchDir = marked;
    return scratchDir;
  }

  sweepAbandonedLeftovers();

  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "musicfoldercron-e2e-"));
  fs.cpSync(
    path.join(import.meta.dirname, "fixtures", "music-root"),
    path.join(scratchDir, "music-root"),
    { recursive: true }
  );
  fs.writeFileSync(MARKER_PATH, scratchDir, "utf-8");

  return scratchDir;
}

/** Deletes the scratch dir and its marker. Called once, from globalTeardown.ts, after the suite finishes. */
export function cleanupScratchDir(): void {
  fs.rmSync(getScratchDir(), { recursive: true, force: true });
  fs.rmSync(MARKER_PATH, { force: true });
  scratchDir = undefined;
}

function readMarker(): string | undefined {
  try {
    return fs.readFileSync(MARKER_PATH, "utf-8").trim();
  } catch {
    return undefined;
  }
}

/**
 * Removes scratch dirs + marker files left behind by previous invocations that crashed before
 * `globalTeardown` ran (so `cleanupScratchDir()` never fired for them). This is pure OS-temp
 * hygiene, not a safety mechanism — see the `RUN_ID` doc comment above for why leftover markers
 * can never be mistakenly reused regardless of whether this sweep runs or finds anything.
 */
function sweepAbandonedLeftovers(): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(os.tmpdir());
  } catch {
    return;
  }

  const now = Date.now();
  for (const entry of entries) {
    if (!entry.startsWith(MARKER_PREFIX) || !entry.endsWith(".txt")) continue;
    const otherMarkerPath = path.join(os.tmpdir(), entry);
    try {
      const stat = fs.statSync(otherMarkerPath);
      if (now - stat.mtimeMs < ABANDONED_MARKER_MAX_AGE_MS) continue;

      const leftoverDir = fs.readFileSync(otherMarkerPath, "utf-8").trim();
      if (leftoverDir) fs.rmSync(leftoverDir, { recursive: true, force: true });
      fs.rmSync(otherMarkerPath, { force: true });
    } catch {
      // Best-effort cleanup only; never let a sweep failure block the current run.
    }
  }
}
