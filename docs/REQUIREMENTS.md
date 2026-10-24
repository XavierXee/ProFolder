# ProFolder — Requirements & Technical Reference

*Describes the system as currently implemented (last reviewed 2026-10-24). Present tense means
"the system does this today". Update this document alongside any behavior change.
[`COVERAGE.md`](COVERAGE.md) maps each numbered clause to the tests that prove it, so keep the
numbering stable: add new clauses at the end of a section rather than renumbering.*

*The user-facing overview lives in the [README](../README.md). This document holds the
behavioral detail (§1–§19) and the technical reference (§20–§23).*

---

## 0. Product Principles

0.1. **Local only.** Music files and metadata never leave the machine: no cloud services, no
accounts, no telemetry or analytics.

0.2. **Scanning is read-only.** Files change on disk only through an explicit user action
(Copy, Move, Delete — §16). Scanning never executes files found in the music folder; it only
reads filesystem metadata.

0.3. **Destructive actions are explicit and reversible where possible.** Delete goes to the
system Trash, and by default every destructive action requires a typed confirmation (§13.5).

0.4. **The database is an index, not the source of truth.** The filesystem is authoritative.
The database adds user-entered metadata (status, score, tags, notes) and keeps it across
rescans, moves and temporary disappearances.

## 1. Data Model

1.1. A **Project** represents a scanned folder (a recognized DAW project or a plain container
folder) and has:
- identity: id (relative path from the music root), name, absolute path;
- detection: an optional marker path (the file or package that identified it as a DAW project),
  an optional DAW type and an optional human-readable detection method;
- content flags: `hasVideo`/`hasImage`;
- user metadata: a status, a list of tags, a score and free-text notes;
- bookkeeping: first-seen/last-seen timestamps, a removed flag and a `contentModifiedAt`
  timestamp.

1.2. An **AudioFile** represents one scanned audio file and has:
- identity and location: id (relative path from the music root), absolute path, relative path,
  filename, extension, containing folder and an optional owning project id;
- file metadata: size, optional created-at and modified-at;
- user metadata: status, tags, score and free-text notes;
- bookkeeping: first-seen/last-seen timestamps and a removed flag.

1.3. **Status** is a key from the editable status catalog (§17), plus the built-in `unknown`
sentinel. `unknown` is always valid, is never stored in the catalog, and can't be edited or
deleted. The catalog is seeded with `draft` (Draft), `needs_mixing` (Need Mixing), `done` (Done)
and `released` (Released). Projects and Audio Files each have their own status, independently.
An unknown key is rejected (400) by every status-writing route.

1.4. **Score** is either `null` (unset) or an integer from 1 (worst) to 5 (best), for both
Projects and Audio Files.

1.5. **Tags** are free-text, user-defined strings, case-insensitively deduplicated, held in a
single global tag catalog (editable, §17) and attached independently to Projects and Audio
Files (many-to-many).

1.6. `contentModifiedAt` on a Project is the later of the project folder's own filesystem mtime
and its DAW marker file's mtime (e.g. the `.als` file, which updates on every save). It is
distinct from `lastSeenAt`, which only reflects scan bookkeeping.

1.7. Every scanned row (Project or AudioFile) tracks `firstSeenAt`, `lastSeenAt` and
`isRemoved`. A file or folder that disappears from disk is soft-deleted (marked removed) rather
than hard-deleted, preserving its user-entered status, tags, score and notes in case it
reappears.

1.8. **Notes** are a free-text field on both Projects and Audio Files. They default to an empty
string (never `null`) and aren't linked between a project and its files (unlike score and tags,
§12).

## 2. Scanning & Indexing

2.1. The scanner recursively walks a configured root folder using async filesystem APIs. It
tolerates a bad file or folder (permission error, broken symlink, race condition) without
aborting the whole scan: each failure is recorded as an error in the scan result.

2.2. The scanner recognizes audio files by extension: `.wav`, `.aiff`, `.aif`, `.mp3`, `.m4a`,
`.flac`, `.ogg` (configurable list).

2.3. The scanner ignores, everywhere: dot-directories, `node_modules`, `.git`, `.Trash`,
`.Spotlight-V100`, `.fseventsd`, `.TemporaryItems`, `$RECYCLE.BIN`, `.DS_Store` files, and
AppleDouble (`._*`) files.

2.4. The scanner classifies a directory as a **DAW project** using, in priority order:
- (a) a child directory whose name ends in a package-style extension (currently only `.logicx`
  → Logic Pro); the package itself is the project;
- (b) a directly-contained file with a known DAW project extension: `.als`→Ableton,
  `.cpr`→Cubase, `.ptx`/`.ptf`/`.pts`→Pro Tools, `.flp`→FL Studio, `.reason`/`.rns`→Reason,
  `.song`→Studio One, `.rpp`→Reaper, `.bwproject`→Bitwig;
- (c) fallback: an exact-name marker subfolder ("Ableton Project Info") when no project file is
  present.

2.5. Every visited folder except the scan root gets its own Project row, whether or not it's a
recognized DAW project. The exception is a plain folder nested *inside* a recognized project,
which is omitted from the folder list. A project nested inside another project still gets its
own row.

2.6. An audio file is associated with the nearest ancestor directory recognized as a DAW
project. Files outside any recognized project stay unassociated (`projectId` undefined).

2.7. A folder's `hasVideo`/`hasImage` flags are set if a video or image file exists anywhere in
its subtree, including nested folders that aren't listed as rows of their own (e.g. inside a
Samples folder). This is detected by propagating each video or image file up through its
ancestors to the scan root.

2.8. On each scan, a file is treated as one of:
- **new**: not previously seen; it immediately inherits its project's current score and tags;
- **modified**: size or modified-at changed; filesystem fields are refreshed but user-set
  status, tags, score and notes are preserved;
- **unchanged**: only `lastSeenAt` is touched;
- **removed**: previously active but not seen this scan; it is marked removed.

2.9. The same removal detection applies to Projects: any previously-active project not observed
in the current scan is marked removed.

2.10. A scan records aggregate statistics: root path, start/finish time, duration, folders
scanned, audio files found, DAW projects found, new/modified/removed file counts, and a list of
per-path errors. The most recent scan run is retrievable (`GET /api/scan/last`).

2.11. Scanning is strictly read-only: it never renames, moves, deletes or modifies any file on
disk.

2.12. A scan can be started from the UI (§13.2) or from the command line
(`npm run scan -- <root>`, `src/cli/scan.ts`), which prints the scan summary.

## 3. Scan Settings (Toggleable Ignore Rules)

3.1. "Exclude Samples folders" (default on) skips any folder literally named "Samples"
(case-insensitive) everywhere in the tree, since such folders typically hold imported or library
material rather than the user's own production audio.

3.2. "Exclude Backup folders" (default on) skips any folder literally named "Backup"
(case-insensitive) everywhere in the tree, since Ableton auto-generates these to hold autosaved
project versions.

3.3. Both toggles are persisted (they survive an app restart) and only take effect on the next
scan.

3.4. Regardless of the Samples-folder exclusion setting, a project's own Contents and
duplicate-detection views still read the Samples folder live from disk. The exclusion only
controls what gets indexed into the Audio Files list, so the Files tab isn't polluted with
imported samples.

3.5. The duplicate-detection match-ratio threshold is also persisted. It's an integer
percentage, 10–100, default 58. Unlike the toggles, it takes effect immediately rather than on
the next scan: it's read every time a project's duplicates are requested (§10.3), since
duplicate detection runs on demand rather than during a scan.

3.6. "Exclude folders by pattern" (default off) skips any folder whose name matches a
user-supplied regular expression, everywhere in the tree. Matching is case-sensitive. The
pattern is pre-filled with `Stems|STEMS` so that enabling the toggle is immediately useful. An
invalid regular expression is rejected when saved. If an invalid pattern ever reaches a scan,
it's treated as matching nothing instead of failing the scan. Like the other toggles, it only
takes effect on the next scan.

## 4. Scan Exclusions (Per-Folder Opt-Out)

4.1. The user can pick specific subfolders (by browsing a folder tree) to exclude from scanning
entirely. The scanner doesn't descend into an excluded folder or anything beneath it.

4.2. Excluding a folder automatically un-excludes any of its already-excluded descendants, and
shows them disabled and greyed, since excluding the parent already covers them.

4.3. Exclusions are relative paths from the configured music root. They're persisted across
restarts and applied on the next scan.

4.4. Changing the configured music root clears all saved scan exclusions, since they were only
meaningful relative to the previous root.

## 5. Project Folders View

5.1. Displays every active (non-removed) Project as a paginated, filterable, sortable table with
these columns, in order: selection checkbox, Project Folder (name over its id), Type (DAW label
or "Folder"), Status, Tags, Score, Files (audio file count), Media (video/image icons),
Modified.

5.2. The Type column shows the detected DAW's display name (e.g. "Ableton", "Logic Pro"), or
"Folder" for a plain container. Hovering shows the detection method (e.g. "Ableton — detected
via .als file").

5.3. Clicking a row opens a detail panel (§8) showing the project's contents, duplicates, DAW
marker files and editable metadata. Clicking outside the panel, or its close button, closes it.

5.4. "Reveal in Finder" (in the Project detail panel) opens the project's folder in the system
file manager. It is refused server-side for any path outside the music root (§13.4).

5.5. The Tags column shows only the item's first tag (alphabetical order), followed by a "+N"
chip when it has more. The chip's tooltip and accessible name list the remaining tags. The
column is centered, and an item with no tags shows "—". The same applies to the Tags column of
the Audio Files view and of custom tabs.

## 6. Audio Files View

6.1. Displays every active audio file as a paginated, filterable, sortable table with these
columns, in order: selection checkbox, Track / File (play button + filename/extension), Project
(id), Location (containing folder path, truncated, with a full-path tooltip), Status, Tags
(§5.5), Score, Modified date.

6.2. Clicking a row (outside the play button and checkbox) opens a detail panel (§8) with the
file's size, full path, project association and editable metadata.

6.3. A library-wide summary is available in the Metrics panel (§19). It's refreshed after any
scan or edit.

## 7. Filtering & Sorting

7.1. Both the Projects and Files views support:
- a debounced (250 ms) text search, matching name/id for projects and filename or relative path
  for files;
- a multi-select Status filter (OR'd), whose options come from the status catalog (§17) plus
  Unknown;
- a multi-select Score filter (OR'd), including an explicit "Unscored" option matching
  `score IS NULL`;
- a multi-select Tags filter (OR'd: matches any of the selected tags);
- Files views only: a single-choice "Folders" filter, limited to files that belong to a project
  or to files that don't (the same association criterion as §15.8).

Different filter types are combined with AND.

7.2. Sorting is done by clicking a column header:
- Projects: Project Folder, Type, Status, Tags, Score, Files, Modified.
- Files: Track / File, Project, Location, Status, Tags, Score, Modified.

Clicking a header sorts by that column ascending, clicking it again toggles to descending, and
clicking a different header switches the sort to that column. Each sort header is a button with
`aria-label="Sort by <Column>"`, and the header cell carries `aria-sort`
("ascending"/"descending"/"none"). Column headers are the only sort mechanism.

7.3. "Modified" sort for Projects orders by `contentModifiedAt` (the later of folder mtime and
DAW marker mtime), not by raw folder mtime or `lastSeenAt`.

7.3a. Sorting by Score treats an unset (`null`) score as the lowest value: unscored rows sort
first in ascending order and last in descending order (SQLite's default `NULL` ordering).

7.3b. Status sorts by the status key (alphabetically), not by catalog order. Tags sort by each
item's alphabetically-first tag; items without tags sort as `NULL` (first ascending). Files
sorts by the count of active audio files in the project.

7.4. Changing any filter or the search text resets pagination back to page 1.

7.5. A "Clear" control is always visible. It's disabled when no filter or sort is active, and
resets search, status, score, tag and sort state in one action.

7.6. The result count for each view ("N of Total") is shown next to the filter bar.

7.7. If an edit or rescan shrinks the result set below the current page, the view automatically
clamps back to the last page that still has data. (A filter change can't trigger this: per
§7.4, a filter change resets the page to 1 first.)

7.8. Page size is a persisted user setting shared by every tab (§13.6). The page indicator and
previous/next controls are shown below the table.

## 8. Detail Panels

8.1. A slide-in side panel (files and projects each have their own) shows full detail for the
selected item. It can be dismissed with its close button, the Escape key or a click on the
backdrop, and it auto-focuses its close button when opened.

8.2. Both panels let the user change:
- Status, through a single-select pill group;
- Score, through a five-dot editor (click to set, click the same dot again to clear);
- Tags: add via Enter or blur (with autocomplete suggestions from the tag catalog), remove via a
  per-tag "×".

Each field saves immediately, with an optimistic UI update that rolls back on failure, and
shows a "Saving…" indicator while the save is in flight.

8.3. The Project detail panel additionally shows:
- a DAW type badge and a "Detected via …" note (when applicable);
- the audio file count;
- a duplicate-detection warning block (§10) when matches exist;
- a list of nested DAW project files when the folder contains more than one;
- a read-only, expandable tree of the folder's actual on-disk contents (files and subfolders),
  always reflecting the live filesystem rather than the database;
- Reveal in Finder, Copy, Move and Delete actions (§16).

8.4. The File detail panel additionally shows:
- the formatted file size and the full relative and absolute paths;
- "Reveal file in Finder" and, only when the file belongs to a project, "Reveal project in
  Finder";
- Copy, Move and Delete actions (§16).

8.5. Both panels have a Notes text area (§1.8). Notes save automatically, 250 ms after the user
stops typing.

## 9. Batch Operations

9.1. Both views support multi-row selection, through per-row checkboxes and a "select all
visible" checkbox in the header. The selection is cleared whenever the filters, the page or the
active tab change.

9.2. A "Batch Edit" button (enabled only once 2+ rows are selected) opens a batch panel offering:
- set score: applies immediately to every selected item, **overwriting** each item's existing
  score;
- add tag: applies immediately, **adding** to each item's existing tags (union, not replace);
- Copy, Move and Delete of the whole selection (§16).

9.3. Batch score edits on Projects cascade the same score onto every audio file of each selected
project. Batch tag edits on Projects cascade the added tags onto every file of each selected
project.

9.4. Batch edits on Files afterwards re-sync each affected file's project: its score (recomputed
maximum) and tags (recomputed union).

## 10. Duplicate Detection

10.1. For a selected DAW project, the system searches for other active projects made with the
*same* DAW whose Samples-folder contents substantially overlap with this project's. That overlap
signals that one project's sample folder was copied from or into the other
(`GET /api/projects/:id/duplicates`).

10.2. Sample files are matched by (filename, size) pair, case-insensitive on the filename. A
folder counts as "Samples" content if its name matches at any depth, or if it's a folder named
"Imported" at the project's top level only. Deeper "Imported" folders are excluded, because
Ableton's own Max-for-Live device cache uses that name and would produce false positives.

10.3. A candidate is flagged as a possible duplicate if it shares at least 3 matching sample
files **and** one of these holds:
- (a) the match ratio (matches ÷ the smaller of the two projects' sample counts) is at least the
  user-configured base threshold (§3.5);
- (b) the two projects' names are equal after trimming and lowercasing, and the match ratio is
  at least the base threshold minus 10 percentage points (clamped at 0).

The 3-sample floor is never relaxed. Each match reports which signals contributed, in a
`matchReasons` list (`"sameName"`, `"sampleOverlap"`, or both).

10.4. A plain container folder (no DAW type) is never treated as a duplicate candidate or
target. Two projects are never compared if one's folder is an ancestor of the other's, because
that's containment, not duplication.

10.5. Matches are excluded if the candidate project is currently scan-excluded (§4) or belongs
to a different DAW.

10.6. Results are sorted by descending match ratio. Each one is displayed with the project's
name, path, matching-sample count and overlap percentage, plus a "Same name" badge when
`matchReasons` includes `"sameName"`.

## 11. Playback

11.1. Clicking a file's play button in the Audio Files table starts in-app playback, or pauses
it if that file is already playing. Playback happens in a fixed player bar docked to the bottom
of the viewport. Clicking a different file's play button switches playback to that file.

11.2. The player bar shows the filename and relative path, play/pause, stop (resets to 0:00), a
seekable progress slider and elapsed/total time. Its close button stops playback and dismisses
the bar.

11.3. Audio is streamed from the server with HTTP Range support, so seeking works without
downloading the whole file first. A playback or unsupported-format error is shown inline in the
player bar.

11.4. While the player bar is visible, the table content gets extra bottom padding so the last
rows aren't hidden behind it.

11.5. The audio-streaming endpoint only ever serves the path stored in the database for that
file id, which only the scanner writes. It can't be used to read arbitrary paths from the
request. As defense in depth, it also refuses to stream any resolved path outside the configured
music root, even if the database row points there (§20.3).

## 12. Score & Tag Linking (Project ↔ Audio File)

12.1. Editing a single file's score or tags recomputes its parent project's score and tags from
scratch, based on **all** of the project's current active files. The score becomes the
**maximum** among them (or `null` if none is scored), and the tags become the **union** of
their tags. So a value no longer held by any file drops off the project.

12.2. Editing a project's score or tags **cascades** onto every active file it contains. The
project's score **overwrites** each file's score, and the project's tags are **added** to each
file's tags (union, not replace).

12.3. The two directions (file→project recompute, project→file cascade) are independent, one-way
operations that never call each other, so no infinite ping-pong is possible.

12.4. When a scan discovers a new audio file inside a project that already has a score and/or
tags, the new file immediately inherits them rather than starting blank.

## 13. Settings & Configuration

13.1. The music root (the "production folder") defaults to `~/Music`, or to the `MUSIC_ROOT`
environment variable. It can be changed at runtime from the header, through a text field or a
native folder picker. The new value is validated (it must exist and be a directory) and
persisted across restarts.

13.2. The "Scan Library" panel shows the folder tree, so the user can choose which subfolders to
include or exclude from scanning (§4). It has Select All / Unselect All and an exclusion
summary, and starts a scan directly. When the scan finishes, the panel closes and a result
banner shows the file counts (new, modified, removed).

13.3. The Settings panel exposes the scan-time ignore toggles (§3.1, §3.2, §3.6) with save-state
feedback ("Saving…"/"Saved"/"Failed"). The duplicate-detection threshold (§3.5) and the folder
pattern (§3.6) are typed into text fields and applied with their own "Apply" buttons. Each
"Apply" button stays disabled until the value is valid and changed, and a rejected value shows
the backend's validation message inline.

13.4. "Reveal in Finder" is refused server-side for any path outside the currently configured
music root, even if requested directly.

13.5. The Settings panel's confirmation section exposes 6 independent, persisted toggles. Each
one gates a typed-text confirmation step before a destructive or bulk action:
- "Confirm tab deletion": type the tab's exact name;
- "Confirm copy" / "Confirm move" / "Confirm delete": type the literal word COPY / MOVE / DELETE
  (§16);
- "Confirm status deletion" / "Confirm tag deletion": type the status's or tag's exact name
  before removing it from the catalog (§17).

All six are **on** by default. When one is on, the confirm button stays disabled until the exact
text is typed (case-sensitive). Removing a tag from a single item's own tag list (§8.2) is a
lighter action and is never gated.

13.6. "Items per page" is a persisted integer from 5 to 500 (default 50). It applies to every
tab: Project Folders, Audio Files and custom tabs.

13.7. The Settings panel also holds the theme selector (§14.1) and, in the desktop app only, the
database-location control (§21.4).

13.8. Every setting above is stored in the database's key/value settings table. A setter
validates all fields before writing any, so an invalid field never leaves a partial write behind.

## 14. Theming

14.1. The UI supports three themes, selected in the Settings panel: Default (the app's own
ProFolder palette and typography), Light and Dark. The choice is persisted in `localStorage` and
applied before first paint, through a `data-theme` attribute on the document root, so the page
doesn't flash. On first load, a legacy dark/light preference is migrated once.

14.2. Theming is expressed entirely through CSS custom-property tokens, defined per
`[data-theme]` in `frontend/src/index.css` and consumed through plain Tailwind utility classes.
No component holds theme-conditional JavaScript; a permanent regression test enforces this
(`frontend/src/test/isDarkIsProFolderSweep.test.ts`). `ThemeSelector.tsx` is the one deliberate
exception, because it renders the theme names themselves. Some Default-theme color roles still
reuse the Light theme's values while their final branded values await a visual-design pass.
They're flagged in `index.css`.

14.3. A splash screen shows for 1 second on every app load: a full-viewport overlay in the
current theme's background color, with the ProFolder logo and "Syncing…". It's a placeholder for
a future scan-on-startup feature.

14.4. The ProFolder logo mark appears in the header and as the favicon, and the header and
browser tab title read "ProFolder".

## 15. Custom Tabs

15.1. Besides the default "Project Folders" and "Audio Files" tabs, the user can create any
number of **custom tabs**. A custom tab is a named, saved view over either Projects or Audio
Files (never both), filtered to a fixed subset. The "+" button at the left of the tab bar opens
a creation modal offering:
- a name;
- a type: Project Folders or Audio Files;
- optional Status, Score and Tags filter pickers (the same multi-select controls as the default
  tabs, including "Unscored");
- for Audio Files tabs only, an association filter (§15.8).

15.2. A custom tab's filter criteria are **locked at creation time**. There is no edit UI, only
create and delete.

15.3. Within a custom tab, free-text search and sort order remain live on top of the locked
subset, exactly as in the default tabs. Neither is part of the tab's saved definition. The
Status/Score/Tags pickers are hidden while a custom tab is active, since those criteria are
fixed.

15.4. A custom tab's search text and sort order reset to their defaults every time the user
navigates away from the tab and back. Each custom tab's table is only rendered while that tab is
active, so switching back mounts a fresh instance.

15.5. Custom tabs support the same row interactions as the default tab of their type: the detail
panel, editing (with the linking of §12), notes, batch edit, Copy/Move/Delete, pagination and
Reveal in Finder.

15.6. Playback is global, not per tab. A single player bar is shared across the whole app, so a
file started from a custom tab keeps playing when the user switches tabs.

15.7. Each custom tab has its own "×" delete button. Clicking it opens a confirmation dialog, and
deleting is permanent (no undo). Deleting the active tab falls back to "Project Folders". By
default, the dialog requires typing the tab's name (§13.5).

15.8. An Audio Files custom tab can be limited to files that belong to a project ("associated"),
to files that don't ("unassociated"), or include both (the default).

15.9. Custom tabs can be reordered by drag and drop in the tab bar. The order is persisted
(`PUT /api/custom-tabs/reorder`) and survives a reload. The default tabs always stay first.

15.10. When the tabs don't fit, the tab bar scrolls horizontally instead of wrapping. An "All
tabs" button next to it opens a panel listing every tab in tab-bar order. Selecting one
navigates to it and closes the panel.

15.11. When a status or tag is deleted from the catalog (§17), it is removed from every custom
tab's locked filter. When a tag is renamed, the custom tabs that reference it are updated to the
new name.

## 16. Copy, Move & Delete

16.1. Copy, Move and Delete are available:
- for a single audio file, from the File detail panel;
- for a single project folder, from the Project detail panel;
- for a multi-row selection, from the Batch Edit panel, in either view.

This applies to the default tabs and to any custom tab. By default, each operation requires a
typed confirmation (§13.5).

16.2. Delete moves the item to the system Trash. It's reversible, not a permanent deletion; this
is an explicit product decision.
- Web mode (macOS): via Finder (`MacTrashService`, AppleScript
  `tell application "Finder" to delete`).
- Desktop app: via Electron's `shell.trashItem` (`ElectronTrashService`), which uses the
  platform's own Trash or Recycle Bin.

16.3. Copy and Move destinations are restricted to folders inside the currently configured music
root, an explicit product decision. The destination picker (`DestinationFolderPicker`) is
populated from `GET /api/folders/tree` and only shows folders inside the root. The backend
independently re-validates containment on every copy/move route (`isWithinRoot`, symlink-safe),
whatever the picker sent. It rejects (400) a destination outside the root, or one that doesn't
exist, with a message naming the actual cause.

16.4. Moving or copying a project folder relocates or duplicates its whole subtree: the project,
every nested sub-project and every audio file anywhere inside it. This happens as a single atomic
database transaction (`moveProjectSubtree`/`cloneProjectSubtree` in
`src/database/repositories/subtreeRekey.ts`), which rekeys or clones the existing rows instead of
removing and re-discovering them with a rescan. Status, tags, score and notes are preserved on
every affected row.

16.5. Moving or copying a single audio file also preserves its metadata (`moveFile`/`cloneFile`
in `src/database/repositories/audioFileRepository.ts`). Its project association is recomputed
from the new location (the nearest DAW project ancestor, or none) rather than carried over.

16.6. Name collisions are handled differently by each operation:
- Move rejects (409, nothing written) if an item with the same name already exists at the
  destination, for files and project folders alike.
- Copy never rejects on a name collision. It auto-renames the way Finder does: `kick.wav` →
  `kick copy.wav` → `kick copy 2.wav`, and `My Project` → `My Project copy`.

16.7. Batch Copy/Move/Delete report success and failure per item rather than all-or-nothing.
Each id is processed independently, and a failure on one item (not found, name collision,
outside the root, filesystem error) doesn't roll back or block the items that succeeded. The
batch panel shows a banner with the actual succeeded/failed counts.

16.8. Known limitations, deliberately deferred:
- `POST /api/files/batch/copy` doesn't deduplicate an id repeated within one request; it
  produces two independent auto-renamed copies. `batch/move` and `DELETE /batch` don't have this
  problem, because the second occurrence fails once the first has been processed.
- `POST /api/projects/batch/move` (and `batch/copy`) process ids in sequence, re-reading each
  project's path from the database. If a batch contains both a project and one of its own
  sub-projects, moving the ancestor first also rekeys the descendant, and the loop then moves the
  descendant again: it's silently flattened out of its parent, depending on id order. The UI
  guards against this (`BatchEditPanel.tsx`'s `excludeNestedProjectIds` drops any selected
  project nested inside another selected project), but the raw API doesn't.

## 17. Statuses & Tags Catalog

17.1. A "Statuses & tags" panel, opened from the header, manages the global status catalog and
tag catalog. The built-in Unknown status is never listed there.

17.2. **Statuses** can be added, edited and deleted.
- Add: a name plus a color (6-digit hex). The new status gets a generated key and goes at the
  end of the catalog order.
- Edit: change the name and/or color. The key never changes, so the items that use it are
  unaffected, and the new badge appears everywhere (tables, panels, filters).
- Delete: in one transaction, every project and file with that status is reassigned to
  `unknown`, then the catalog entry is removed and the status is pruned from every custom tab's
  filter (§15.11). Active filters that referenced it are cleared in the UI.

The `unknown` sentinel can't be edited or deleted (400).

17.3. **Tags** can be added, renamed and deleted from the catalog.
- Add: create a tag that isn't used by anything yet.
- Rename: case-insensitive match. The rename keeps every project and file association, updates
  the custom tabs that reference the tag, and is rejected (409) if the new name collides with
  another existing tag.
- Delete: removes the tag from every project and file, and from every custom tab's filter.

17.4. By default, deleting a status or a tag requires typing its name first (§13.5). Cancelling an add or
a delete leaves the catalog unchanged.

17.5. `GET /api/stats/tag-counts` returns how many projects and files carry each tag. The panel
and the metrics (§19) use it.

## 18. Keyboard & Accessibility

18.1. In the Projects and Files tables, and in custom tabs:
- ArrowUp/ArrowDown move the highlighted row; with nothing highlighted, ArrowDown starts at the
  first row and ArrowUp at the last.
- Enter opens the highlighted row's detail panel.
- Space toggles playback in Files views, and opens the panel like Enter in Projects views.

These keys do nothing while focus is in a text field, or on a button inside an open dialog,
which keeps its own Space/Enter behavior.

18.2. Panels and modals that stay mounted while closed (Settings, Scan Library, Create Custom
Tab, All tabs) are made inert while closed. Their controls are then neither focusable nor
exposed to assistive technology, so the first Tab press from a fresh page load lands on a
visible control.

18.3. Interactive controls whose visible label repeats another control's label get a
disambiguating accessible name (e.g. sort headers are "Sort by <Column>", distinct from the
Status/Score/Tags filter pickers).

18.4. Panels that close on Escape and can be nested (a dropdown inside a modal) handle Escape in
the capture phase and stop it there, so one Escape press closes only the innermost layer.

## 19. Library Metrics

19.1. A "Metrics" panel, opened from the header, has two sections: Project Folders and Audio
Files. Each one shows a list of metric tiles.

19.2. A tile is one of: the total count of active items, the count of items with a given status,
or the count of items with a given tag. Each section's list is editable (add and remove tiles),
persisted independently of the other section, and defaults to Total + Unknown.

19.3. A tile that refers to a since-deleted status or tag stays visible, showing the raw key or
name, rather than breaking the panel.

19.4. The panel also shows the change count of the most recent scan (new + modified + removed),
"No changes", or "No scans yet".

---

## 20. Security Model

20.1. The app has no authentication. The API server therefore binds to loopback (`127.0.0.1`) by
default. Binding to other interfaces requires the explicit `HOST` environment variable (e.g.
`HOST=0.0.0.0`, which exposes the API to the whole LAN).

20.2. **DNS-rebinding protection.** Every request's `Host` header is checked against an
allow-list (`src/api/hostCheck.ts`) before any route runs. The list contains `localhost`,
`127.0.0.1`, `[::1]`, a specific (non-wildcard) `HOST` address, and any names listed in the
`ALLOWED_HOSTS` environment variable (comma-separated). Any other host gets
`403 {"error":"Forbidden: unrecognized Host header"}`. This stops a malicious web page from
reaching the local API through a domain it controls that resolves to `127.0.0.1`.

20.3. **Music-root containment.** Every route that touches a path on disk (reveal, audio
streaming, copy, move, trash) resolves it with `fs.realpath` and refuses it unless it lies inside
the configured music root (`isWithinRoot` in `src/config/musicRoot.ts`). This is symlink-safe and
fails closed. Ids from the request are only ever looked up in the database, never used as paths.

20.4. The packaged desktop app's embedded server binds to loopback on a port assigned by the OS,
so it never conflicts with another local server.

20.5. Docker publishes the container's port on the host's loopback only (`docker-compose.yml`).

## 21. Desktop App (Electron)

21.1. The desktop app (`electron/main.ts`) embeds the same Express API and built frontend
in-process. It starts the server on a free loopback port and opens a window on it. In
development (`npm run dev:electron`), the window loads the Vite dev server instead.

21.2. Desktop builds use Electron-specific services for OS integration:
- `ElectronFinderService`: reveal through `shell.showItemInFolder`;
- `ElectronTrashService`: Trash through `shell.trashItem`;
- `ElectronFolderPickerService` and `ElectronDbFilePickerService`: native dialogs.

Web mode uses the macOS `open`/AppleScript implementations instead, so in web mode those
features only work on macOS.

21.3. By default, the desktop app keeps its database in the OS user-data directory
(`<userData>/library.db`), and its music root defaults to the OS Music folder. `DB_PATH` and
`MUSIC_ROOT` environment variables still override both.

21.4. **Database location** (Settings, desktop only). The user can pick another existing
database file. It is trial-opened before being accepted, saved in `<userData>/desktop-prefs.json`,
and takes effect after an automatic restart: a live database handle is never swapped.

21.5. If the database can't be opened at startup while a custom location is in effect, a dialog
offers to reset to the default location and relaunch, or to quit
(`src/config/dbOpenRecovery.ts`). This keeps a bad location from leaving the app permanently
stuck.

21.6. **Packaging** (`electron-builder.yml`, all builds unsigned for now):
- macOS: arm64 `.dmg` and universal `.dmg`;
- Windows: x64 NSIS installer;
- Linux: x64 `.AppImage` and `.deb` (package and executable name `profolder`).

Each build packs only the compiled app (`dist-electron/`, `dist/frontend/`), `node_modules` and
`package.json`, through an explicit allowlist repeated in full per platform. That keeps the
repo's local database, `.env` and sources out of the package. Each platform keeps only its own
`better-sqlite3` prebuilt binaries, and no native rebuild step is needed, since those binaries
are Node-API and load in Electron as-is.

## 22. Configuration & Deployment

22.1. Environment variables (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `MUSIC_ROOT` | `~/Music` | Production folder to scan (can be overridden in the UI, §13.1) |
| `DB_PATH` | `./data/library.db` | SQLite database file; created with its folder on first start |
| `PORT` | `5175` | API server port (web mode) |
| `HOST` | `127.0.0.1` | Interface to bind (§20.1) |
| `ALLOWED_HOSTS` | — | Extra accepted `Host` names (§20.2) |

22.2. **Web mode.**
- `npm run dev` runs the API (port 5175) and the Vite dev server (port 5173, which proxies
  `/api`).
- `npm run build && npm start` runs the production build: one server on port 5175 serving the
  API and the built frontend from the same origin.

22.3. **Docker.** `Dockerfile` builds a single image of the production web build; Electron isn't
part of it. `docker-compose.yml` and the `Makefile` wrap the usual commands (`make up
MUSIC_DIR=…`, `make down`, `make logs`, `make rebuild`; `make help` lists them).
- The host music folder is mounted at the same absolute path inside the container, so paths
  match the host.
- The database lives in the `profolder-data` named volume, separate from a native install's
  database.
- Reveal in Finder, the native folder picker and Delete (Finder Trash) aren't available in the
  Linux container; they return an error.

22.4. Database migrations (`src/database/migrations/NNN_*.sql`) run automatically, in order, when
the database is opened.

## 23. Development

23.1. **Stack.**
- Backend: Node.js 24, TypeScript, Express 4 and better-sqlite3 (WAL mode), in `src/`.
- Frontend: React 18, Vite and Tailwind, in `frontend/src/`.
- Desktop shell: Electron, in `electron/`.

23.2. **Layout.**

```text
src/
  api/          Express server, routes, host check, pagination
  cli/          command-line scan
  config/       settings modules, music root, desktop prefs
  database/     connection, migrations, repositories
  models/       shared types
  scanner/      walk, ignore rules, DAW/media/audio detection, duplicate detection
  services/     OS integration (reveal, trash, pickers, file operations)
frontend/src/   React app (components, hooks, API client, theme tokens)
electron/       desktop main process
tests/          backend tests (Vitest)
e2e/            Playwright + Cucumber features, steps and fixtures; showcase recording
```

23.3. **Commands.**

| Command | Purpose |
|---|---|
| `npm run dev` | API + frontend in watch mode |
| `npm run dev:electron` | Desktop app in development |
| `npm run scan -- <root>` | One-off scan from the command line |
| `npm test` | All unit tests (backend + frontend projects) |
| `npm run test:backend` / `test:frontend` | One unit-test project |
| `npm run test:coverage` | Unit tests with a combined coverage report in `coverage/` |
| `npm run test:e2e` | End-to-end suite, headless |
| `npm run typecheck:e2e` | Type-check the e2e code |
| `npm run showcase` | Slow feature walkthrough: records the full-quality video to `showcase-output/showcase.webm` and refreshes the screenshots in `docs/screenshots/` |
| `npm run showcase:compress` | Compresses that recording to `docs/screenshots/showcase.webm`, as sharp as fits under GitHub's 10MB video limit (two-pass VP8; takes ~15 minutes) |
| `npm run dist:mac:arm64` / `dist:mac:universal` / `dist:win` / `dist:linux` | Package the desktop app into `release/` |

23.4. **Tests.**
- Unit tests run as two Vitest projects from the root `vitest.config.ts`:
  - `backend` (`vitest.backend.config.ts`): Node, `tests/**/*.test.ts`;
  - `frontend` (`vitest.frontend.config.ts`): jsdom with Testing Library,
    `frontend/src/**/test/*.test.{ts,tsx}`, pinned to `TZ=UTC`.
- The e2e suite (Playwright + `playwright-bdd`, `e2e/features/**/*.feature`) boots its own
  isolated app instance against a scratch music folder and database. It never touches a
  developer's real library. Scenarios that run a real scan or change scan-wide settings carry the
  `@scan-lock` tag, which serializes them across worker processes.

23.5. **Continuous integration** (`.github/workflows/ci.yml`, GitHub Actions). On every push to
`main` and every pull request, it runs:
- type-checking of all four TypeScript projects;
- the unit tests with coverage (the summary goes to the job page and the HTML report is attached
  as an artifact);
- the e2e suite on macOS (one retry on CI);
- the web build;
- a Docker image build.

Pushing a `v*` tag additionally:
- publishes the image to `ghcr.io/xavierxee/profolder`;
- packages the desktop app in four parallel jobs (macOS arm64, macOS universal, Windows, Linux)
  with the tag's version stamped in;
- creates a GitHub Release with every installer attached.

Running the workflow manually builds the desktop packages without releasing them.

---

## Appendix A — Key Files

- Data model: `src/models/*.ts`, `src/database/migrations/001–014_*.sql`
- Scanning: `src/scanner/{walk,ignoreRules,dawDetector,dawTypes,mediaDetector,duplicateDetector,projectDetector,audioDetector,folderTree,scanner}.ts`
- API: `src/api/server.ts`, `src/api/hostCheck.ts`, `src/api/routes/{files,projects,config,scan,folders,reveal,stats,tags,statuses,customTabs}.ts`
- Settings: `src/config/{config,musicRoot,scanSettings,confirmationSettings,paginationSettings,metricsSettings,desktopPrefs,dbOpenRecovery}.ts`
- Linking logic: `src/database/repositories/linkSync.ts`
- Catalog: `src/database/repositories/{statusRepository,tagRepository}.ts`, `frontend/src/components/TagsStatusesPanel.tsx`
- Custom tabs: `src/database/repositories/customTabRepository.ts`, `frontend/src/components/{CreateCustomTabModal,DeleteTabConfirmDialog,CustomFilesTabPanel,CustomProjectsTabPanel,TabListPanel}.tsx`
- Copy/Move/Delete: `src/services/{FileOpsService,TrashService,ElectronTrashService}.ts`, `src/database/repositories/subtreeRekey.ts`, `frontend/src/components/{CopyMoveDeleteDialog,DestinationFolderPicker}.tsx`
- Frontend shell: `frontend/src/App.tsx`, `frontend/src/hooks/{useAudioFiles,useProjects,useRowKeyboardNav,useItemsPerPage}.ts`, `frontend/src/api/client.ts`
- Desktop: `electron/main.ts`, `electron-builder.yml`
- Deployment: `Dockerfile`, `docker-compose.yml`, `Makefile`, `.github/workflows/ci.yml`

## Appendix B — Known Gaps & Dead Code

1. **`FileTagService` (`src/services/FileTagService.ts`) is unused.** It defines an interface and
   a no-op placeholder for a future macOS Finder-tag sync (README roadmap). Nothing instantiates
   it.
2. **Music.app integration (`MusicLibraryService`) isn't implemented.** It's a planned later
   phase (README roadmap), and no code depends on it.
3. **`ProjectWithFiles` (`src/models/Project.ts`) is unused.** The project-detail response shape
   is defined in `frontend/src/api/client.ts` (`ProjectDetail`) instead.
4. The deferred Copy/Move/Delete API limitations are listed in §16.8.
