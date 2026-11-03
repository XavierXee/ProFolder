import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDuration, readDurations } from "../src/scanner/audioDuration.js";
import { makeWav } from "./wavFixture.js";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "audio-duration-test-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function write(name: string, content: Buffer | string): Promise<string> {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content);
  return filePath;
}

describe("readDuration", () => {
  it("reads a WAV file's length in seconds from its header", async () => {
    const filePath = await write("take.wav", makeWav(2.5));
    expect(await readDuration(filePath)).toBeCloseTo(2.5, 3);
  });

  it("returns null for a file that isn't really audio, instead of throwing", async () => {
    const filePath = await write("fake.wav", "not audio at all");
    expect(await readDuration(filePath)).toBeNull();
  });

  it("returns null for a file that doesn't exist", async () => {
    expect(await readDuration(path.join(dir, "missing.wav"))).toBeNull();
  });
});

describe("readDurations", () => {
  it("reads every file, keyed by the caller's keys, including more files than run at once", async () => {
    const files = new Map<string, string>();
    for (let i = 0; i < 12; i++) files.set(`key-${i}`, await write(`take-${i}.wav`, makeWav(i + 1)));
    files.set("broken", await write("broken.wav", "garbage"));

    const durations = await readDurations(files);

    expect(durations.size).toBe(13);
    for (let i = 0; i < 12; i++) expect(durations.get(`key-${i}`)).toBeCloseTo(i + 1, 3);
    expect(durations.get("broken")).toBeNull();
  });

  it("returns an empty map when given no files", async () => {
    expect((await readDurations(new Map())).size).toBe(0);
  });
});
