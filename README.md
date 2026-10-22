# Music Production Library Manager

## Getting Started (Current Implementation)

This repo implements the MVP described below: a scanner CLI, an Express/SQLite API, and a React/Vite frontend. Music.app integration is not implemented; Finder-tag sync is a documented no-op stub (see `src/services/FileTagService.ts`).

```bash
npm install
cp .env.example .env      # edit MUSIC_ROOT if ~/Music isn't your production folder

npm run scan -- ~/Music   # one-off CLI scan, prints a summary, populates SQLite
npm run dev                # starts the API (port 5175) + Vite frontend (port 5173)
npm test                   # scanner/classifier unit + integration tests
npm run build && npm start # production build + run
```

Open `http://localhost:5173` while `npm run dev` is running to use the UI: scan, search/filter, edit status and tags, and reveal files/projects in Finder.

The API server binds to loopback (`127.0.0.1`) only by default, since there is no authentication anywhere in this app. It also only answers requests addressed to `localhost`/`127.0.0.1`/`[::1]`, which blocks DNS-rebinding attacks from web pages open in your browser. See `.env.example` for the opt-in `HOST` and `ALLOWED_HOSTS` env vars if you deliberately want LAN access.

### Running in Docker

A single image (`Dockerfile`) runs the production build: the API and the built frontend on one port. `docker-compose.yml` starts and stops it, and the `Makefile` wraps the common commands (`make help` lists them):

```bash
make up MUSIC_DIR=$HOME/Music # build if needed, start in the background → http://localhost:5175
make logs                     # follow logs
make down                     # stop (the database volume is kept)
make rebuild                  # rebuild the image after code changes and restart
```

Without make: `MUSIC_DIR=$HOME/Music docker compose up -d` / `docker compose down`.

- `MUSIC_DIR` (default `~/Music`) is mounted read-write at the same absolute path inside the container, so paths in the UI match the host. Only folders under that mount exist for the container — changing the music root in the UI to anything outside it won't work.
- `APP_PORT` (default `5175`) is published on the host's loopback only (`127.0.0.1`), for the same no-authentication reason as above.
- The container keeps its own SQLite database in the `profolder-data` named volume, separate from the native `data/library.db`.
- macOS-only actions don't work inside the Linux container and return an error instead: delete (moves files to the Finder Trash), "Reveal in Finder", and the native folder picker.

## Project Goal

Build a local macOS app that scans a music-production folder and gives the user a clear overview of their Ableton projects, exported audio files, drafts, and sample-library content.

The app should help answer:

- What music projects do I have?
- Which projects contain exported audio?
- Where are those exported files located?
- Which tracks appear finished vs. still in draft?
- Which exported tracks should eventually be imported into the macOS Music app?
- Which tags/playlists should each track belong to?

The first version should focus on **scanning, indexing, displaying, and tagging**. Music.app integration and automatic playlist creation should be designed for later implementation, but the architecture should leave room for them.

---

## Important Context

This is primarily a **local macOS application**.

The user's music folder contains a mixture of:

1. Ableton Live production projects
2. Exported audio files
3. Draft/bounce files
4. Sample libraries
5. Other miscellaneous files and folders

The scanner must therefore distinguish between useful track/audio information and sample-library noise as much as reasonably possible.

Do not assume every audio file is a finished track.

---

# Core Features — Version 1

## 1. Scan the Music Folder

Provide a configurable root folder, for example:

```text
~/Music/
```

The scanner should recursively inspect all folders and subfolders.

Possible implementation:

- Node.js filesystem APIs
- Bash for simple filesystem operations where useful
- Prefer Node.js for the main scanner/indexing logic
- Do not depend on cloud services

The scanner should collect at least:

- absolute file path
- relative path from the configured music root
- filename
- extension
- file type
- file size
- creation date if available
- modification date
- containing folder
- parent project/folder information where possible

Supported audio formats should initially include common production formats such as:

```text
.wav
.aiff
.aif
.mp3
.m4a
.flac
.ogg
```

The list should be configurable.

---

# 2. Identify Audio Files

The scanner should find audio files recursively.

Example:

```text
~/Music/
├── Ableton Projects/
│   ├── Track A/
│   │   ├── Track A.als
│   │   ├── Samples/
│   │   └── Exports/
│   │       └── Track A - Final.wav
│   │
│   └── Track B/
│       ├── Track B.als
│       └── Bounce/
│           └── Track B - Draft.wav
│
└── Sample Library/
    ├── Drums/
    │   └── kick.wav
    └── Synths/
        └── pad.wav
```

The app should not simply display every `.wav` file as a finished track.

It should retain information about the **containing folder hierarchy** so the frontend can provide context.

---

# 3. Track / Audio File Model

Create a data model that separates the concept of:

- a production project
- an exported audio file
- a sample/audio asset

A first-pass model could be:

```ts
type TrackStatus = "unknown" | "draft" | "finished";

type AudioFile = {
  id: string;
  path: string;
  relativePath: string;
  filename: string;
  extension: string;

  size: number;
  createdAt?: string;
  modifiedAt?: string;

  containingFolder: string;
  projectId?: string;

  status: TrackStatus;

  tags: string[];

  isExportCandidate: boolean;
};
```

And:

```ts
type Project = {
  id: string;
  name: string;
  path: string;

  abletonProjectFile?: string;

  audioFiles: string[];

  status: TrackStatus;

  tags: string[];
};
```

These models can evolve.

---

# 4. Detect Likely Exported Tracks

The app should attempt to distinguish exported tracks from sample-library audio.

This does NOT need to be perfect in version 1.

Use heuristics such as:

### Folder names

Give higher confidence to files inside folders named:

```text
Export
Exports
Bounce
Bounces
Master
Masters
Final
Finals
Rendered
Render
Mix
Mixes
```

### Filename patterns

Possible indicators:

```text
final
master
mix
bounce
export
demo
draft
v1
v2
version
```

Do not automatically assume that `final.wav` is actually finished.

Instead, calculate something like:

```ts
exportConfidence: number;
```

For example:

```text
0.95 = very likely export
0.70 = probably export
0.30 = probably sample
```

The exact algorithm should remain easy to change.

---

# 5. Folder Context in Frontend

This is an important feature.

For every audio file displayed in the UI, show where it came from.

Example:

```text
Track A - Final.wav

Project:
  Ableton Projects / Track A

File:
  Exports / Track A - Final.wav

Full path:
  ~/Music/Ableton Projects/Track A/Exports/Track A - Final.wav
```

The user should be able to quickly understand:

> "This audio file belongs to this production project and lives in this folder."

The UI should make the containing folder/project easy to navigate or reveal in Finder.

On macOS, consider supporting:

```text
Reveal in Finder
```

using the appropriate local OS integration.

---

# 6. Frontend

Create a simple local frontend.

The first UI should prioritize clarity over visual complexity.

Suggested layout:

```text
-----------------------------------------------------
 Music Library Manager

 [Scan Music Folder]     Last scan: 2 min ago

 Search: [________________________]

 Filters:
 [All] [Finished] [Draft] [Unknown]
 [Has Export] [No Export]

-----------------------------------------------------

 Track / File
 Status
 Tags
 Project
 Location

-----------------------------------------------------

 Track A - Final.wav
 Finished
 electronic, album
 Track A
 Ableton Projects / Track A / Exports

-----------------------------------------------------

 Track B - Draft.wav
 Draft
 electronic
 Track B
 Ableton Projects / Track B / Bounce

-----------------------------------------------------
```

Useful interactions:

- search
- filter by status
- filter by tags
- sort by name
- sort by modified date
- sort by folder
- open/reveal file in Finder
- open/reveal containing project folder
- edit tags
- change status
- rescan

---

# 7. Tagging

Users should be able to assign arbitrary tags to tracks.

Examples:

```text
finished
draft
electronic
house
techno
ambient
album
EP
single
2026
```

Do not hard-code the tag vocabulary.

Store tags in the application's local database/index.

Example:

```ts
tags: string[];
```

The UI should make adding/removing tags easy.

Potential future feature:

- tag suggestions
- tag autocomplete
- predefined tag groups
- smart playlists based on tags

---

# 8. macOS Tags

Investigate whether user-defined application tags can also be written to **macOS Finder tags**.

This is a desired feature, but it should not block version 1.

Possible implementation approaches should be researched before coding.

Requirements:

- If feasible, synchronize application tags to Finder file tags.
- If not feasible cross-platform through Node.js alone, isolate this functionality behind a macOS-specific service/module.
- Do not make the entire app depend on Finder-tag functionality.

Example abstraction:

```ts
interface FileTagService {
  getTags(path: string): Promise<string[]>;
  setTags(path: string, tags: string[]): Promise<void>;
}
```

Then provide a macOS implementation.

---

# 9. Music.app Integration — Later Phase

The long-term goal is to import selected exported tracks into the macOS Music app.

This should NOT be fully implemented in the first iteration unless it is straightforward.

The architecture should support a future workflow:

```text
Scan music folder
       ↓
Identify exported audio
       ↓
User reviews tracks
       ↓
User tags tracks
       ↓
User selects tracks
       ↓
Import into macOS Music
       ↓
Create/update playlists based on tags
```

Important:

Do not assume that simply copying audio files into a Music folder automatically creates the desired Music.app library entries or playlists.

Research Apple's supported macOS Music integration mechanisms before implementing this part.

Potential approaches to investigate later:

- Music.app AppleScript / Apple Events
- Shortcuts
- command-line integration
- Music library XML/export mechanisms
- macOS media library APIs where applicable

Keep this functionality isolated behind a service such as:

```ts
interface MusicLibraryService {
  importTrack(path: string): Promise<void>;

  createPlaylist(name: string): Promise<void>;

  addTrackToPlaylist(trackId: string, playlistName: string): Promise<void>;
}
```

---

# 10. Do NOT Automatically Move Files in Version 1

The initial implementation should be conservative.

Scanning should be read-only.

Do not:

- delete files
- rename files
- move files
- overwrite audio
- modify Ableton projects

without explicit user action.

The future Music.app import/move workflow should be separate from the scanner.

---

# 11. Persistence

The app should not rescan the entire filesystem every time the frontend opens.

Use a local database/index.

A lightweight SQLite database is preferred.

Potential stack:

```text
Node.js
SQLite
TypeScript
```

Store:

- scanned files
- projects
- tags
- status
- export confidence
- scan timestamps
- relationships between projects and audio files

The scanner should detect changes on subsequent scans.

At minimum:

```text
new file
modified file
deleted file
unchanged file
```

Avoid duplicating records when a file has not changed.

A path-based identifier can be used initially, but consider a stable ID strategy for files that are renamed or moved.

---

# 12. Recommended Architecture

Keep the project modular.

Suggested structure:

```text
music-library-manager/
│
├── README.md
├── package.json
├── tsconfig.json
│
├── src/
│   ├── scanner/
│   │   ├── scanner.ts
│   │   ├── audioDetector.ts
│   │   ├── projectDetector.ts
│   │   └── exportClassifier.ts
│   │
│   ├── database/
│   │   ├── db.ts
│   │   ├── migrations/
│   │   └── repositories/
│   │
│   ├── models/
│   │   ├── AudioFile.ts
│   │   ├── Project.ts
│   │   └── Tag.ts
│   │
│   ├── services/
│   │   ├── FinderService.ts
│   │   ├── FileTagService.ts
│   │   └── MusicLibraryService.ts
│   │
│   ├── api/
│   │   └── ...
│   │
│   └── frontend/
│       └── ...
│
└── scripts/
    └── ...
```

The exact framework can be chosen during implementation based on what is simplest and most maintainable.

Possible frontend choices:

- React + Vite
- Next.js
- another lightweight local frontend

If a desktop shell is useful, consider:

- Electron
- Tauri

Prefer the simplest architecture that provides reliable filesystem/macOS integration.

---

# 13. Scanner Requirements

The scanner should:

1. Accept a configurable root directory.
2. Recursively scan it.
3. Ignore obvious system/unwanted directories where appropriate.
4. Detect audio files.
5. Detect Ableton project files (`.als`).
6. Associate audio files with their likely project folder.
7. Calculate export confidence.
8. Store/update records in SQLite.
9. Detect removed files.
10. Return useful scan statistics.

Example output:

```text
Scan complete.

Root:
~/Music

Folders scanned: 2,431
Audio files found: 8,923
Ableton projects: 147
Likely exports: 382
Likely samples: 8,100
Unknown: 441

New files: 23
Modified files: 11
Removed files: 4

Duration: 18.4 seconds
```

---

# 14. Performance

The user's music folder may contain many thousands of audio files.

Therefore:

- use asynchronous filesystem operations where appropriate;
- avoid loading entire audio files into memory;
- do not calculate audio fingerprints in version 1;
- do not analyze audio waveform data unless needed;
- cache filesystem metadata;
- make scanning incremental where possible;
- provide progress information.

Scanning should remain responsive.

---

# 15. Error Handling

The scanner must gracefully handle:

- inaccessible directories
- permission errors
- broken symlinks
- deleted files during scanning
- unusual filenames
- Unicode filenames
- very large files
- external drives that are disconnected

One bad file must not stop the entire scan.

Display a scan summary including errors/warnings.

---

# 16. Security / Safety

This is a local application.

Do not upload music files or metadata to external services.

Do not add analytics or telemetry unless explicitly requested later.

Avoid executing arbitrary files discovered inside the Music directory.

Only inspect metadata and filesystem information.

---

# 17. Development Strategy

Implement in small, testable phases.

## Phase 1 — Scanner CLI

Build a command-line scanner first.

Example:

```bash
npm run scan -- ~/Music
```

Output:

```text
Found 8,923 audio files
Found 147 Ableton projects
Found 382 likely exports
```

Write results to SQLite.

---

## Phase 2 — Basic Frontend

Build a local frontend that reads from SQLite/API and displays:

- tracks
- projects
- paths
- status
- export confidence
- tags

Add:

- search
- filtering
- sorting
- reveal in Finder

---

## Phase 3 — Editing Metadata

Allow the user to:

- change status
- add/remove tags
- mark/unmark export candidate

Persist these changes.

---

## Phase 4 — Finder Tags

Implement optional synchronization between application tags and macOS Finder tags.

Do not block the app if Finder-tag synchronization fails.

---

## Phase 5 — Music.app Integration

Add explicit user-controlled:

- import selected tracks
- create playlists
- assign imported tracks to playlists based on tags

Do not silently modify the Music library.

---

# 18. UX Principles

The application is primarily a **music-production archive manager**, not a generic file browser.

The most important information is:

```text
TRACK
STATUS
TAGS
PROJECT
EXPORT FILE
LOCATION
```

A user should be able to look at a track and immediately understand:

> "This is my finished version of Track X, the exported file is here, and it belongs to Project X."

Avoid clutter.

Do not expose every filesystem property by default.

Advanced metadata can be shown in a details panel.

---

# 19. Important Product Decisions

For the first implementation:

- Assume macOS.
- Assume local filesystem.
- Use TypeScript where practical.
- Prefer Node.js for scanning.
- Use SQLite for persistence.
- Keep the frontend simple.
- Keep filesystem operations separate from UI.
- Make potentially destructive operations explicit.
- Do not automatically move or delete files.
- Do not automatically import everything into Music.app.
- Treat export detection as heuristic, not fact.
- Preserve the original file path for every indexed file.

---

# 20. Implementation Instructions

When implementing this project:

### First

Inspect the repository and existing files before making architectural decisions.

### Then

Create a minimal working implementation rather than trying to build every feature at once.

Start with:

1. project setup
2. scanner
3. SQLite database
4. audio/project detection
5. CLI scan command
6. basic frontend
7. track listing

### Coding principles

- Use TypeScript.
- Keep modules small.
- Prefer clear, boring code over clever abstractions.
- Add types for important data structures.
- Handle filesystem errors explicitly.
- Do not hard-code the user's music path.
- Make the root music directory configurable.
- Never delete or move files during scanning.
- Add tests for scanner/classification logic.
- Keep macOS-specific functionality isolated.
- Keep future Music.app integration behind an interface/service.
- Document important architectural decisions.

### Before implementing uncertain macOS functionality

If something depends on undocumented or unclear macOS behavior, research it first rather than guessing.

In particular, verify the supported mechanism for:

- Finder tags
- Music.app imports
- Music.app playlist creation

---

# Definition of Done for Initial MVP

The MVP is successful when the user can:

1. Configure their music folder.
2. Run a scan.
3. See all detected audio files.
4. See which Ableton project/folder each audio file belongs to.
5. See likely exported audio files.
6. Search and filter the results.
7. Mark tracks as Draft / Finished / Unknown.
8. Add and remove tags.
9. Persist those changes locally.
10. Reveal the original file/folder in Finder.
11. Rescan later without creating duplicate records.

Music.app integration is **not required for the MVP**.

## License

[MIT](LICENSE)
