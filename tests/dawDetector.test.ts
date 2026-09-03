import path from "node:path";
import { describe, it, expect } from "vitest";
import { classifyFolders } from "../src/scanner/dawDetector.js";
import type { WalkEntry, WalkDirInfo } from "../src/scanner/walk.js";

const root = path.resolve("/Music");
const NOW = new Date();

function file(relativePath: string): WalkEntry {
  const absolutePath = path.join(root, relativePath);
  return {
    absolutePath,
    relativePath,
    filename: path.basename(absolutePath),
    stats: { size: 100, birthtime: NOW, mtime: NOW },
  };
}

function dir(relativePath: string, childDirNames: string[] = []): WalkDirInfo {
  const absolutePath = relativePath === "" ? root : path.join(root, relativePath);
  return { absolutePath, relativePath, childDirNames, mtime: NOW };
}

describe("classifyFolders", () => {
  it("recognizes an Ableton project via its .als file", () => {
    const files = [file("Track A/Track A.als")];
    const directories = [dir(""), dir("Track A")];

    const result = classifyFolders(files, directories);

    const trackA = result.get(path.join(root, "Track A"));
    expect(trackA?.dawType).toBe("ableton");
    expect(trackA?.detectedVia).toBe(".als file");
    expect(trackA?.markerPath).toBe(path.join(root, "Track A", "Track A.als"));
  });

  it("recognizes an Ableton project via its Project Info subfolder when no .als is found", () => {
    const files: WalkEntry[] = [];
    const directories = [dir(""), dir("Track B", ["Ableton Project Info"])];

    const result = classifyFolders(files, directories);

    const trackB = result.get(path.join(root, "Track B"));
    expect(trackB?.dawType).toBe("ableton");
    expect(trackB?.detectedVia).toBe("Ableton Project Info folder");
    expect(trackB?.markerPath).toBeNull();
  });

  it.each([
    ["Cubase", "Song.cpr", "cubase"],
    ["Pro Tools (.ptx)", "Session.ptx", "protools"],
    ["Pro Tools (.ptf)", "Session.ptf", "protools"],
    ["Pro Tools (.pts)", "Session.pts", "protools"],
    ["FL Studio", "Beat.flp", "flstudio"],
    ["Reason (modern)", "Song.reason", "reason"],
    ["Reason (legacy)", "Song.rns", "reason"],
    ["Studio One", "Song.song", "studioone"],
    ["Reaper", "Song.rpp", "reaper"],
    ["Bitwig", "Project.bwproject", "bitwig"],
  ] as const)("recognizes %s projects via their project file", (_label, filename, expectedDaw) => {
    const files = [file(`Project Folder/${filename}`)];
    const directories = [dir(""), dir("Project Folder")];

    const result = classifyFolders(files, directories);

    const project = result.get(path.join(root, "Project Folder"));
    expect(project?.dawType).toBe(expectedDaw);
  });

  it("recognizes a Logic Pro package as the project itself, not its parent folder", () => {
    const files: WalkEntry[] = [];
    const directories = [
      dir(""),
      dir("Logic Projects", ["My Song.logicx"]),
      dir("Logic Projects/My Song.logicx", ["Media"]),
    ];

    const result = classifyFolders(files, directories);

    const logicxPath = path.join(root, "Logic Projects", "My Song.logicx");
    expect(result.get(logicxPath)?.dawType).toBe("logic");
    expect(result.get(logicxPath)?.detectedVia).toBe(".logicx package");
    expect(result.get(path.join(root, "Logic Projects"))).toBeUndefined();
  });

  it("does not classify a plain folder with no recognized markers", () => {
    const files = [file("Sample Library/Drums/kick.wav")];
    const directories = [dir(""), dir("Sample Library"), dir("Sample Library/Drums")];

    const result = classifyFolders(files, directories);

    expect(result.size).toBe(0);
  });

  it("prefers a project-file classification over a marker-subfolder classification when both are present (priority-collision case, §2.4)", () => {
    // Directory has BOTH a project file (.als) and the Ableton marker subfolder —
    // per the documented priority order (package ext > project-file ext > marker
    // subfolder), the project-file classification must win.
    const files = [file("Track A/Track A.als")];
    const directories = [dir(""), dir("Track A", ["Ableton Project Info"])];

    const result = classifyFolders(files, directories);

    const trackA = result.get(path.join(root, "Track A"));
    expect(trackA?.dawType).toBe("ableton");
    expect(trackA?.detectedVia).toBe(".als file");
    expect(trackA?.markerPath).toBe(path.join(root, "Track A", "Track A.als"));
  });

  it("picks the most recently modified project file when a folder has more than one", () => {
    const older: WalkEntry = { ...file("Track A/Old.als"), stats: { size: 1, birthtime: NOW, mtime: new Date(0) } };
    const newer: WalkEntry = { ...file("Track A/New.als"), stats: { size: 1, birthtime: NOW, mtime: new Date() } };
    const directories = [dir(""), dir("Track A")];

    const result = classifyFolders([older, newer], directories);

    expect(result.get(path.join(root, "Track A"))?.markerPath).toBe(newer.absolutePath);
  });
});
