/**
 * Compresses the showcase recording (`npm run showcase` → showcase-output/showcase.webm) into
 * docs/screenshots/showcase.webm, as sharp as possible while staying under GitHub's 10MB limit
 * for video attachments. Run with `npm run showcase:compress`.
 *
 * Two-pass VP8 at a bitrate computed from the video's duration, so the file lands just under the
 * limit rather than at whatever size a quality setting happens to produce. A long keyframe
 * interval spends almost nothing on the mostly static UI and keeps text sharp. If container
 * overhead still pushes the file over the limit, the bitrate is lowered and the encode retried.
 *
 * Uses `ffmpeg` from PATH when it has the VP8 encoder, otherwise the ffmpeg build Playwright
 * installs for recording video (the `ffmpeg-*` folder next to its browsers).
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const INPUT = path.join(ROOT, "showcase-output", "showcase.webm");
const OUTPUT = path.join(ROOT, "docs", "screenshots", "showcase.webm");
const LIMIT_BYTES = 10_000_000; // GitHub's "10MB", read as the stricter decimal megabytes
const TARGET_BYTES = LIMIT_BYTES * 0.97;
const MAX_ATTEMPTS = 4;

const ffmpeg = findFfmpeg();
if (!fs.existsSync(INPUT)) fail(`${path.relative(ROOT, INPUT)} not found: run \`npm run showcase\` first.`);

const seconds = duration(INPUT);
let kbps = Math.floor((TARGET_BYTES * 8) / seconds / 1000);
const passlogDir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-"));
const passlog = path.join(passlogDir, "pass");
process.on("exit", () => fs.rmSync(passlogDir, { recursive: true, force: true }));

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(`[showcase:compress] ${seconds.toFixed(1)}s of video at ${kbps}kb/s (attempt ${attempt})`);
  // Pass 1 only gathers statistics; the minimal ffmpeg build has no "null" muxer, so discard a webm.
  encode(1, "-f", "webm", os.platform() === "win32" ? "NUL" : "/dev/null");
  encode(2, OUTPUT);
  const size = fs.statSync(OUTPUT).size;
  console.log(`[showcase:compress] ${path.relative(ROOT, OUTPUT)}: ${(size / 1e6).toFixed(2)}MB`);
  if (size < LIMIT_BYTES) process.exit(0);
  kbps = Math.floor(kbps * (TARGET_BYTES / size) * 0.98);
}
fail(`still over ${LIMIT_BYTES / 1e6}MB after ${MAX_ATTEMPTS} attempts.`);

function encode(pass, ...output) {
  run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", INPUT,
    "-an",
    "-c:v", "libvpx",
    "-b:v", `${kbps}k`, "-minrate", "0", "-maxrate", `${kbps * 5}k`, "-bufsize", `${kbps * 15}k`,
    "-g", "600", "-auto-alt-ref", "1", "-lag-in-frames", "25",
    "-deadline", "good", "-cpu-used", "0", "-threads", String(Math.min(os.cpus().length, 16)),
    "-pass", String(pass), "-passlogfile", passlog,
    ...output,
  ]);
}

function duration(file) {
  // `ffmpeg -i` with no output exits non-zero by design; the metadata is on stderr.
  const { stderr } = spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) fail(`couldn't read the duration of ${file}.`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function findFfmpeg() {
  const onPath = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" });
  if (onPath.status === 0 && /\blibvpx\b/.test(onPath.stdout)) return "ffmpeg";

  const cacheDir =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (os.platform() === "darwin"
      ? path.join(os.homedir(), "Library", "Caches", "ms-playwright")
      : os.platform() === "win32"
        ? path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright")
        : path.join(os.homedir(), ".cache", "ms-playwright"));
  const binary = { darwin: "ffmpeg-mac", win32: "ffmpeg-win64.exe" }[os.platform()] ?? "ffmpeg-linux";
  const dirs = fs.existsSync(cacheDir)
    ? fs.readdirSync(cacheDir).filter((d) => /^ffmpeg-\d+$/.test(d)).sort((a, b) => Number(b.slice(7)) - Number(a.slice(7)))
    : [];
  for (const dir of dirs) {
    const candidate = path.join(cacheDir, dir, binary);
    if (fs.existsSync(candidate)) return candidate;
  }
  fail("no ffmpeg with VP8 support found: install ffmpeg, or run `npx playwright install ffmpeg`.");
}

function run(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: "inherit" });
  } catch {
    fail(`ffmpeg failed (pass ${args[args.indexOf("-pass") + 1]}).`);
  }
}

function fail(message) {
  console.error(`[showcase:compress] ${message}`);
  process.exit(1);
}
