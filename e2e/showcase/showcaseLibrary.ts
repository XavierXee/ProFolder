import fs from "node:fs";
import path from "node:path";

/**
 * Builds the demo music library the showcase recording runs against: realistic-looking DAW
 * project folders, bounced mixes, loose exports and voice memos — generated on the fly (short
 * synthesized WAV tones plus empty DAW marker files) rather than checked in, and deliberately
 * separate from the e2e suite's own `e2e/support/fixtures/music-root`, whose fixture names are
 * tuned for assertions rather than for looking good on screen.
 *
 * Lives under `showcase-output/` (gitignored) rather than the OS temp dir so the production
 * folder path the app displays in the recording stays short and readable.
 */

export const SHOWCASE_OUTPUT_DIR = path.resolve(import.meta.dirname, "..", "..", "showcase-output");
export const SHOWCASE_LIBRARY_DIR = path.join(SHOWCASE_OUTPUT_DIR, "library");
export const SHOWCASE_MUSIC_ROOT = path.join(SHOWCASE_LIBRARY_DIR, "Music");
export const SHOWCASE_DB_PATH = path.join(SHOWCASE_LIBRARY_DIR, "showcase.db");

type Entry =
  | { kind: "wav"; path: string; freq: number; seconds: number }
  | { kind: "marker"; path: string }
  | { kind: "dir"; path: string };

const LIBRARY: Entry[] = [
  // Ableton (detected via its "Ableton Project Info" folder)
  { kind: "marker", path: "Midnight Drive/Ableton Project Info/Project.cfg" },
  { kind: "marker", path: "Midnight Drive/Midnight Drive.als" },
  { kind: "wav", path: "Midnight Drive/Midnight Drive - Master.wav", freq: 220, seconds: 225 },
  { kind: "wav", path: "Midnight Drive/Midnight Drive - Instrumental.wav", freq: 246.94, seconds: 225 },
  { kind: "wav", path: "Midnight Drive/Samples/Kick 01.wav", freq: 55, seconds: 2 },
  // FL Studio
  { kind: "marker", path: "Neon Horizon/Neon Horizon.flp" },
  { kind: "wav", path: "Neon Horizon/Neon Horizon - Mix 1.wav", freq: 261.63, seconds: 262 },
  { kind: "wav", path: "Neon Horizon/Neon Horizon - Mix 2.wav", freq: 293.66, seconds: 259 },
  // Pro Tools
  { kind: "marker", path: "Ocean Echoes/Ocean Echoes.ptx" },
  { kind: "wav", path: "Ocean Echoes/Ocean Echoes - Demo.wav", freq: 196, seconds: 318 },
  // Reaper
  { kind: "marker", path: "Paper Planes/Paper Planes.rpp" },
  { kind: "wav", path: "Paper Planes/Paper Planes - Rough Mix.wav", freq: 329.63, seconds: 196 },
  { kind: "wav", path: "Paper Planes/Paper Planes - Vocals Only.wav", freq: 349.23, seconds: 196 },
  { kind: "wav", path: "Paper Planes/Backup/Paper Planes - Old Mix.wav", freq: 311.13, seconds: 188 },
  // Studio One
  { kind: "marker", path: "Golden Hour/Golden Hour.song" },
  { kind: "wav", path: "Golden Hour/Golden Hour - Final.wav", freq: 392, seconds: 241 },
  // Bitwig
  { kind: "marker", path: "Static Bloom/Static Bloom.bwproject" },
  { kind: "wav", path: "Static Bloom/Static Bloom - Sketch.wav", freq: 174.61, seconds: 94 },
  // Cubase
  { kind: "marker", path: "Velvet Thunder/Velvet Thunder.cpr" },
  { kind: "wav", path: "Velvet Thunder/Velvet Thunder - Master.wav", freq: 164.81, seconds: 287 },
  // Loose bounces, not inside any DAW project
  { kind: "wav", path: "Exports/Summer Single - Radio Edit.wav", freq: 440, seconds: 204 },
  { kind: "wav", path: "Exports/Summer Single - Extended Mix.wav", freq: 415.3, seconds: 372 },
  { kind: "wav", path: "Exports/Club Remix.wav", freq: 369.99, seconds: 308 },
  { kind: "wav", path: "Voice Memos/Idea 01.wav", freq: 523.25, seconds: 41 },
  { kind: "wav", path: "Voice Memos/Idea 02.wav", freq: 493.88, seconds: 27 },
  // Empty destination for the copy demo
  { kind: "dir", path: "Archive" },
];

/** Wipes and regenerates the demo library (and its database location). */
export function buildShowcaseLibrary(): void {
  fs.rmSync(SHOWCASE_LIBRARY_DIR, { recursive: true, force: true });
  fs.mkdirSync(SHOWCASE_MUSIC_ROOT, { recursive: true });

  for (const entry of LIBRARY) {
    const abs = path.join(SHOWCASE_MUSIC_ROOT, entry.path);
    if (entry.kind === "dir") {
      fs.mkdirSync(abs, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (entry.kind === "marker") {
      fs.writeFileSync(abs, "showcase placeholder\n");
    } else {
      fs.writeFileSync(abs, synthWav(entry.freq, entry.seconds));
    }
  }
}

export function removeShowcaseLibrary(): void {
  fs.rmSync(SHOWCASE_LIBRARY_DIR, { recursive: true, force: true });
}

/** A soft major-triad tone with a fade in/out: 16-bit mono PCM. Tracks run their real-song lengths
 * so the duration column and an EP's running time look realistic; the low sample rate (ample for
 * these tones, whose highest partial is well under 1kHz) keeps the generated library small. */
function synthWav(freq: number, seconds: number): Buffer {
  const sampleRate = 11025;
  const sampleCount = Math.floor(sampleRate * seconds);
  const data = Buffer.alloc(sampleCount * 2);
  const fade = sampleRate * 0.5;

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, i / fade, (sampleCount - i) / fade);
    const sample =
      (Math.sin(2 * Math.PI * freq * t) +
        0.6 * Math.sin(2 * Math.PI * freq * 1.25 * t) +
        0.5 * Math.sin(2 * Math.PI * freq * 1.5 * t)) /
      2.1;
    data.writeInt16LE(Math.round(sample * envelope * 0.4 * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
