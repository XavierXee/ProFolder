import { parseFile } from "music-metadata";

/** How many files are read at once. Each read only touches a file's headers (and, for some
 * formats, its last few kilobytes), so this is bounded by disk latency rather than CPU. */
const CONCURRENCY = 8;

/**
 * Reads an audio file's playback length in seconds from its headers, without decoding the
 * audio. Returns null when the file can't be parsed (damaged, truncated, or not really the
 * format its extension says) or its format doesn't record a length, rather than throwing:
 * an unreadable file must never fail the whole scan.
 */
export async function readDuration(filePath: string): Promise<number | null> {
  try {
    const { format } = await parseFile(filePath, { skipCovers: true });
    const seconds = format.duration;
    return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  } catch {
    return null;
  }
}

/** Reads the duration of every given file, a few at a time, keyed by the same keys. */
export async function readDurations(filesByKey: Map<string, string>): Promise<Map<string, number | null>> {
  const durations = new Map<string, number | null>();
  // One iterator shared by every worker: each takes the next file as soon as it's free.
  const pending = filesByKey.entries();
  async function worker(): Promise<void> {
    for (const [key, filePath] of pending) {
      durations.set(key, await readDuration(filePath));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, filesByKey.size) }, worker));
  return durations;
}
