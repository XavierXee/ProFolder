# Test Coverage — `REQUIREMENTS.md` vs. the Test Suites

*Maps each numbered clause of [`REQUIREMENTS.md`](REQUIREMENTS.md) (§1–§22) to the tests that
prove it. Last audited 2026-10-24 against the current suites:*

| Suite | Location | Size (all passing) |
|---|---|---|
| Backend unit + route tests | `tests/*.test.ts` | 57 files, 724 tests |
| Frontend component/hook tests | `frontend/src/**/test/*.test.{ts,tsx}` | 60 files, 949 tests |
| End-to-end (Playwright + Cucumber) | `e2e/features/**/*.feature` | 30 features, 115 scenarios |

*Citations name the test file and, where useful, the `describe`/`it` title, rather than line
numbers, which drift. Paths are relative to `tests/`, `frontend/src/` or `e2e/features/` when the
prefix is obvious. §0 (principles) and §23 (development reference) describe intent and tooling
rather than behavior, so they have no rows.*

## Verdict legend

- **UNIT**: asserted by a backend or frontend Vitest test. Backend "route" tests run the real
  Express app over HTTP (`supertest`) with a real in-memory database.
- **E2E**: asserted by an end-to-end scenario driving the real UI against a real server.
- **BOTH**: asserted at both layers.
- **PARTIAL**: only some of the clause's sub-behaviors are covered; the gap is named.
- **NONE**: no automated test; true by code inspection or manual verification only.
- **NOT-HEADLESS**: a visual or OS-level claim (animation, paint timing, layout, a real native
  dialog) that a headless test environment can't observe. It's a permanent limitation, not an
  actionable gap.

## Summary

| Verdict | Rows |
|---|---|
| BOTH | 55 |
| UNIT | 74 |
| E2E | 2 |
| PARTIAL | 6 |
| NONE | 9 |
| NOT-HEADLESS | 1 |
| **Total** | **147** |

Fully covered (BOTH + UNIT + E2E): 131 of 147 rows (89%). Several of those rows still carry a
NOT-HEADLESS sub-clause, noted in the row.

**Open, actionable gaps** (PARTIAL/NONE rows that a test could close):
- §2.3: `$RECYCLE.BIN` isn't tested by name. Several other names are only covered through the
  generic dot-prefix rule.
- §2.11: no regression test proves a scan leaves the files on disk untouched.
- §2.12: the command-line scan (`src/cli/scan.ts`) has no test.
- §22.1: the environment defaults are only partly asserted.

The remaining NONE rows (§16.8, §20.4, §20.5, §21.1, §21.3, §21.6, §22.3) are either deliberately
deferred limitations or desktop/packaging/container behavior. That behavior is verified by
launching the packaged app or by the CI build jobs, not by an automated assertion.

---

## §1 Data Model

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 1.1 | Project field set | UNIT | `scanner.integration.test.ts` |
| 1.2 | AudioFile field set | UNIT | `audioFileRepository.test.ts`, `scanner.integration.test.ts` |
| 1.3a | Status settable and persisted (both entities) | BOTH | `fileStatusTagsScoreRoutes.test.ts`; `projects-tab/` and `files-tab/detail-panel-status-tags-score.feature` ("Editing status … persists after reload") |
| 1.3b | Only catalog keys or `unknown` accepted | UNIT | `batchRoutes.test.ts` ("returns 400 for an invalid status value", files and projects); `statusRepository.test.ts` (`isKnownStatusKey`) |
| 1.4 | Score is null or an integer 1–5 | UNIT | `score.test.ts`; `batchRoutes.test.ts` |
| 1.5a | Tags trimmed, deduplicated, many-to-many | UNIT | `projectRepository.test.ts` |
| 1.5b | Case-insensitive tag dedup | UNIT | `tagRepository.test.ts` ("findOrCreateTag case-insensitive dedup", "dedup survives addTagsToFiles…") |
| 1.6 | `contentModifiedAt` = later of folder and marker mtime | UNIT | `scanner.integration.test.ts` |
| 1.7a | Audio file soft-delete keeps user metadata | BOTH | `scanner.integration.test.ts`; `scanning-settings/exclusion-toggles.feature` ("Re-including a folder … restores the file with its prior status, score, and tags") |
| 1.7b | Project soft-delete and reactivation | UNIT | `projectRepository.test.ts` ("reappearing project is reactivated … preserving its prior status/tags/score/notes"); `scanner.integration.test.ts` |
| 1.8 | Notes on both entities, default empty, kept across rescans | UNIT | `audioFileRepository.test.ts` (`setNotes`, "preserves notes across a metadata update"); `projectRepository.test.ts` (`setNotes`); `fileStatusTagsScoreRoutes.test.ts` (`PATCH …/:id/notes`: empty string, 400 on non-string, 404 on unknown id) |

## §2 Scanning & Indexing

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 2.1a | Recursive async walk | UNIT | `scanner.integration.test.ts` |
| 2.1b | One bad file/folder doesn't abort the scan | UNIT | `scanner.integration.test.ts` (EACCES on a nested folder is recorded while a sibling is still indexed) |
| 2.2 | Audio recognized by extension | UNIT | `audioDetector.test.ts` |
| 2.3 | Ignore list | PARTIAL | `ignoreRules.test.ts`. `$RECYCLE.BIN` is never exercised by name, and several entries are only covered through the generic dot-prefix rule. |
| 2.4a | Package-extension priority (`.logicx`) | UNIT | `dawDetector.test.ts` |
| 2.4b | Project-file extensions (all DAWs) | UNIT | `dawDetector.test.ts` |
| 2.4c | Marker-subfolder fallback | UNIT | `dawDetector.test.ts` |
| 2.4d | Priority when several rules match | UNIT | `dawDetector.test.ts` ("prefers a project-file classification over a marker-subfolder classification…") |
| 2.5 | Folder rows; plain folders inside a project omitted; nested projects kept | UNIT | `scanner.integration.test.ts` |
| 2.6 | File → nearest DAW-project ancestor | UNIT | `projectDetector.test.ts` |
| 2.7 | `hasVideo`/`hasImage` propagation | UNIT | `mediaDetector.test.ts`, `scanner.integration.test.ts` |
| 2.8 | New/modified/unchanged/removed classification | UNIT | `scanner.integration.test.ts` |
| 2.9 | Project removal detection | UNIT | `scanner.integration.test.ts` (whole folder disappears; an already-removed project isn't re-touched) |
| 2.10a | Aggregate scan stats recorded | BOTH | `scanner.integration.test.ts`; e2e scan steps |
| 2.10b | Root, timings and per-path errors persisted | BOTH | `scanRunRepository.test.ts`, `scanner.integration.test.ts`; `scanning-settings/metrics-panel.feature` |
| 2.10c | Latest scan retrievable (`GET /api/scan/last`) | BOTH | `scanRoutes.test.ts`; `scanning-settings/metrics-panel.feature` |
| 2.11 | Scanning is strictly read-only | NONE | True by code inspection; no regression test compares the tree before and after a scan. |
| 2.12 | Command-line scan | NONE | `src/cli/scan.ts` is untested; it calls the same `scanner.ts` covered above. |

## §3 Scan Settings

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 3.1 | Exclude Samples, default on, case-insensitive | BOTH | `ignoreRules.test.ts`; `scanning-settings/scan-settings.feature` |
| 3.2 | Exclude Backup, default on, case-insensitive | BOTH | `ignoreRules.test.ts`; `scan-settings.feature` |
| 3.3 | Toggles persist and apply on the next scan | BOTH | `scanSettings.test.ts`, `configScanSettingsRoute.test.ts`; `scan-settings.feature` |
| 3.4 | Duplicate detection reads Samples regardless of the exclusion | UNIT | `duplicateDetector.test.ts`. Structural proof: the detector never reads the setting. |
| 3.5 | Duplicate threshold: persisted, validated, applies without a rescan | UNIT | `scanSettings.test.ts`, `configScanSettingsRoute.test.ts`, `projectDuplicatesRoute.test.ts` (changed threshold applies immediately), `SettingsPanel.test.tsx` |
| 3.6 | Exclude by pattern: off by default, case-sensitive regex, invalid rejected on save and ignored at scan time | BOTH | `ignoreRules.test.ts` (case-sensitive match, disabled, non-match, "treats an invalid regex pattern as a non-match"); `configScanSettingsRoute.test.ts` (persist, 400 on invalid regex or wrong types); `scan-settings.feature` ("Toggling 'Exclude folders by pattern' on excludes the Stems fixture…") |

## §4 Scan Exclusions

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 4.1 | Excluded folders not descended into | BOTH | `scanner.integration.test.ts`; `exclusion-toggles.feature` |
| 4.2 | Excluding a parent un-excludes and disables its descendants | UNIT | `ScanFolderPanel.test.tsx` (descendant pruning; descendant checkbox disabled). The greyed look itself is NOT-HEADLESS. |
| 4.3 | Relative-path exclusions persist, applied next scan | BOTH | `scanExclusionRepository.test.ts`; `exclusion-toggles.feature` |
| 4.4 | Changing the root clears exclusions | UNIT | `musicRoot.test.ts` ("clears any saved scan exclusions…") |

## §5 Project Folders View

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 5.1 | Columns | BOTH | `ProjectsTable.test.tsx` (type, count, media cells); `projects-tab/filtering.feature`, `batch-edit.feature` |
| 5.2 | Type label and tooltip | UNIT | `ProjectsTable.test.tsx` (`typeLabel`/`typeTooltip`) |
| 5.3 | Row opens panel; outside click or close button closes it | BOTH | `projects-tab/detail-panel-status-tags-score.feature` ("Clicking a folder's row opens its detail panel"); `ProjectDetailPanel.test.tsx` (backdrop and close button) |
| 5.4 | Reveal in Finder from the panel | UNIT | `ProjectDetailPanel.test.tsx` ("calls onReveal with the project path…"); server guard in §13.4 |
| 5.5 | First tag + "+N" chip, tooltip, centered, "—" when empty | UNIT | `TagChips.test.tsx`; `FileRow.test.tsx`, `ProjectsTable.test.tsx` (chip rendered in the tag cell). Centering is NOT-HEADLESS. |

## §6 Audio Files View

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 6.1 | Columns and their order; Location tooltip; truncation | PARTIAL | Order asserted in `FileTable.test.tsx` ("column order"); cells in `FileRow.test.tsx` (project, "—" fallback, `title` = full path); sort targets in `files-tab/sorting.feature`. Truncation is NOT-HEADLESS and is the only gap. |
| 6.2 | Row opens panel, except play button and checkbox | BOTH | `files-tab/detail-panel-status-tags-score.feature`, `audio-player.feature` ("…without opening the detail panel"); `FileRow.test.tsx` (checkbox doesn't fire the row click) |
| 6.3 | Library summary refreshed after scans and edits | BOTH | See §19 |

## §7 Filtering & Sorting

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 7.1 | Debounced search; status (catalog-driven), score (incl. Unscored), tags filters; Folders filter on Files views; AND across types | BOTH | `files-tab/` and `projects-tab/filtering.feature` (search, status, exact score, Unscored, tag, combined, clear-all, empty result); `FilterToolbar.test.tsx` (debounce; "shows the Unknown sentinel plus every catalog status"; Association filter); `audioFileRepository.test.ts` (association filter). The Folders filter is unit-tested only. |
| 7.2 | Column-header sorting, toggle, `aria-sort`, `aria-label` | BOTH | `FileTable.test.tsx`, `ProjectsTable.test.tsx` (sortable headers); `audioFileRepository.test.ts` ("sorts by status, project, and tags"), `projectRepository.test.ts` ("sorts by status, type, tags, and audioFileCount"); `files-tab/sorting.feature` (Track / File, Location, Modified, Score), `projects-tab/sorting.feature` (Project Folder, Modified, Score). The newer columns (Status, Tags, Type, Files, Project) are unit-tested only. |
| 7.3 | Projects "Modified" uses `contentModifiedAt` | BOTH | `projectRepository.test.ts`, `scanner.integration.test.ts`; `projects-tab/sorting.feature` |
| 7.3a | Unscored sorts first ascending, last descending | UNIT | `audioFileRepository.test.ts` (score sort: "null sorts first ascending … last descending") |
| 7.3b | Status by key, tags by first tag, Files by active count | UNIT | `audioFileRepository.test.ts`, `projectRepository.test.ts` (the new-sort-key tests above) |
| 7.4 | Filter or search change resets to page 1 | BOTH | `useAudioFiles.test.ts`, `useProjects.test.ts`; `test/App.pagination.test.tsx` |
| 7.5 | Clear: always visible, disabled when idle, resets everything | BOTH | `FilterToolbar.test.tsx` (disabled state, locked-mode patch); `filtering.feature` ("Clearing all filters…") |
| 7.6 | "N of Total" result count | BOTH | `useAudioFiles.test.ts`, `useProjects.test.ts`; `filtering.feature` (exact "1 of 1" text) |
| 7.7 | Page clamps when a refetch shrinks the results | UNIT | `useAudioFiles.test.ts`, `useProjects.test.ts` (clamp on refetch, plus a negative control for filter changes) |
| 7.8 | Shared, persisted page size; pagination controls | UNIT | `paginationSettings.test.ts`, `paginationRoutes.test.ts`, `useItemsPerPage.test.ts`, `Pagination.test.tsx`, `test/App.pagination.test.tsx` |

## §8 Detail Panels

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 8.1 | Slide-in; dismiss by close, Escape or backdrop; auto-focus | PARTIAL | `FileDetailPanel.test.tsx`, `ProjectDetailPanel.test.tsx` (Escape, backdrop, close button, 50 ms auto-focus); close button also e2e. The slide animation is NOT-HEADLESS and is the only gap. |
| 8.2 | Status, score, tags editing; "Saving…"; optimistic rollback | BOTH | `detail-panel-status-tags-score.feature` (both tabs: status, score, tags via Enter and via suggestion); `ScoreEditor.test.tsx` (click again to clear); `TagEditor.test.tsx` (add on blur); `FileDetailPanel.test.tsx`, `ProjectDetailPanel.test.tsx` ("Saving…", rollback) |
| 8.3 | Project panel extras | UNIT | `ProjectDetailPanel.test.tsx` (DAW badge, "Detected via", duplicates banner, DAW project files list, folder content tree, Reveal/Copy/Move/Delete buttons) |
| 8.4 | File panel extras | UNIT | `FileDetailPanel.test.tsx` (size via `formatBytes`, relative and absolute path, both reveal actions, Copy/Move/Delete buttons) |
| 8.5 | Notes text area, 250 ms debounced save | UNIT | `FileDetailPanel.test.tsx` and `ProjectDetailPanel.test.tsx` ("… - notes": no save before the debounce, save after 250 ms, rollback on failure) |

## §9 Batch Operations

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 9.1 | Multi-select, select-all, cleared on filter/page/tab change | BOTH | `files-tab/` and `projects-tab/batch-edit.feature` (header checkbox, clear on filter and tab change); `test/App.pagination.test.tsx` (clear on page change) |
| 9.2 | Batch Edit at 2+; score overwrites; tag unions; Copy/Move/Delete | BOTH | `batch-edit.feature` (both tabs); `BatchEditPanel.test.tsx` (score, tag, Copy/Move/Delete actions); `file-ops/batch-delete.feature` |
| 9.3 | Project batch edits cascade to files | BOTH | `batchTagCascadeRoute.test.ts`, `batchRoutes.test.ts`; `projects-tab/batch-edit.feature` (score and tag cascade, unselected project untouched) |
| 9.4 | File batch edits re-sync each affected project | BOTH | `batchFileTagsRoute.test.ts` ("re-syncs the owning project…"); `files-tab/batch-edit-cascade.feature` |

## §10 Duplicate Detection

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 10.1 | `GET /api/projects/:id/duplicates` | UNIT | `projectDuplicatesRoute.test.ts` (real HTTP, database and sample files). No e2e scenario. |
| 10.2a | (filename, size) matching | UNIT | `duplicateDetector.test.ts` |
| 10.2b | Filename matching is case-insensitive | UNIT | `projectDuplicatesRoute.test.ts` ("matches sample filenames case-insensitively") |
| 10.2c | Samples at any depth; top-level-only "Imported" | UNIT | `duplicateDetector.test.ts` |
| 10.3 | ≥3 matches AND (ratio ≥ threshold, OR same name and ratio ≥ threshold − 10) | UNIT | `duplicateDetector.test.ts` (negative cases, the name-gated relaxation suite, configurable threshold); `projectDuplicatesRoute.test.ts` |
| 10.4 | Plain folders never compared; ancestor/descendant excluded | UNIT | `duplicateDetector.test.ts` ("excludes a candidate whose folder is an ancestor or descendant…") |
| 10.5a | Different DAW excluded | UNIT | `duplicateDetector.test.ts`, `projectDuplicatesRoute.test.ts` |
| 10.5b | Scan-excluded candidate excluded | UNIT | `projectDuplicatesRoute.test.ts` ("excludes a scan-excluded candidate, with a positive control…") |
| 10.6 | Sorted by descending ratio | UNIT | `duplicateDetector.test.ts` |
| 10.6b | UI display and "Same name" badge | UNIT | `ProjectDetailPanel.test.tsx` (duplicates banner). No e2e scenario renders it. |

## §11 Playback

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 11.1 | Play, pause on second click, switch file | BOTH | `files-tab/audio-player.feature`; `test/App.audioPlayer.test.tsx` (same-file toggle) |
| 11.2 | Player bar contents and controls | BOTH | `audio-player.feature` (filename, stop resets to 0:00, close hides); `AudioPlayerBar.test.tsx` (relative path, play/pause, seek, stop, `formatTime`, reset on file change, play-rejection error) |
| 11.3 | Range streaming; inline playback error | UNIT | `audioStreamRoute.test.ts` (Range support); `AudioPlayerBar.test.tsx` (play rejection) |
| 11.4 | Bottom padding while the bar is visible | NOT-HEADLESS | Layout only. |
| 11.5 | Streams only the stored path, inside the root | UNIT | `audioStreamRoute.test.ts` (traversal id, absolute-path id, query-string trick, stored path outside root, symlink escaping the root) |

## §12 Score & Tag Linking

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 12.1a | File edit → project score = max | BOTH | `linkSync.test.ts`; `files-tab/detail-panel-status-tags-score.feature` ("Editing a file's score and tags recomputes its project live…") |
| 12.1b | File edit → project tags = union, orphaned tags dropped | BOTH | `linkSync.test.ts`; same scenario |
| 12.1c | Recompute scoped to that project | UNIT | `linkSync.test.ts` |
| 12.2a | Project score overwrites files | BOTH | `linkSync.test.ts`; `projects-tab/detail-panel-status-tags-score.feature` |
| 12.2b | Project tags union onto files | BOTH | `linkSync.test.ts`; same scenario ("…without wiping a file's own tag") |
| 12.3 | Directions independent, no ping-pong | UNIT | `linkSync.test.ts` (route-level tests: a sibling file is untouched; the project score doesn't drift after a cascade) |
| 12.4 | New file inherits project score and tags | UNIT | `scanner.integration.test.ts`, `linkSync.test.ts` |

## §13 Settings & Configuration

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 13.1 | Music root: text field or native picker, validated, persisted | BOTH | `scanning-settings/root-path-control.feature` (invalid path, cancel, save); `musicRoot.test.ts`; `RootPathControl.test.tsx`; `folderPickerService.test.ts`, `electronFolderPickerService.test.ts`. The real native dialog is NOT-HEADLESS. |
| 13.2 | Scan Library panel: tree, Select All/Unselect All, scan, result banner | BOTH | `ScanFolderPanel.test.tsx`; `exclusion-toggles.feature` (exclude and rescan, Select All / Unselect All) |
| 13.3 | Settings toggles with save feedback; Apply-buttoned fields | BOTH | `SettingsPanel.test.tsx` ("Saving…"/"Failed", threshold and pattern Apply); `scan-settings.feature` |
| 13.4 | Reveal refused outside the root | UNIT | `revealRoute.test.ts`, `finderService.test.ts`, `electronFinderService.test.ts` |
| 13.5 | Six typed-confirmation toggles, on by default | BOTH | `confirmationSettings.test.ts` ("defaults all six confirmation toggles to true"); `SettingsPanel.test.tsx`; `ConfirmTextInput.test.tsx`, `useTypedConfirmation.test.ts`, `useConfirmationRequired.test.ts`; `CopyMoveDeleteDialog.test.tsx`, `DeleteTabConfirmDialog.test.tsx`, `DeleteStatusConfirmDialog.test.tsx`, `DeleteCatalogTagConfirmDialog.test.tsx`; e2e file-op and tab-delete steps type the confirmation word or name (`e2e/steps/fileOps.steps.ts`, `customTabs.steps.ts`) |
| 13.6 | Items per page 5–500, default 50, all tabs | UNIT | `paginationSettings.test.ts` (default, bounds, non-integer); `SettingsPanel.test.tsx` ("Items per page"); `useItemsPerPage.test.ts` |
| 13.7 | Theme selector and desktop-only data location live in Settings | BOTH | `SettingsPanel.test.tsx` ("Data Location section (desktop-only)"); `ThemeSelector.test.tsx`; `theming/theme-toggle.feature` |
| 13.8 | Setters validate everything before writing | UNIT | `paginationSettings.test.ts`, `metricsSettings.test.ts`, `scanSettings.test.ts`, `confirmationSettings.test.ts` ("throws and leaves the stored value untouched…") |

## §14 Theming

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 14.1 | Default/Light/Dark, persisted, no flash, legacy migration | PARTIAL | `theme-toggle.feature` (select, persist, default, reload); `ThemeSelector.test.tsx`; `test/App.theme.test.tsx` (legacy migration). The no-flash claim is NOT-HEADLESS. |
| 14.2 | Token-only theming, no theme-conditional component logic | PARTIAL | `test/isDarkIsProFolderSweep.test.ts`, `test/index.css.tokens.test.ts`. Rendered colors and contrast are NOT-HEADLESS. |
| 14.3 | 1-second splash screen | UNIT | `SplashScreen.test.tsx` |
| 14.4 | Logo, favicon, "ProFolder" title | UNIT | `Logo.test.tsx`, `test/App.theme.test.tsx`. The favicon file is checked manually. |

## §15 Custom Tabs

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 15.1 | Creation modal: name, type, filters | BOTH | `customTabsRoute.test.ts`, `CreateCustomTabModal.test.tsx`; `custom-tabs/create-and-delete.feature` |
| 15.2 | Criteria locked; no edit route or UI | UNIT | `customTabs.ts` exposes no PATCH (checked by inspection); `CustomFilesTabPanel.test.tsx`, `CustomProjectsTabPanel.test.tsx` (locked filters seed the fetch) |
| 15.3 | Live search and sort over the locked set; pickers hidden | BOTH | Both panel tests ("locked pickers are hidden, search/sort stay live"); `custom-tabs/locked-filtering.feature` |
| 15.4 | Search and sort reset when switching away and back | E2E | `locked-filtering.feature` ("Switching away from a custom tab and back resets live search and sort") |
| 15.5 | Same row interactions as the default tabs | BOTH | Both panel tests (detail panel and editing, batch edit, reveal, Copy/Move/Delete wiring, selection reset); `locked-filtering.feature` (cascade from a custom tab); `file-ops/custom-tab-reachability.feature` |
| 15.6 | Playback is global | UNIT | `CustomFilesTabPanel.test.tsx` (playback props are pass-through) |
| 15.7 | Delete with confirmation; active tab falls back | BOTH | `DeleteTabConfirmDialog.test.tsx`, `test/App.customTabs.test.tsx`; `create-and-delete.feature` (cancel, confirm and fall back) |
| 15.8 | Association filter for Files tabs | UNIT | `CreateCustomTabModal.test.tsx` (association in payload, cleared when switching type); `customTabRepository.test.ts` (association round-trip); `audioFileRepository.test.ts` (associated/unassociated/omitted) |
| 15.9 | Drag-and-drop reorder, persisted | BOTH | `customTabRepository.test.ts` (`reorder`), `customTabsRoute.test.ts` (`PUT /api/custom-tabs/reorder`), `test/App.customTabs.test.tsx` (drag-and-drop, rollback on failure, drop onto itself); `custom-tabs/reorder-and-scroll.feature` (persisted across reload) |
| 15.10 | Horizontal scroll and All tabs panel | BOTH | `TabListPanel.test.tsx`, `test/App.tabListPanel.test.tsx`, `test/App.customTabs.test.tsx`; `reorder-and-scroll.feature` (scrolls instead of wrapping; navigate from All tabs) |
| 15.11 | Catalog deletes and renames propagate to tab filters | UNIT | `customTabRepository.test.ts` (`pruneStatusFromAllTabs`, `pruneTagFromAllTabs`, `renameTagInAllTabs`); `test/App.statusCatalog.test.tsx` (active filter pruned) |

## §16 Copy, Move & Delete

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 16.1 | Available from both panels and the batch panel, in default and custom tabs | BOTH | `FileDetailPanel.test.tsx`, `ProjectDetailPanel.test.tsx`, `BatchEditPanel.test.tsx`, `test/App.fileOps.test.tsx`, both custom panel tests; `file-ops/{copy,move,delete,project-move,batch-delete,custom-tab-reachability}.feature` |
| 16.2 | Delete goes to the Trash | BOTH | `trashService.test.ts` (real `~/.Trash` relocation of a file and a folder, AppleScript escaping); `electronTrashService.test.ts`; `CopyMoveDeleteDialog.test.tsx` (wording); `delete.feature`, `batch-delete.feature` |
| 16.3 | Destinations restricted to the root; re-validated server-side | UNIT | `fileOpsService.test.ts` (outside root, symlink escape, missing destination); `fileOpsRoutes.test.ts`, `projectOpsRoutes.test.ts` (400 outside root); `DestinationFolderPicker.test.tsx`; `file-ops/destination-picker.feature` |
| 16.4 | Project subtree moved or copied atomically with metadata | BOTH | `subtreeRekey.test.ts` (nesting, rollback, literal prefix match); `projectOpsRoutes.test.ts`; `project-move.feature` |
| 16.5 | Single file keeps metadata; project association recomputed | BOTH | `audioFileRepository.test.ts` (`moveFile`/`cloneFile`, DAW vs plain folder association); `fileOpsRoutes.test.ts`; `move.feature`, `copy.feature` |
| 16.6 | Move rejects collisions; Copy auto-renames | UNIT | `fileOpsService.test.ts` (NameConflictError, Finder-style renames); `fileOpsRoutes.test.ts`, `projectOpsRoutes.test.ts` (409). No e2e scenario creates a collision. |
| 16.7 | Batch results per item; partial failure kept | BOTH | `fileOpsRoutes.test.ts`, `projectOpsRoutes.test.ts` (partial failure doesn't roll back); `test/App.fileOps.test.tsx` (summary banner); `batch-delete.feature` (all-succeed case only) |
| 16.8 | Deferred API limitations | NONE | Documented, deliberately not fixed. The UI-side guard `excludeNestedProjectIds` is tested in `BatchEditPanel.test.tsx` and `CustomProjectsTabPanel.test.tsx`. |

## §17 Statuses & Tags Catalog

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 17.1 | Panel lists the catalog, never Unknown | BOTH | `TagsStatusesPanel.test.tsx`; `statuses-tags/catalog-crud.feature` ("…shows the seeded default statuses, but never the built-in Unknown sentinel") |
| 17.2 | Status add, edit and delete (reassign to Unknown); Unknown protected | BOTH | `statusRepository.test.ts`, `statusesRoute.test.ts`, `TagsStatusesPanel.test.tsx`, `test/App.statusCatalog.test.tsx`; `catalog-crud.feature` (create, edit name and color, delete reassigns to Unknown) |
| 17.3 | Tag add, rename (409 on collision) and delete | BOTH | `tagRepository.test.ts`, `tagsRoute.test.ts` (409 on duplicate and colliding rename), `TagsStatusesPanel.test.tsx`; `catalog-crud.feature` (create, assign, delete; rename) |
| 17.4 | Typed confirmation on delete; cancel leaves the catalog unchanged | BOTH | `DeleteStatusConfirmDialog.test.tsx`, `DeleteCatalogTagConfirmDialog.test.tsx`; `catalog-crud.feature` (cancel scenarios) |
| 17.5 | Per-tag usage counts | UNIT | `statsRoute.test.ts` (`/api/stats/tag-counts`), `audioFileRepository.test.ts` (zero-fill for unused tags) |

## §18 Keyboard & Accessibility

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 18.1 | Arrow/Enter/Space row navigation and its exceptions | UNIT | `useRowKeyboardNav.test.tsx`, `test/App.rowKeyboardNav.test.tsx` |
| 18.2 | Closed panels are inert and out of the Tab order | E2E | `accessibility/tab-order.feature` (Settings, Create Custom Tab and All tabs, closed and open) |
| 18.3 | Disambiguated accessible names | BOTH | `FileTable.test.tsx`, `ProjectsTable.test.tsx` (`aria-label="Sort by …"`); every e2e sort and filter step selects by these names |
| 18.4 | Nested Escape closes only the innermost layer | UNIT | `CreateCustomTabModal.test.tsx` ("Escape scoping with a nested dropdown open"), `MultiSelectDropdown.test.tsx` |

## §19 Library Metrics

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 19.1 | Two sections of metric tiles | UNIT | `MetricsPanel.test.tsx` |
| 19.2 | Total/status/tag tiles; editable per section; defaults | BOTH | `metricsSettings.test.ts` (defaults, validation, no partial write), `MetricsPanel.test.tsx`, `statsRoute.test.ts`; `scanning-settings/metrics-panel-editable.feature` ("…persists across reload without leaking into Projects") |
| 19.3 | Stale status or tag shows its raw key | UNIT | `MetricsPanel.test.tsx` ("stale metric reference tolerance") |
| 19.4 | Latest scan change count | BOTH | `MetricsPanel.test.tsx`; `metrics-panel.feature` |

## §20 Security Model

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 20.1 | Loopback by default; `HOST` opt-in | UNIT | `serverBinding.test.ts` |
| 20.2 | Host-header allow-list (DNS-rebinding protection) | UNIT | `hostCheck.test.ts` (parsing, allow-list resolution, 403 for foreign and look-alike hosts, rejected writes never land, `ALLOWED_HOSTS`) |
| 20.3 | Music-root containment on every path-touching route | UNIT | `revealRoute.test.ts`, `finderService.test.ts`, `audioStreamRoute.test.ts`, `fileOpsService.test.ts`, `electronTrashService.test.ts`, `electronFinderService.test.ts` |
| 20.4 | Desktop server on an OS-assigned loopback port | NONE | `electron/main.ts`, verified by launching the packaged app |
| 20.5 | Docker publishes on host loopback only | NONE | `docker-compose.yml` configuration |

## §21 Desktop App

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 21.1 | Embedded server and window | NONE | `electron/main.ts`, verified by launching the packaged app (arm64 and, through Rosetta, the x64 half of the universal build) |
| 21.2 | Electron OS-integration services | UNIT | `electronFinderService.test.ts`, `electronTrashService.test.ts`, `electronFolderPickerService.test.ts`, `electronDbFilePickerService.test.ts` |
| 21.3 | Default database and music locations | NONE | `electron/main.ts`; the env overrides are exercised by the e2e and showcase setups |
| 21.4 | Database location: trial-open, persist, restart | UNIT | `dbLocationRoute.test.ts`, `desktopPrefs.test.ts`, `desktopPrefs.adversarial.test.ts`, `SettingsPanel.test.tsx` (Data Location section) |
| 21.5 | Recovery dialog when the custom location fails | UNIT | `dbOpenRecovery.test.ts` (reset clears the override before relaunching; quit). The native dialog is NOT-HEADLESS. |
| 21.6 | Packaging targets and allowlisted contents | NONE | Built by the CI package jobs; contents checked manually by listing each platform's `app.asar` |

## §22 Configuration & Deployment

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 22.1 | Environment variables and defaults | PARTIAL | `serverBinding.test.ts` (`HOST`), `hostCheck.test.ts` (`ALLOWED_HOSTS`), `musicRoot.test.ts` (fallback to the configured default). `PORT` and `DB_PATH` defaults aren't asserted. |
| 22.2 | Web mode: dev proxy; production serves API and frontend from one origin | UNIT | `staticFrontendServing.test.ts`. The dev proxy is used by every e2e run. |
| 22.3 | Docker image and compose setup | NONE | Built by the CI `docker` job; not run in a test |
| 22.4 | Migrations run on open | UNIT | Every backend test opens a fresh database through `runMigrations`; `statusRepository.test.ts` ("returns the 4 seeded defaults … after migration") |
