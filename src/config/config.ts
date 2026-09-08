import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export function expandHome(inputPath: string): string {
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

export const DEFAULT_AUDIO_EXTENSIONS = [".wav", ".aiff", ".aif", ".mp3", ".m4a", ".flac", ".ogg"];

/**
 * Resolves the host/interface the API server should bind to. Defaults to loopback-only
 * (`127.0.0.1`) so the server is never reachable from other devices on the LAN unless an
 * operator explicitly opts in via the `HOST` env var (e.g. `HOST=0.0.0.0`).
 *
 * Pure by design (no direct env access) so it can be unit-tested with explicit arguments
 * without depending on module-load-time env state or the real `.env` file.
 */
export function resolveHost(rawEnvValue: string | undefined): string {
  const trimmed = rawEnvValue?.trim();
  return trimmed ? trimmed : "127.0.0.1";
}

export const config = {
  musicRoot: path.resolve(expandHome(process.env.MUSIC_ROOT ?? "~/Music")),
  dbPath: path.resolve(process.cwd(), expandHome(process.env.DB_PATH ?? "./data/library.db")),
  port: Number(process.env.PORT ?? 5175),
  host: resolveHost(process.env.HOST),
  audioExtensions: DEFAULT_AUDIO_EXTENSIONS,
};
