import path from "node:path";
import os from "node:os";
import fs from "node:fs";

function expandHome(inputPath: string): string {
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

export const config = {
  musicRoot: path.resolve(expandHome(process.env.MUSIC_ROOT ?? "~/Music")),
  dbPath: path.resolve(process.cwd(), expandHome(process.env.DB_PATH ?? "./data/library.db")),
  port: Number(process.env.PORT ?? 5175),
  audioExtensions: DEFAULT_AUDIO_EXTENSIONS,
};
