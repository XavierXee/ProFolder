/**
 * Runs once before the showcase recording: scans the freshly generated demo library, then
 * gives part of it statuses, scores and tags through the real API so the very first frame of
 * the video already looks like a library in use (the rest is left blank so the recording can
 * show it being edited).
 */

// The API's own port, not the Vite proxy — see the same note in e2e/support/globalSetup.ts.
const API = "http://localhost:5175/api";

type Seed = { status?: string; score?: number; tags?: string[] };

const PROJECT_SEEDS: Record<string, Seed> = {
  "Midnight Drive": { status: "released", score: 5, tags: ["synthwave", "single", "mastered"] },
  "Neon Horizon": { status: "needs_mixing", score: 4, tags: ["edm", "collab"] },
  "Ocean Echoes": { status: "draft", score: 3, tags: ["ambient"] },
  "Paper Planes": { status: "done", score: 4, tags: ["indie", "vocals"] },
  "Velvet Thunder": { status: "needs_mixing", score: 2, tags: ["rock"] },
};

const FILE_SEEDS: Record<string, Seed> = {
  "Summer Single - Radio Edit.wav": { status: "released", score: 5, tags: ["pop", "single", "radio", "summer-ep"] },
  "Summer Single - Extended Mix.wav": { status: "done", score: 4, tags: ["pop"] },
  "Club Remix.wav": { status: "done", score: 3, tags: ["edm", "remix"] },
  "Idea 01.wav": { status: "draft", tags: ["sketch"] },
};

export default async function globalSetup(): Promise<void> {
  await retry(() => request("POST", "/scan", {}));

  const { projects } = (await request("GET", "/projects?pageSize=500")) as { projects: { id: string; name: string }[] };
  for (const project of projects) {
    const seed = PROJECT_SEEDS[project.name];
    if (seed) await applySeed(`/projects/${encodeURIComponent(project.id)}`, seed);
  }

  const { files } = (await request("GET", "/files?pageSize=500")) as { files: { id: string; filename: string }[] };
  for (const file of files) {
    const seed = FILE_SEEDS[file.filename];
    if (seed) await applySeed(`/files/${encodeURIComponent(file.id)}`, seed);
  }

  console.log(`[showcase] library scanned: ${projects.length} projects, ${files.length} audio files`);
}

async function applySeed(base: string, seed: Seed): Promise<void> {
  if (seed.status) await request("PATCH", `${base}/status`, { status: seed.status });
  if (seed.score !== undefined) await request("PATCH", `${base}/score`, { score: seed.score });
  if (seed.tags) await request("PATCH", `${base}/tags`, { tags: seed.tags });
}

async function request(method: string, route: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`[showcase] ${method} ${route} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Playwright's webServer readiness check only covers Vite; the API may still be binding its port.
async function retry<T>(fn: () => Promise<T>, attempts = 20): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
