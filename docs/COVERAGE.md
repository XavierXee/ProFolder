# Test Coverage Audit — `docs/REQUIREMENTS.md` §1–§14 vs. `e2e/features/**` + `tests/**`

*Task 9 of `docs/TODO.md` item 1. Produced by cross-referencing every requirement clause in
`docs/REQUIREMENTS.md` against the current test corpus. Methodology: split across two Tester
passes — Task 9.1 covered the backend/data-layer sections (§1, §2, §3, §4, §10, §12), Task 9.2
covered the frontend/UI sections (§5, §6, §7, §8, §9, §11, §13, §14) — then consolidated here
(Task 9.3). A separate, already-fully-gated Task 9.4 (Developer/Tester/Reviewer/Auditor cycle)
closed one real gap this audit surfaced along the way (§11.3/§11.5, see below); its result is
folded into this document rather than re-run.*

*Backend test baseline at time of writing: **21 test files, 181 tests, all passing**
(`npx vitest run`), `tsc --noEmit` clean.*

*Rows below are organized one per `REQUIREMENTS.md` sub-clause (85 rows total). Several rows
(e.g. §7.1, §8.1, §8.2, §5.1) bundle multiple individually-checked sub-clauses inline in their
citation/verdict text rather than each getting its own row — accounting for those, the two
Testers audited roughly **113 individual clauses** in total (43 in Task 9.1's backend pass, ~70
in Task 9.2's frontend pass), which is where that clause count comes from even though the table
itself has 85 addressable rows.*

## Verdict legend

- **COVERED-UNIT** — asserted by a `tests/*.test.ts` vitest.
- **COVERED-E2E** — asserted by an `e2e/features/**` Playwright/Cucumber scenario.
- **COVERED-BOTH** — asserted at both layers.
- **PARTIAL** — the requirement has more than one clause/sub-behavior and only some are covered; the gap is spelled out in the row.
- **WRONG-LAYER** — the underlying logic is unit-tested but the requirement itself (a route, a UI rendering) is not — the coverage exists one layer down from what the requirement actually describes.
- **NONE** — no test at any layer exercises this behavior; only established by reading the code.
- **NOT-HEADLESS-VERIFIABLE** — a real, permanent limitation of this repo's test environment (no visual/paint-timing assertions possible in a headless runner), not a gap that can be closed by writing more tests. Per explicit user decision this session, these are **not** turned into TODO follow-ups.
- **REQUIREMENT-SUSPECT** — while auditing, the Tester found the requirement text itself may not match the intended/actual behavior (flagged in addition to a coverage verdict, not instead of one).

## Summary counts (85 rows)

| Verdict | Count |
|---|---|
| COVERED-UNIT | 31 |
| COVERED-BOTH | 16 |
| COVERED-E2E | 5 |
| PARTIAL | 18 |
| WRONG-LAYER (primary) | 1 (+2 more rows carry it as a secondary/dual verdict — 8.3, 10.6b) |
| NONE | 12 |
| NOT-HEADLESS-VERIFIABLE | 2 |
| **Total rows** | **85** |

Fully covered (COVERED-UNIT + COVERED-BOTH + COVERED-E2E) = 52/85 rows (61%). Rows with a real,
actionable gap (PARTIAL + WRONG-LAYER + NONE) = 31/85 (36%). The remaining 2 rows
(NOT-HEADLESS-VERIFIABLE) are a permanent environment limitation, not an actionable gap.
(Updated by item 5's cycle: §2.1b, §2.10b, §2.10c moved from NONE, and §6.3 from WRONG-LAYER/COVERED-UNIT, to fully covered. Updated by item 7's cycle: §1.7b, §2.9 moved from NONE to COVERED-UNIT — see `docs/TODO.md`'s Task 9 follow-up items 5/6/7 closure notes.)

---

## §1 Data Model

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 1.1 | Project field set | COVERED-UNIT | `tests/scanner.integration.test.ts:51`, `:208` |
| 1.2 | AudioFile field set | COVERED-UNIT | `tests/audioFileRepository.test.ts:52`, `tests/scanner.integration.test.ts:51` |
| 1.3a | Status settable/persisted (both entities) | COVERED-BOTH | `e2e/features/projects-tab/detail-panel-status-tags-score.feature:24`, `e2e/features/files-tab/detail-panel-status-tags-score.feature:25` |
| 1.3b | Runtime enforcement that status is only the 5 valid values | NONE | No `VALID_STATUSES`/"status must be" assertions in `tests/*.test.ts`; guard exists at `src/api/routes/files.ts:170`, untested |
| 1.4 | Score null or 1-5 int, both entities | COVERED-UNIT | `tests/score.test.ts:5,10`, `tests/batchRoutes.test.ts:94` |
| 1.5a | Tags trimmed/deduped/many-to-many | COVERED-UNIT | `tests/projectRepository.test.ts:178,162` |
| 1.5b | Tags case-insensitive dedup specifically | NONE | No `tagRepository.test.ts` exists; `COLLATE NOCASE` logic at `src/database/repositories/tagRepository.ts:5` never exercised with different-case variants |
| 1.6 | `contentModifiedAt` = later of folder/marker mtime | COVERED-UNIT | `tests/scanner.integration.test.ts:336` |
| 1.7a | Audio file soft-delete preserves status/tags/score | COVERED-BOTH | `tests/scanner.integration.test.ts:136`, `e2e/features/scanning-settings/exclusion-toggles.feature` |
| 1.7b | Project soft-delete (`markRemoved`) | COVERED-UNIT | `tests/projectRepository.test.ts` (`markRemoved`/`upsertProject` reactivation, status/tags/score preservation), `tests/scanner.integration.test.ts` (a real scan soft-removes/reactivates a whole project folder) |

## §2 Scanning & Indexing

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 2.1a | Recursive async walk | COVERED-UNIT | `tests/scanner.integration.test.ts:51` |
| 2.1b | Tolerates one bad file/folder without aborting | COVERED-UNIT | `tests/scanner.integration.test.ts:464` — EACCES on a nested subdirectory records a per-path error while still indexing a sibling file outside it |
| 2.2 | Extension-based audio recognition | COVERED-UNIT | `tests/audioDetector.test.ts:17,28` |
| 2.3 | Ignore list (dot-dirs, node_modules, .git, .Trash, .Spotlight-V100, .fseventsd, .TemporaryItems, $RECYCLE.BIN, .DS_Store, AppleDouble) | PARTIAL | `tests/ignoreRules.test.ts:5,10,52`; `$RECYCLE.BIN` never exercised by exact name; several only implicitly covered via the generic dot-prefix branch |
| 2.4a | Package-extension priority (.logicx) | COVERED-UNIT | `tests/dawDetector.test.ts:70` |
| 2.4b | Project-file extension detection (10 DAW types) | COVERED-UNIT | `tests/dawDetector.test.ts:49,25` |
| 2.4c | Marker-subfolder fallback | COVERED-UNIT | `tests/dawDetector.test.ts:37` |
| 2.4d | Priority-collision override | COVERED-UNIT | `tests/dawDetector.test.ts:95` — spot-checked directly during this consolidation; confirms `REQUIREMENTS.md` Appendix C's claim that this case is untested is **stale** |
| 2.5 | Every folder gets Project row except plain-nested; nested project gets own row | COVERED-UNIT | `tests/scanner.integration.test.ts:249,283` |
| 2.6 | Audio file → nearest-ancestor project association | COVERED-UNIT | `tests/projectDetector.test.ts:8,19` |
| 2.7 | hasVideo/hasImage ancestor-propagation | COVERED-UNIT | `tests/mediaDetector.test.ts:34`, `tests/scanner.integration.test.ts:266` |
| 2.8 | new/modified/unchanged/removed classification | COVERED-UNIT | `tests/scanner.integration.test.ts:88,98,118,136` |
| 2.9 | Comparable removal detection for Projects | COVERED-UNIT | `tests/scanner.integration.test.ts` — a whole project folder disappearing between scans is marked removed via a real scan (not just the repository function in isolation); regression test proves an already-removed project isn't re-marked/re-touched on a subsequent no-op scan |
| 2.10a | Aggregate scan stats recorded | COVERED-BOTH | `tests/scanner.integration.test.ts:54-58`, `e2e/steps/scanning.steps.ts:78` |
| 2.10b | rootPath/duration/timestamps/per-path errors recorded | COVERED-BOTH | `tests/scanRunRepository.test.ts:42` (byte-for-byte round-trip incl. a multi-entry errors array), `tests/scanner.integration.test.ts:464` (a real EACCES persisted end-to-end), `e2e/features/scanning-settings/metrics-panel.feature:65` (persisted data reaches the UI after a reload) |
| 2.10c | "Most recent scan run retrievable" (`GET /api/scan/last`) | COVERED-BOTH | `tests/scanRoutes.test.ts:38-90` (4 tests: 404-when-empty, agrees with POST response, reflects the second of two scans, full field-list/type shape), `e2e/features/scanning-settings/metrics-panel.feature:65` |
| 2.11 | Scanning strictly read-only | NONE | No regression test proves this; true only by code inspection |

## §3 Scan Settings

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 3.1 | Exclude Samples default-on, case-insensitive | COVERED-BOTH | `tests/ignoreRules.test.ts:35,41`, `e2e/features/scanning-settings/scan-settings.feature:7` |
| 3.2 | Exclude Backup default-on, case-insensitive | COVERED-BOTH | `tests/ignoreRules.test.ts:19,30`, `e2e/features/scanning-settings/scan-settings.feature:22` |
| 3.3 | Both toggles persist across restart, next-scan-only | COVERED-BOTH | `tests/scanSettings.test.ts:34`, `e2e/features/scanning-settings/scan-settings.feature` |
| 3.4 | Duplicate detection reads Samples live regardless of exclusion setting | COVERED-UNIT | `tests/duplicateDetector.test.ts:44` — structural proof only: the function never reads the setting at all, not proven by flipping the setting live |

## §4 Scan Exclusions

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 4.1 | Excluded folder + contents not descended into | COVERED-BOTH | `tests/scanner.integration.test.ts:184`, `e2e/features/scanning-settings/exclusion-toggles.feature` |
| 4.2 | Excluding parent auto-un-excludes/greys descendants | NONE | Logic exists (`ScanFolderPanel.tsx`'s `isDescendantOrSelf`) but never tested at any layer |
| 4.3 | Relative-path exclusions persist, applied next scan | COVERED-BOTH | `tests/scanExclusionRepository.test.ts:22,27`, `e2e/features/scanning-settings/exclusion-toggles.feature` |
| 4.4 | Changing music root clears saved exclusions | COVERED-UNIT | `tests/musicRoot.test.ts:54`; explicitly out-of-scope for e2e per `root-path-control.feature`'s own header comment |

## §5 Project Folders View

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 5.1 | Columns (checkbox/name/Type/Status/Tags/Score/Audio Files count/Media/Reveal) | PARTIAL | checkbox/name/Status/Tags/Score COVERED-E2E (`e2e/features/projects-tab/filtering.feature:17-59`, `batch-edit.feature:37-45`); Type column text/tooltip NONE; Audio Files count + Media column NONE; Reveal action NONE (see 5.4) |
| 5.2 | Type column DAW label/tooltip | NONE | — |
| 5.3 | Row click opens panel; same-row click closes it | PARTIAL | opens COVERED-E2E (`detail-panel-status-tags-score.feature:18-22`); click-again-to-close NONE (only explicit close button ever used) |
| 5.4 | Reveal in Finder | PARTIAL | server-side guard COVERED-UNIT (`tests/finderService.test.ts:22-40`, `tests/revealRoute.test.ts:50-69`); UI action itself NONE |

## §6 Audio Files View

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 6.1 | Columns (checkbox/play+filename/Status/Tags/Project/Score/Location+tooltip/Modified) | PARTIAL | play/Status/Tags/Score COVERED-E2E; Modified/Location as sort targets COVERED-E2E (`sorting.feature:50-77`); Project column display NONE; Location tooltip/truncation NONE |
| 6.2 | Row click opens panel, excluding play/checkbox | PARTIAL | row-click-opens and play-doesn't-open both COVERED-E2E; checkbox-doesn't-open NONE |
| 6.3 | Metrics tile (total/Draft/unscored/change counts) | COVERED-BOTH | `tests/audioFileRepository.test.ts:131-158` (the total/Draft/unscored aggregate), `e2e/features/scanning-settings/metrics-panel.feature:65` (a real triggered scan's exact `+1 changed` count, persisted via `GET /api/scan/last`, appears correctly in the Metrics panel after a reload — closes the prior UI-layer gap) |

## §7 Filtering & Sorting

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 7.1 | Debounced search/status/score(incl. Unscored)/tags filter × 2 tabs (8 sub-clauses) | COVERED-E2E (all 8) | `e2e/features/{projects-tab,files-tab}/filtering.feature:17-48` both tabs — spot-checked directly during this consolidation, confirms search/status/score/unscored/tags/combined-filter/clear-all all present in both tabs |
| 7.2 | Files Name/Location/Modified sort; Projects Modified toggle | COVERED-E2E | `sorting.feature` both tabs |
| 7.3 | Projects "Modified" sorts by `contentModifiedAt` not raw mtime | COVERED-BOTH | `tests/projectRepository.test.ts:143-153`, `sorting.feature:14-23` — spot-checked directly, confirms explicit ascending/descending sort assertion using stamped `contentModifiedAt` fixture values |
| 7.4 | Filter/search change resets pagination to page 1 | **COVERED-BOTH** (updated — was NONE at time of Task 9.2's audit) | Closed by Task 9-follow-up-4: `tests/hooks/test/{useAudioFiles,useProjects}.test.ts`'s `updateFilters` reset test (pre-existing, from the frontend unit-test initiative's hooks task) + `frontend/src/test/App.pagination.test.tsx`'s real-UI proof that a filter change through the actual search box resets the visible page indicator |
| 7.5 | "Clear (N)" control appears only when filter active | PARTIAL + REQUIREMENT-SUSPECT | clear-effect COVERED-E2E; count-in-label/conditional-visibility NONE; **suspect**: `FilterToolbar.tsx:200-211` always renders "Clear" with no count, merely `disabled`, not conditionally shown as the requirement implies |
| 7.6 | "N of Total" result count shown | PARTIAL | presence/format COVERED-E2E (`common.steps.ts:47-59`); tracks-filtered-count-correctly not independently proven |
| 7.7 | Page auto-clamps when filtered results shrink | **COVERED-UNIT** (updated — was NONE at time of Task 9.2's audit) | Closed by Task 9-follow-up-4: `useAudioFiles.test.ts`/`useProjects.test.ts` prove the clamp fires (and refetches at the clamped page) on a refetch/rescan shrink, AND prove via a negative control that a filter-change shrink can never trigger it — `updateFilters`'s own synchronous `page: 1` reset structurally preempts the clamp path. `docs/REQUIREMENTS.md` §7.7 reworded to drop the unreachable "filter change" trigger from its wording |

## §8 Detail Panels

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 8.1 | Slide-in panel, dismiss via close/Escape/backdrop, auto-focus close | PARTIAL | animation NOT-HEADLESS-VERIFIABLE; close-button COVERED-E2E; Escape-dismiss NONE (Escape only used for filter dropdowns); backdrop-click-dismiss NONE; auto-focus NONE |
| 8.2 | Status/Score/Tags edit mechanics, "Saving…" indicator, optimistic rollback | PARTIAL | status/score-set, tags-add-via-Enter, tags-remove COVERED-E2E (spot-checked directly, `e2e/features/files-tab/detail-panel-status-tags-score.feature:24-84`); score-click-again-to-clear NONE; tags-add-via-blur NONE; "Saving…"/rollback-on-failure NONE |
| 8.3 | DAW badge/"Detected via"/duplicate-warning block/nested-DAW list/folder tree | NONE (UI) / WRONG-LAYER | no panel-display assertions anywhere; underlying logic well-covered elsewhere (`tests/dawDetector.test.ts`, `tests/duplicateDetector.test.ts`) but wrong layer for this requirement |
| 8.4 | File size, full path, "Reveal file/project in Finder" | NONE | Only the panel heading text is ever asserted |

## §9 Batch Operations

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 9.1 | Multi-select + select-all; selection clears on filter/page/tab change | **COVERED-BOTH** (updated — was PARTIAL at time of Task 9.2's audit) | checkboxes/select-all/clear-on-filter/clear-on-tab COVERED-E2E (unchanged); clear-on-page-change closed by Task 9-follow-up-4's `frontend/src/test/App.pagination.test.tsx` — a one-time, user-approved narrow exception to the `App.tsx` unit-test exclusion, since selection state lives entirely there and e2e can't reach page 2 without 51+ new same-prefix fixtures. Also found (not fixed) a real, likely-oversight sibling bug: sort-change resets the page but doesn't clear selection, unlike every other page-resetting handler — `docs/TODO.md` item 21 |
| 9.2 | Batch Edit gated at 2+; set-score overwrite; add-tag union | COVERED-E2E | `batch-edit.feature` both tabs — spot-checked directly, confirms gating, overwrite, and union semantics all asserted |
| 9.3 | Batch score AND tag edits on Projects cascade to files | **COVERED-BOTH** (updated — was PARTIAL at time of Task 9.2's audit) | Closed by Task 9-follow-up-3: `tests/batchTagCascadeRoute.test.ts` (13 tests) proves the tag-cascade at the HTTP route layer for the first time — cascade reaches all selected projects' files, no-leak to unselected, union-not-replace, soft-removed-file exclusion. Along the way, found the score-cascade sibling wasn't actually proven at the HTTP layer either (only e2e) — also closed, plus a real bug: both `PATCH /{projects,files}/batch/tags` 500'd and rolled back the whole batch on any unknown id (FK violation), fixed with a `filterExistingProjectIds`/`filterExistingFileIds` existence-check applied to all 4 batch routes. New e2e scenario (`projects-tab/batch-edit.feature`) additionally proves the tag-cascade through the real UI onto the Audio Files tab — previously untested (the existing tag scenario only asserted the Projects table) |
| 9.4 | Batch edits on Files re-sync each affected project across multiple projects | COVERED-E2E | `e2e/features/files-tab/batch-edit-cascade.feature:46-115` — spot-checked directly, confirms `syncProjectsForFiles`'s dedupe-by-distinct-project loop for both score and tag cascades |

## §10 Duplicate Detection

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 10.1 | `GET /api/projects/:id/duplicates` route itself | WRONG-LAYER | No `duplicat*` hits in `e2e/features/`; route (`src/api/routes/projects.ts:214`) has zero test coverage at any layer, only underlying pure functions unit-tested |
| 10.2a | (filename,size) pair matching | COVERED-UNIT | `tests/duplicateDetector.test.ts:101,155` |
| 10.2b | filename matching case-insensitive | PARTIAL | implemented (`sampleKey` lowercases) but no test uses actually-different-case filenames |
| 10.2c | Samples search any-depth; top-level-only "Imported" exclusion | COVERED-UNIT | `tests/duplicateDetector.test.ts:71,79` |
| 10.3 | >=3 matches AND ratio >=0.6 threshold | COVERED-UNIT | `tests/duplicateDetector.test.ts:120,131` — spot-checked directly, confirms both the too-few-matches and below-ratio-threshold negative cases |
| 10.4 | Plain folder never candidate/target; ancestor/descendant excluded | COVERED-UNIT | `tests/duplicateDetector.test.ts:236,204` |
| 10.5a | Excludes different-DAW candidates | COVERED-UNIT | `tests/duplicateDetector.test.ts:225` |
| 10.5b | Excludes scan-excluded candidates (§4) | NONE | Filter only implemented in the untested route (10.1), not in unit-tested functions |
| 10.6 | Sorted by descending match ratio | COVERED-UNIT | `tests/duplicateDetector.test.ts:178` |
| 10.6b | UI display (name/path/count/overlap%) | NONE / WRONG-LAYER | Same as 10.1, no e2e proof the Project-detail-panel duplicate-warning block (§8.3) ever renders |

## §11 Playback

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 11.1 | Play starts/pauses same file; switching files switches playback | PARTIAL | start+switch COVERED-E2E (`audio-player.feature:23-31`); same-file pause-on-second-click NONE |
| 11.2 | Filename/relative path/play-pause/stop/seek slider/elapsed-total time/close | PARTIAL | filename, stop-resets-time, close-hides-bar COVERED-E2E; relative path text, play/pause icon state, seek slider, elapsed/total time deliberately excluded (feature file's own doc comment) — NONE |
| 11.3 | Server-side Range streaming; inline playback/format error | **COVERED-UNIT** (updated — was NONE at time of Task 9.2's audit) | Closed and hardened by Task 9.4: `tests/audioStreamRoute.test.ts` (7 tests — legitimate stream, Range support, relative-traversal id, absolute-path id, id+query-string trick, DB-path-outside-root repro, symlink-inside-root-pointing-outside repro) |
| 11.4 | Bottom padding while player bar visible | NOT-HEADLESS-VERIFIABLE | — |
| 11.5 | Streaming endpoint only serves DB-stored path, not arbitrary request paths | **COVERED-UNIT** (updated — was NONE at time of Task 9.2's audit) | Closed and hardened by Task 9.4 (same `tests/audioStreamRoute.test.ts` suite). Fix: `GET /:id/audio` (`src/api/routes/files.ts`) now calls shared `isWithinRoot(file.path, getEffectiveMusicRoot(db))` (exported from `src/services/FinderService.ts`, `fs.realpathSync`-based, symlink-safe, fails closed) before streaming; both id-miss and path-outside-root failure modes return an identical `404`. Escalated and re-verified after a symlink-based bypass was found and closed (Auditor pass, PASS ×2) |

## §12 Score & Tag Linking

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 12.1a | File edit → project recompute score=MAX | COVERED-BOTH | `tests/linkSync.test.ts:65`, `e2e/features/files-tab/detail-panel-status-tags-score.feature:103` — spot-checked directly, both citations confirmed exact |
| 12.1b | File edit → project recompute tags=union, drop-when-orphaned | COVERED-BOTH | `tests/linkSync.test.ts:76,95`, same e2e scenario |
| 12.1c | Recompute scoped to that project's files only | COVERED-UNIT | `tests/linkSync.test.ts:111` |
| 12.2a | Project edit → cascade score overwrites files | COVERED-BOTH | `tests/linkSync.test.ts:124`, `e2e/features/projects-tab/detail-panel-status-tags-score.feature:86` |
| 12.2b | Project edit → cascade tags union (not replace) | COVERED-BOTH | `tests/linkSync.test.ts:154`, same e2e scenario |
| 12.3 | Two directions independent/one-way, no ping-pong | NONE | Structural claim (verified by code read — `linkSync.ts`'s two exports don't call each other) but no regression test |
| 12.4 | New file mid-scan inherits project's existing score/tags | COVERED-UNIT | `tests/scanner.integration.test.ts:118`, `tests/linkSync.test.ts:173,184`; no e2e coverage |

## §13 Settings & Configuration

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 13.1 | Music root override: text field/native picker, validated, persisted | PARTIAL | text-field validate/save/cancel COVERED-E2E (`root-path-control.feature:66-97`); must-exist/must-be-dir/persistence COVERED-UNIT (`tests/musicRoot.test.ts:43-52,36-41`); native "Browse…" picker NONE, effectively NOT-HEADLESS-VERIFIABLE (opens a real native dialog Playwright can't see) |
| 13.2 | Per-folder include/exclude panel + trigger scan from it | COVERED-E2E | `exclusion-toggles.feature:46-115` |
| 13.3 | Settings panel toggles with "Saving…"/"Saved"/"Failed" feedback | PARTIAL | toggle mechanics + "Saved" COVERED-E2E; "Saving…"/"Failed" states NONE |
| 13.4 | Reveal-in-Finder refused server-side for outside-root paths | COVERED-UNIT | `tests/revealRoute.test.ts:50-69`, `tests/finderService.test.ts:22-40`; no e2e from the actual UI button |

## §14 Theming

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 14.1 | Dark/light toggle, header button, localStorage persistence, no-flash | PARTIAL | toggle+persist+reload-both-directions COVERED-E2E (`theme-toggle.feature:3-19`); no-flash-before-paint claim NOT-HEADLESS-VERIFIABLE / functionally NONE (no paint-timing test attempted) |
| 14.2 | All interactive components have distinct dark/light color treatments | NOT-HEADLESS-VERIFIABLE | — |

---

## Spot-check results (Task 9.3)

10 citations were opened and independently verified during this consolidation (not a re-audit of
every row — that was the two Testers' job — but a sanity check on a sample weighted toward
multi-clause requirements where a shortcut verdict would be most likely):

1. §2.4d `tests/dawDetector.test.ts:95` — confirmed: test title is literally "prefers a
   project-file classification over a marker-subfolder classification when both are present
   (priority-collision case, §2.4)" and asserts exactly that. **This also confirms
   `REQUIREMENTS.md` Appendix C's existing claim that this case is untested is stale** (see
   Appendix C refresh below).
2. §11.3/§11.5 `tests/audioStreamRoute.test.ts` — confirmed: 7 `it()` blocks present, matching
   the described legitimate-stream/Range/traversal-id/absolute-id/query-trick/DB-path-outside-root/symlink-bypass coverage exactly.
3. §7.1 `e2e/features/{projects-tab,files-tab}/filtering.feature` — confirmed: both files
   contain all 8 described scenarios (search, status, score, Unscored, tags, combined
   status+tag, clear-all) with matching Background fixtures.
4. §8.2 `e2e/features/files-tab/detail-panel-status-tags-score.feature` — confirmed: status-set
   (line 24), score-set (line 33), tags-add-via-Enter + via-suggestion (line 62-84) all present;
   confirmed the claimed gaps (score-clear, tags-via-blur, "Saving…"/rollback) are genuinely
   absent from this file.
5. §12.1a/§12.1b `tests/linkSync.test.ts:65,76,95,111` + e2e line 103 — confirmed exact line
   numbers via `grep -n "it("`; all 4 cited lines match their described test titles precisely.
6. §9.4 `e2e/features/files-tab/batch-edit-cascade.feature:46-115` — confirmed: all 3 scenarios
   (batch score cascade across 2 projects, live-recompute fallback, batch tag cascade) present
   and match the described dedupe-loop proof.
7. §1.4 `tests/score.test.ts:5,10` — confirmed: line 5 is `isValidScore` null/1-5 acceptance,
   line 10 is out-of-range/non-integer rejection.
8. §10.3 `tests/duplicateDetector.test.ts:120,131` — confirmed: line 120 is the too-few-matches
   negative case, line 131 is the below-ratio-threshold negative case.
9. §7.3 `tests/projectRepository.test.ts:143-153` + `sorting.feature:14-23` — confirmed: unit
   test explicitly sorts by `contentModifiedAt` (not raw mtime) with stamped fixture timestamps,
   ascending and descending; e2e scenario matches with 3 fixtures stamped by `globalSetup.ts`.
10. Backend baseline itself — ran `npx vitest run --reporter=basic`: confirmed **21 test files,
    181 tests, all passing**, matching the number both Testers and Task 9.4 converged on.

**Result: all 10 held up exactly as cited — no discrepancies found requiring a correction to any
row above.**
