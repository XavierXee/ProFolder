import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { isWithinRoot } from "../config/musicRoot.js";

export interface FileOpsService {
  copyPath(sourceAbsolutePath: string, destDirAbsolutePath: string): Promise<{ newAbsolutePath: string }>;
  movePath(sourceAbsolutePath: string, destDirAbsolutePath: string): Promise<{ newAbsolutePath: string }>;
}

/** Thrown when the source or resolved destination path resolves outside the configured music root. */
export class PathOutsideRootError extends Error {}

/** Thrown when a move's destination already has an item with the same name. Copy never
 * throws this — it auto-renames Finder-style instead (see `resolveCopyDestinationName`). */
export class NameConflictError extends Error {}

/** Returns true if `error` is a Node.js filesystem error with the given `code`. */
function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

/** Finder-style auto-rename: `kick.wav` -> `kick copy.wav` -> `kick copy 2.wav` -> ...,
 * and `My Project` -> `My Project copy` -> `My Project copy 2` -> ... for extensionless
 * names (e.g. directories). Increments until a name that doesn't yet exist in `destDir`
 * is found. */
function resolveCopyDestinationName(destDir: string, originalName: string): string {
  const ext = path.extname(originalName);
  const base = ext ? originalName.slice(0, -ext.length) : originalName;

  let candidate = originalName;
  if (fs.existsSync(path.join(destDir, candidate))) {
    let attempt = 0;
    do {
      attempt += 1;
      const suffix = attempt === 1 ? " copy" : ` copy ${attempt}`;
      candidate = `${base}${suffix}${ext}`;
    } while (fs.existsSync(path.join(destDir, candidate)));
  }
  return candidate;
}

/** Pure filesystem mechanics for copying/moving files and directories, with no database
 * awareness — callers that need to keep DB rows in sync with a moved/copied path do so
 * on top of this service. Operates entirely on absolute paths. */
export class NodeFileOpsService implements FileOpsService {
  /** Takes a provider function rather than a fixed path, since the configured music root can change at runtime. */
  constructor(private readonly getAllowedRoot: () => string) {}

  private assertWithinRoot(absolutePath: string, description: string): void {
    const root = this.getAllowedRoot();
    if (!isWithinRoot(absolutePath, root)) {
      // `isWithinRoot` fails closed (via `fs.realpathSync`) on ENOENT the same way it fails
      // closed on a genuine outside-root path — distinguish the two here so a destination
      // directory that simply doesn't exist yet gets an accurate message instead of the
      // misleading "outside the configured music root".
      if (!fs.existsSync(absolutePath)) {
        throw new PathOutsideRootError(`Refusing to operate on a ${description} that does not exist: ${absolutePath}`);
      }
      throw new PathOutsideRootError(`Refusing to operate on a ${description} outside the configured music root`);
    }
  }

  /** Explicit guard against the one way `path.basename(sourceAbsolutePath)` can produce a
   * name that escapes `destDirAbsolutePath` when joined back on: `path.basename` does not
   * normalize `.`/`..` segments, so e.g. path.basename("<root>/someRealSubfolder/..") is
   * literally "..", even though sourceAbsolutePath itself resolves (via realpath) to
   * somewhere genuinely inside root and passes its own containment check. If that basename
   * were used as-is, `path.join(destDirAbsolutePath, name)` could compute to the PARENT of
   * the destination directory — outside root when destDirAbsolutePath is root's own
   * top-level directory. (Note: we can't instead re-run `isWithinRoot`/realpath on the
   * final computed `newAbsolutePath`, because that target never exists yet at this point in
   * a legitimate copy/move — realpath fails closed on any non-existent path, which would
   * reject every normal operation, not just this escape.) Reject this specific, narrow input
   * shape explicitly rather than relying on the auto-rename in `resolveCopyDestinationName`
   * or `fs.existsSync`'s collision check to accidentally stay in-bounds. */
  private assertNameIsNotDotOrDotDot(name: string, description: string): void {
    if (name === "." || name === "..") {
      throw new PathOutsideRootError(
        `Refusing to operate on a ${description} whose final path segment is "${name}" — this could compute a destination outside the configured music root`
      );
    }
  }

  async copyPath(sourceAbsolutePath: string, destDirAbsolutePath: string): Promise<{ newAbsolutePath: string }> {
    this.assertWithinRoot(sourceAbsolutePath, "source path");
    this.assertWithinRoot(destDirAbsolutePath, "destination directory");

    const originalName = path.basename(sourceAbsolutePath);
    this.assertNameIsNotDotOrDotDot(originalName, "source path");
    const finalName = resolveCopyDestinationName(destDirAbsolutePath, originalName);
    const newAbsolutePath = path.join(destDirAbsolutePath, finalName);

    await fsp.cp(sourceAbsolutePath, newAbsolutePath, { recursive: true });

    return { newAbsolutePath };
  }

  async movePath(sourceAbsolutePath: string, destDirAbsolutePath: string): Promise<{ newAbsolutePath: string }> {
    this.assertWithinRoot(sourceAbsolutePath, "source path");
    this.assertWithinRoot(destDirAbsolutePath, "destination directory");

    const name = path.basename(sourceAbsolutePath);
    this.assertNameIsNotDotOrDotDot(name, "source path");
    const newAbsolutePath = path.join(destDirAbsolutePath, name);

    if (fs.existsSync(newAbsolutePath)) {
      throw new NameConflictError(`An item named "${name}" already exists in the destination`);
    }

    try {
      await fsp.rename(sourceAbsolutePath, newAbsolutePath);
    } catch (error) {
      if (!hasErrorCode(error, "EXDEV")) {
        throw error;
      }
      // Cross-device move (e.g. destination on a different filesystem/volume than the
      // source, even though both resolve inside the same configured root): fs.rename
      // can't do this atomically, so fall back to copy-then-delete-original.
      await fsp.cp(sourceAbsolutePath, newAbsolutePath, { recursive: true });
      try {
        await fsp.rm(sourceAbsolutePath, { recursive: true });
      } catch (rmError) {
        // The copy succeeded but removing the original failed: the data now exists in
        // both places, which is a correctness bug for a "move" (must be atomic — either
        // fully happened or didn't). Roll back the just-created destination copy so we
        // end up in a consistent "nothing happened" state instead of a silent duplicate.
        try {
          await fsp.rm(newAbsolutePath, { recursive: true, force: true });
        } catch (rollbackError) {
          // Rollback itself failed too — a genuinely unlucky double-failure. Don't
          // swallow either error: surface both so the inconsistent state (data now
          // duplicated at both source and destination) is discoverable rather than lost.
          throw new Error(
            `Move failed after partial copy, and rollback cleanup of the destination copy also failed. ` +
              `Manual intervention may be required to remove "${newAbsolutePath}". ` +
              `Original error: ${(rmError as Error).message}. Rollback error: ${(rollbackError as Error).message}`
          );
        }
        throw rmError;
      }
    }

    return { newAbsolutePath };
  }
}
