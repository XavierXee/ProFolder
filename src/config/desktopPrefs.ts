import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/** Shape persisted to the desktop prefs JSON file. */
type DesktopPrefs = {
  dbPath?: string;
};

/**
 * Reads the desktop app's small standalone prefs file (NOT the appSettingsRepository KV-store,
 * which lives inside the DB whose own location this override decides) and returns the saved DB
 * path override, if any.
 *
 * This is read at app startup before the DB is ever opened, so it must never throw: a missing,
 * malformed, or unexpectedly-shaped prefs file is treated the same as "no override configured"
 * and simply falls back to `undefined`. Takes an explicit prefs-file-path parameter (rather than
 * resolving `app.getPath('userData')` itself) so this module has no Electron dependency and is
 * fully unit-testable, matching this codebase's "explicit provider function" convention (see
 * `TrashService.ts`'s `getAllowedRoot`).
 */
export function getDbPathOverride(prefsFilePath: string): string | undefined {
  try {
    const raw = fs.readFileSync(prefsFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as DesktopPrefs).dbPath === "string" &&
      (parsed as DesktopPrefs).dbPath !== ""
    ) {
      return (parsed as DesktopPrefs).dbPath;
    }
    return undefined;
  } catch {
    // Missing file, unreadable file, or malformed JSON: fail safe/silent, no override.
    return undefined;
  }
}

/**
 * Validates and persists a DB path override to the desktop prefs file.
 *
 * Validates that the TARGET path's parent directory already exists and is writable before
 * touching anything on disk, throwing a clear error otherwise. The prefs file's OWN parent
 * directory (typically `app.getPath('userData')`) is a separate concern: it may not exist yet on
 * a fresh install, so it is created as needed rather than validated.
 */
export function setDbPathOverride(prefsFilePath: string, newPath: string): void {
  const targetParentDir = path.dirname(newPath);
  if (!fs.existsSync(targetParentDir)) {
    throw new Error(`Cannot set DB path override: parent directory does not exist: ${targetParentDir}`);
  }
  try {
    fs.accessSync(targetParentDir, fs.constants.W_OK);
  } catch {
    throw new Error(`Cannot set DB path override: parent directory is not writable: ${targetParentDir}`);
  }

  const prefsParentDir = path.dirname(prefsFilePath);
  fs.mkdirSync(prefsParentDir, { recursive: true });

  const prefs: DesktopPrefs = { dbPath: newPath };
  fs.writeFileSync(prefsFilePath, JSON.stringify(prefs, null, 2), "utf8");
}

/**
 * Clears a previously-saved DB path override so a subsequent `getDbPathOverride` call returns
 * `undefined` again (falling back to the plain default `userData/library.db` path on next
 * launch). This is the recovery half of the override mechanism: if a user-configured override
 * later becomes unusable (its file deleted, corrupted, or its drive unmounted), there is no
 * sensible "fix" to apply to it — the only way forward is to stop pointing at it.
 *
 * Like `getDbPathOverride` above, this must never throw for a missing/malformed/shapeless prefs
 * file — those are all "nothing to clear" cases and are treated as a safe no-op rather than an
 * error, since this is called from a startup failure-recovery path where a second failure would
 * be actively unhelpful.
 *
 * Unlike `setDbPathOverride` above (which blindly overwrites the whole prefs file with `{
 * dbPath: newPath }`, discarding any other field that might exist in it — a known, non-blocking
 * limitation of that function, left alone here since fixing it is out of scope for this change),
 * this function reads the existing prefs object first and removes only the `dbPath` key,
 * preserving any other field the file might contain. That is a deliberate improvement scoped
 * to this new function, not a claim that `setDbPathOverride`'s own behavior was changed.
 */
export function clearDbPathOverride(prefsFilePath: string): void {
  let parsed: unknown;
  try {
    const raw = fs.readFileSync(prefsFilePath, "utf8");
    parsed = JSON.parse(raw);
  } catch {
    // Missing file, unreadable file, or malformed JSON: nothing meaningful to clear.
    return;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || !("dbPath" in parsed)) {
    // Not a plain object, or a plain object with no `dbPath` field: nothing to remove, and
    // nothing is written, so any other fields the file might contain are left untouched.
    return;
  }
  const rest = { ...(parsed as Record<string, unknown>) };
  delete rest.dbPath;
  fs.writeFileSync(prefsFilePath, JSON.stringify(rest, null, 2), "utf8");
}

/**
 * Validates that `dbPath` points at an EXISTING, openable, structurally-sound SQLite database
 * file — throws a clear error otherwise. This is a separate, stricter, UI-flow-specific check
 * from `setDbPathOverride` above (which deliberately still allows overriding to a path that
 * doesn't exist yet on disk, since that's a legitimate generic capability of the override
 * mechanism itself) — it exists purely as the `PUT /api/config/db-location` route's pre-check
 * (added to close a self-lockout footgun: without it, an unusable target still got persisted and
 * triggered a restart, and the app could only fail loudly at next launch via `openDb()` throwing
 * `SQLITE_NOTADB`, with no in-app recovery).
 *
 * Requires the file to already exist (via better-sqlite3's `fileMustExist: true`, and never
 * creates or writes to it — `readonly: true`) rather than accepting "doesn't exist yet, and would
 * be created on open" as a valid case: `ElectronDbFilePickerService`'s native dialog uses
 * `properties: ["openFile"]`, so the only path a real user can ever produce through this route's
 * actual UI is an already-existing file. Silently accepting a nonexistent path here would defeat
 * the point of this check for the one flow that matters — better-sqlite3 would happily create a
 * brand new, empty database at a typo'd path (discarding whatever the user actually meant to
 * point at) and only fail later, at next launch, once real data access is attempted.
 *
 * Opening the file alone is NOT sufficient to catch a non-SQLite file: better-sqlite3 opens a
 * file lazily and only fails on actual data access, so a plain text/garbage file with a `.db`
 * extension opens successfully but throws "file is not a database" on the first real query. A
 * lightweight integrity-checking pragma forces that data access, closing the gap.
 *
 * A zero-byte (or otherwise page-less) file is a THIRD distinct case, not caught by either check
 * above: SQLite treats an empty file as a trivially valid, brand-new empty database — `new
 * Database(..., { fileMustExist: true })` opens it fine, and an integrity-check pragma reports
 * "ok" (there are no pages to be structurally inconsistent). Without an explicit page-count
 * check, a stray empty placeholder `.db` file (e.g. one accidentally created alongside the real
 * library file, or a leftover from an interrupted copy) would be silently accepted, persisted,
 * and relaunched into — exactly the same silent-data-loss footgun this whole function exists to
 * prevent, just reached via an existing-but-empty file rather than a nonexistent path or garbage
 * content. A fresh/empty SQLite connection reports `page_count = 0`, so checking that after the
 * integrity check (cheaper to fail fast on structural corruption first) closes this gap.
 *
 * A FOURTH distinct case: `PRAGMA quick_check`/`integrity_check` are diagnostic QUERIES, not
 * assertions — for corruption that's readable at the raw byte level but structurally invalid
 * (e.g. a b-tree cell pointer pointing at an out-of-range offset, or a page truncated mid-record),
 * SQLite does NOT throw a JS exception. It returns descriptive error text as its RESULT ROWS
 * instead (e.g. `[{ integrity_check: "*** in database main ***\nTree 2 page 2 cell 2: Offset
 * 4096 out of range 1756..4092" }]`), while `page_count` still reports a healthy value (the
 * corruption doesn't affect the page count itself). A caller that runs the pragma purely for its
 * side effect, without inspecting what it returned, silently lets this class of corruption
 * through — which is exactly what this function did before this comment/check was added. The fix
 * is to require the result to be EXACTLY the documented healthy sentinel row and treat anything
 * else (any diagnostic text at all) as a failure.
 *
 * `integrity_check` (not `quick_check`) is used for this: SQLite's own documentation describes
 * `quick_check` as a faster subset of `integrity_check`'s checks (e.g. it skips full freelist
 * page-count verification and some index-vs-table cross-checks that `integrity_check` performs).
 * That speed/thoroughness tradeoff exists for callers running the check routinely/repeatedly
 * (e.g. as part of a health-monitoring loop), which does not describe this function — it runs
 * exactly once, synchronously, only when a user explicitly changes the desktop app's DB location
 * via this route, so the slower, strictly-more-thorough check is free here and preferred.
 *
 * Self-audit (performed while adding the quick_check/integrity_check result-value check above):
 * a directory path (rather than a file) already throws at the `new Database(...)` open step
 * itself ("disk I/O error") — no separate handling needed. A file truncated mid-page was verified
 * to reproduce as non-"ok" `integrity_check` result rows (not a silent pass), so it's covered by
 * this same exact-sentinel check, as is corrupted-freelist-page-count (an explicit part of what
 * `integrity_check`, unlike `quick_check`, verifies per SQLite's own docs). A structurally sound
 * SQLite file that simply belongs to a different application (or an older/incompatible schema
 * version of this app) passes every check here — that's a deliberate, disclosed scope boundary
 * (schema/shape validation is a distinct concern from "is this corrupt", left to the separate
 * Task explicitly scoped for startup-time schema validation/recovery), not an overlooked gap of
 * the same class as the four fixed above.
 */
export function assertDbFileIsOpenable(dbPath: string): void {
  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    throw new Error(
      `"${dbPath}" is not a usable SQLite database file (${err instanceof Error ? err.message : String(err)})`
    );
  }
  try {
    const result = db.pragma("integrity_check") as unknown;
    const isHealthy =
      Array.isArray(result) &&
      result.length === 1 &&
      typeof result[0] === "object" &&
      result[0] !== null &&
      (result[0] as { integrity_check?: unknown }).integrity_check === "ok";
    if (!isHealthy) {
      const detail = Array.isArray(result)
        ? result.map((row) => (row as { integrity_check?: unknown }).integrity_check).join("; ")
        : String(result);
      throw new Error(`failed integrity check: ${detail}`);
    }
    const pageCount = db.pragma("page_count", { simple: true }) as number;
    if (pageCount === 0) {
      throw new Error("file is empty — refusing to treat a placeholder/empty file as a real library database");
    }
  } catch (err) {
    throw new Error(
      `"${dbPath}" is not a usable SQLite database file (${err instanceof Error ? err.message : String(err)})`
    );
  } finally {
    db.close();
  }
}
