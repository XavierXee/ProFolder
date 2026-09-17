# Test Coverage Audit — `docs/REQUIREMENTS.md` §1–§15 vs. `e2e/features/**` + `tests/**`

*Task 9 of `docs/TODO.md` item 1. Produced by cross-referencing every requirement clause in
`docs/REQUIREMENTS.md` against the current test corpus. Methodology: split across two Tester
passes — Task 9.1 covered the backend/data-layer sections (§1, §2, §3, §4, §10, §12), Task 9.2
covered the frontend/UI sections (§5, §6, §7, §8, §9, §11, §13, §14) — then consolidated here
(Task 9.3). A separate, already-fully-gated Task 9.4 (Developer/Tester/Reviewer/Auditor cycle)
closed one real gap this audit surfaced along the way (§11.3/§11.5, see below); its result is
folded into this document rather than re-run. §15 (Custom Tabs) was added by a later, separate
dev-loop cycle after Task 9 concluded — it is not part of the Task 9 audit's methodology,
baseline counts, or "113 individual clauses" figure below; see its own section for citations.*

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

**Known blind spot in the original Task 9.1/9.2 audit:** six separate later follow-up cycles
(TODO items 2, 4, 8, 9, 10, and 11 — duplicate-detection route, pagination, detail-panel
interaction feedback, detail-panel read-only display, table column/row-interaction, and small
backend validation/logic gaps respectively) each independently found the same class of
staleness: a row's original NONE/PARTIAL verdict had been
reached by checking e2e coverage only, without cross-checking
whether unit-layer (`tests/**`/`frontend/src/**/test/**`) coverage had already closed the same
clause from an earlier initiative. Rows already re-touched by items 2/4/5/7/8/9/10/11's cycles
(noted in the changelog line below) have been corrected. Any row **not yet re-touched** by one of those
cycles may still carry this same blind spot — treat its NONE/PARTIAL verdict as a starting point
to verify against the current test corpus, not as settled fact, before scoping a follow-up item
around it.

## Summary counts (87 rows)

| Verdict | Count |
|---|---|
| COVERED-UNIT | 41 |
| COVERED-BOTH | 24 |
| COVERED-E2E | 5 |
| PARTIAL | 9 |
| WRONG-LAYER (primary) | 1 (+1 more row carries it as a secondary/dual verdict — 10.6b) |
| NONE | 5 |
| NOT-HEADLESS-VERIFIABLE | 2 |
| **Total rows** | **87** |

Fully covered (COVERED-UNIT + COVERED-BOTH + COVERED-E2E) = 70/87 rows (80%). Rows with a real,
actionable gap (PARTIAL + WRONG-LAYER + NONE) = 15/87 (17%). The remaining 2 rows
(NOT-HEADLESS-VERIFIABLE) are a permanent environment limitation, not an actionable gap.
(Updated by item 5's cycle: §2.1b, §2.10b, §2.10c moved from NONE, and §6.3 from WRONG-LAYER/COVERED-UNIT, to fully covered. Updated by item 7's cycle: §1.7b, §2.9 moved from NONE to COVERED-UNIT. Updated by item 8's cycle: §8.2 and §13.3 moved from PARTIAL to COVERED-BOTH; §8.1 stays PARTIAL only for its permanent NOT-HEADLESS-VERIFIABLE animation clause. Updated by item 9's cycle: §8.3 and §8.4 moved from NONE/WRONG-LAYER to COVERED-UNIT. Updated by item 10's cycle: §5.1-§5.4 and §6.2 moved to COVERED-UNIT/COVERED-BOTH (§5.3's requirement text also reworded per user decision); §6.1 stays PARTIAL only for its permanent NOT-HEADLESS-VERIFIABLE truncation clause. Updated by item 11's cycle: §1.3b, §1.5b, §4.2, §12.3 all moved from NONE to COVERED-UNIT. Updated by item 12's cycle: §7.5 moved from PARTIAL+REQUIREMENT-SUSPECT to COVERED-BOTH (requirement text reworded per user decision). Updated by item 14's cycle: §7.6 and §11.1 moved from PARTIAL to COVERED-BOTH — see `docs/TODO.md`'s Task 9 follow-up items 5/6/7/8/9/10/11/12/14 closure notes. Updated by the ProFolder branding/theming/splash-screen cycle (item 9 in the main TODO list, not to be confused with the "Task 9 follow-ups" section): §14.1 reworded for the new 3-way dropdown mechanism (still PARTIAL, same no-flash-paint-timing gap as before); §14.2 reworded to note the chrome-vs-content-area brand-coverage boundary; new §14.3 (splash screen) and §14.4 (logo/favicon/title) added as COVERED-UNIT.)

---

## §1 Data Model

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 1.1 | Project field set | COVERED-UNIT | `tests/scanner.integration.test.ts:51`, `:208` |
| 1.2 | AudioFile field set | COVERED-UNIT | `tests/audioFileRepository.test.ts:52`, `tests/scanner.integration.test.ts:51` |
| 1.3a | Status settable/persisted (both entities) | COVERED-BOTH | `e2e/features/projects-tab/detail-panel-status-tags-score.feature:24`, `e2e/features/files-tab/detail-panel-status-tags-score.feature:25` |
| 1.3b | Runtime enforcement that status is only the 5 valid values | COVERED-UNIT | `tests/batchRoutes.test.ts` — new tests assert `PATCH /api/files/:id/status` and `PATCH /api/projects/:id/status` both return 400 with the exact error message for an invalid value, proving both routes' separately-defined guards |
| 1.4 | Score null or 1-5 int, both entities | COVERED-UNIT | `tests/score.test.ts:5,10`, `tests/batchRoutes.test.ts:94` |
| 1.5a | Tags trimmed/deduped/many-to-many | COVERED-UNIT | `tests/projectRepository.test.ts:178,162` |
| 1.5b | Tags case-insensitive dedup specifically | COVERED-UNIT | New `tests/tagRepository.test.ts` — `findOrCreateTag` returns the same id across casings, a direct `SELECT COUNT(*) FROM tags` proves exactly one row (not just one array entry), and `addTagsToFiles` with both casings in one call confirms the dedup survives the attachment layer |
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
| 4.2 | Excluding parent auto-un-excludes/greys descendants | COVERED-UNIT | Corrects a stale prior verdict — already covered by an earlier initiative (Task 7): `ScanFolderPanel.test.tsx`'s "descendant pruning" block proves multi-level-deep auto-un-exclusion, and the "direct rendering" block proves a descendant checkbox is `disabled` when its parent is excluded (the DOM-testable half of "greyed"); visual dimming itself stays NOT-HEADLESS-VERIFIABLE |
| 4.3 | Relative-path exclusions persist, applied next scan | COVERED-BOTH | `tests/scanExclusionRepository.test.ts:22,27`, `e2e/features/scanning-settings/exclusion-toggles.feature` |
| 4.4 | Changing music root clears saved exclusions | COVERED-UNIT | `tests/musicRoot.test.ts:54`; explicitly out-of-scope for e2e per `root-path-control.feature`'s own header comment |

## §5 Project Folders View

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 5.1 | Columns (checkbox/name/Type/Status/Tags/Score/Audio Files count/Media/Reveal) | COVERED-BOTH | Corrects a stale prior verdict (Task 9 follow-up #10 found the Type/count/Media/Reveal sub-columns were already covered before that cycle): checkbox/name/Status/Tags/Score COVERED-E2E (`e2e/features/projects-tab/filtering.feature:17-59`, `batch-edit.feature:37-45`); Type column text/tooltip COVERED-UNIT (`ProjectsTable.test.tsx`'s `typeLabel`/`typeTooltip` block); Audio Files count COVERED-UNIT (per-project distinct counts asserted); Media column COVERED-UNIT (video/image/neither cases); Reveal action COVERED-UNIT (see 5.4) |
| 5.2 | Type column DAW label/tooltip | COVERED-UNIT | Corrects a stale prior verdict, already covered before Task 9 follow-up #10: `ProjectsTable.test.tsx`'s `typeLabel`/`typeTooltip` block (3 tests — DAW label+tooltip, missing-`detectedVia` fallback, "Folder" fallback) |
| 5.3 | Row click opens panel; clicking outside the panel, or its close button, closes it | COVERED-BOTH | opens COVERED-E2E (`detail-panel-status-tags-score.feature:18-22`); dismiss COVERED-UNIT (`ProjectDetailPanel.test.tsx`'s backdrop-click-dismiss and close-button tests). **Requirement reworded** by Task 9 follow-up #10 (user decision): the original "same-row click closes it" wording described a code path (`App.tsx`'s `handleProjectRowClick` toggle) confirmed unreachable via real mouse interaction — `ProjectDetailPanel`'s full-viewport backdrop intercepts a second click before it reaches the row (live-repro confirmed, not landed). Actual dismiss behavior (outside-click/close-button) was already covered pre-cycle. |
| 5.4 | Reveal in Finder | COVERED-UNIT | Corrects a stale prior verdict (Task 9 follow-up #10 closed the remaining UI-action gap): server-side guard COVERED-UNIT (`tests/finderService.test.ts:22-40`, `tests/revealRoute.test.ts:50-69`); UI action itself COVERED-UNIT (`ProjectsTable.test.tsx`'s "Reveal in Finder" test — calls `onReveal` with path, stops propagation to `onRowClick`) — already covered before this cycle, verdict was stale |

## §6 Audio Files View

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 6.1 | Columns (checkbox/play+filename/Status/Tags/Project/Score/Location+tooltip/Modified) | PARTIAL | Corrects a stale prior verdict (Task 9 follow-up #10 found the Project-column and tooltip sub-clauses were already/now covered): play/Status/Tags/Score COVERED-E2E; Modified/Location as sort targets COVERED-E2E (`sorting.feature:50-77`); Project column display COVERED-UNIT (`FileRow.test.tsx`, `projectId` rendered + "—" fallback, already covered pre-cycle); Location tooltip COVERED-UNIT (`FileRow.test.tsx`, new — `title={file.path}` asserted on the location element); truncation itself stays NOT-HEADLESS-VERIFIABLE (permanent, a CSS/visual claim), the only reason this row isn't fully covered |
| 6.2 | Row click opens panel, excluding play/checkbox | COVERED-BOTH | Corrects a stale prior verdict (Task 9 follow-up #10 closed the remaining gap): row-click-opens and play-doesn't-open both COVERED-E2E; checkbox-doesn't-open now COVERED-UNIT (`FileRow.test.tsx`, new — checkbox click does not fire the row's `onClick`) |
| 6.3 | Metrics tile (total/Draft/unscored/change counts) | COVERED-BOTH | `tests/audioFileRepository.test.ts:131-158` (the total/Draft/unscored aggregate), `e2e/features/scanning-settings/metrics-panel.feature:65` (a real triggered scan's exact `+1 changed` count, persisted via `GET /api/scan/last`, appears correctly in the Metrics panel after a reload — closes the prior UI-layer gap) |

## §7 Filtering & Sorting

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 7.1 | Debounced search/status/score(incl. Unscored)/tags filter × 2 tabs (8 sub-clauses) | COVERED-E2E (all 8) | `e2e/features/{projects-tab,files-tab}/filtering.feature:17-48` both tabs — spot-checked directly during this consolidation, confirms search/status/score/unscored/tags/combined-filter/clear-all all present in both tabs |
| 7.2 | Files/Projects Name/Score/Modified column-header sort (Files also Location) | COVERED-BOTH | Backend score-sort: `tests/audioFileRepository.test.ts`, `tests/projectRepository.test.ts`. Frontend column-header sort UI (click-to-sort, ascending/descending toggle, `aria-sort`/`aria-label="Sort by <Column>"`): `frontend/src/components/test/FileTable.test.tsx`, `ProjectsTable.test.tsx`. E2e: `e2e/features/files-tab/sorting.feature` (8 scenarios), `e2e/features/projects-tab/sorting.feature` (6 scenarios) |
| 7.3 | Projects "Modified" sorts by `contentModifiedAt` not raw mtime | COVERED-BOTH | `tests/projectRepository.test.ts:143-153`, `sorting.feature:14-23` — spot-checked directly, confirms explicit ascending/descending sort assertion using stamped `contentModifiedAt` fixture values |
| 7.4 | Filter/search change resets pagination to page 1 | **COVERED-BOTH** (updated — was NONE at time of Task 9.2's audit) | Closed by Task 9-follow-up-4: `tests/hooks/test/{useAudioFiles,useProjects}.test.ts`'s `updateFilters` reset test (pre-existing, from the frontend unit-test initiative's hooks task) + `frontend/src/test/App.pagination.test.tsx`'s real-UI proof that a filter change through the actual search box resets the visible page indicator |
| 7.5 | "Clear" control (always visible, disabled when inactive) resets all filter/sort state | COVERED-BOTH | clear-effect COVERED-E2E; disabled-when-no-active-filters and enabled-with-active-filters both COVERED-UNIT (`FilterToolbar.test.tsx`'s "Clear button disabled state" block). **Requirement reworded** by Task 9 follow-up item 12 (user decision): the original "Clear (N)" / conditionally-appearing wording didn't match `FilterToolbar.tsx:200-211`'s actual always-visible, no-count, merely-`disabled` button — reworded to match actual behavior rather than changing the code |
| 7.6 | "N of Total" result count shown | COVERED-BOTH | presence/format COVERED-E2E (`common.steps.ts:47-59`); tracks-filtered-count-correctly now proven at both layers — hook-level (`useAudioFiles.test.ts`/`useProjects.test.ts`: `total` updates to a genuinely new value, including a zero-total case, across `updateFilters`, not a stale one) and e2e (`files-tab/filtering.feature`/`projects-tab/filtering.feature`: exact post-filter text "1 of 1 files"/"1 of 1 projects" asserted after narrowing the result set) |
| 7.7 | Page auto-clamps when filtered results shrink | **COVERED-UNIT** (updated — was NONE at time of Task 9.2's audit) | Closed by Task 9-follow-up-4: `useAudioFiles.test.ts`/`useProjects.test.ts` prove the clamp fires (and refetches at the clamped page) on a refetch/rescan shrink, AND prove via a negative control that a filter-change shrink can never trigger it — `updateFilters`'s own synchronous `page: 1` reset structurally preempts the clamp path. `docs/REQUIREMENTS.md` §7.7 reworded to drop the unreachable "filter change" trigger from its wording |

## §8 Detail Panels

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 8.1 | Slide-in panel, dismiss via close/Escape/backdrop, auto-focus close | PARTIAL | animation NOT-HEADLESS-VERIFIABLE (permanent); close-button COVERED-E2E; Escape-dismiss COVERED-UNIT (`FileDetailPanel.test.tsx:108-118`, `ProjectDetailPanel.test.tsx`) — corrects a stale prior verdict, this was already covered before Task 9 follow-up #8; backdrop-click-dismiss COVERED-UNIT (`FileDetailPanel.test.tsx`, `ProjectDetailPanel.test.tsx`, new); auto-focus COVERED-UNIT (same files, new — asserts the real 50ms `setTimeout` focus effect) |
| 8.2 | Status/Score/Tags edit mechanics, "Saving…" indicator, optimistic rollback | COVERED-BOTH | status/score-set, tags-add-via-Enter, tags-remove COVERED-E2E (`e2e/features/files-tab/detail-panel-status-tags-score.feature:24-84`); score-click-again-to-clear COVERED-UNIT (`ScoreEditor.test.tsx:26-34`) — corrects a stale prior verdict, already covered; tags-add-via-blur COVERED-UNIT (`TagEditor.test.tsx`, new); "Saving…" indicator COVERED-UNIT (`FileDetailPanel.test.tsx`, `ProjectDetailPanel.test.tsx`, new, ×3 fields each); rollback-on-failure COVERED-UNIT (`FileDetailPanel.test.tsx`, `ProjectDetailPanel.test.tsx`) — corrects a stale prior verdict, already covered |
| 8.3 | DAW badge/"Detected via"/duplicate-warning block/nested-DAW list/folder tree | COVERED-UNIT | Corrects a stale prior verdict (Task 9 follow-up #9 found 4 of 5 sub-elements were already covered before that cycle): DAW badge + "Detected via" note (`ProjectDetailPanel.test.tsx` "basic rendering" block), duplicate-warning block (same file, "duplicates banner" block, closed by item 2), nested-DAW project files list (same file, "DAW project files list" block) were all pre-existing; folder tree — genuinely closed by follow-up #9's new "folder content tree" block, proving depth-based default-expand/collapse and the toggle, not just static text |
| 8.4 | File size, full path, "Reveal file/project in Finder" | COVERED-UNIT | Corrects a stale prior verdict (Task 9 follow-up #9 found file size, relative path, and both reveal actions were already covered before that cycle, via `FileDetailPanel.test.tsx`'s "basic rendering"/`formatBytes`/reveal-action blocks); the full absolute path (`file.path`) was the one genuine gap, closed by follow-up #9's extension to the "basic rendering" test |

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
| 11.1 | Play starts/pauses same file; switching files switches playback | COVERED-BOTH | start+switch COVERED-E2E (`audio-player.feature:23-31`); same-file pause-on-second-click COVERED-UNIT (new `frontend/src/test/App.audioPlayer.test.tsx` — App-level test, since the toggle decision lives in `App.tsx`'s `handlePlayClick`, unreachable from any single component; a real e2e proof was deliberately rejected since the fixture WAVs' real ~0.5ms duration makes a second real click race `onEnded`, whereas jsdom never fires it unless dispatched, making the App-level test the correct, deterministic layer) |
| 11.2 | Filename/relative path/play-pause/stop/seek slider/elapsed-total time/close | PARTIAL | filename, stop-resets-time, close-hides-bar COVERED-E2E; relative path text, play/pause icon state, seek slider, elapsed/total time deliberately excluded (feature file's own doc comment) — NONE |
| 11.3 | Server-side Range streaming; inline playback/format error | **COVERED-UNIT** (updated — was NONE at time of Task 9.2's audit) | Closed and hardened by Task 9.4: `tests/audioStreamRoute.test.ts` (7 tests — legitimate stream, Range support, relative-traversal id, absolute-path id, id+query-string trick, DB-path-outside-root repro, symlink-inside-root-pointing-outside repro) |
| 11.4 | Bottom padding while player bar visible | NOT-HEADLESS-VERIFIABLE | — |
| 11.5 | Streaming endpoint only serves DB-stored path, not arbitrary request paths | **COVERED-UNIT** (updated — was NONE at time of Task 9.2's audit) | Closed and hardened by Task 9.4 (same `tests/audioStreamRoute.test.ts` suite). Fix: `GET /:id/audio` (`src/api/routes/files.ts`) now calls shared `isWithinRoot(file.path, getEffectiveMusicRoot(db))` (exported from `src/config/musicRoot.ts` — relocated there from `src/services/FinderService.ts` by Task 9 follow-up item 13's cohesion cleanup; `fs.realpathSync`-based, symlink-safe, fails closed) before streaming; both id-miss and path-outside-root failure modes return an identical `404`. Escalated and re-verified after a symlink-based bypass was found and closed (Auditor pass, PASS ×2) |

## §12 Score & Tag Linking

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 12.1a | File edit → project recompute score=MAX | COVERED-BOTH | `tests/linkSync.test.ts:65`, `e2e/features/files-tab/detail-panel-status-tags-score.feature:103` — spot-checked directly, both citations confirmed exact |
| 12.1b | File edit → project recompute tags=union, drop-when-orphaned | COVERED-BOTH | `tests/linkSync.test.ts:76,95`, same e2e scenario |
| 12.1c | Recompute scoped to that project's files only | COVERED-UNIT | `tests/linkSync.test.ts:111` |
| 12.2a | Project edit → cascade score overwrites files | COVERED-BOTH | `tests/linkSync.test.ts:124`, `e2e/features/projects-tab/detail-panel-status-tags-score.feature:86` |
| 12.2b | Project edit → cascade tags union (not replace) | COVERED-BOTH | `tests/linkSync.test.ts:154`, same e2e scenario |
| 12.3 | Two directions independent/one-way, no ping-pong | COVERED-UNIT | `tests/linkSync.test.ts` — new HTTP-route-level tests prove a sibling file's score/tags are untouched by patching another file (file→project direction doesn't cascade back), and a project's own score doesn't drift after a project→file cascade; the property lives in route wiring (which `linkSync.ts` function each handler calls), so these go through real routes rather than calling `linkSync.ts` directly |
| 12.4 | New file mid-scan inherits project's existing score/tags | COVERED-UNIT | `tests/scanner.integration.test.ts:118`, `tests/linkSync.test.ts:173,184`; no e2e coverage |

## §13 Settings & Configuration

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 13.1 | Music root override: text field/native picker, validated, persisted | PARTIAL | text-field validate/save/cancel COVERED-E2E (`root-path-control.feature:66-97`); must-exist/must-be-dir/persistence COVERED-UNIT (`tests/musicRoot.test.ts:43-52,36-41`); native "Browse…" picker NONE, effectively NOT-HEADLESS-VERIFIABLE (opens a real native dialog Playwright can't see) |
| 13.2 | Per-folder include/exclude panel + trigger scan from it | COVERED-E2E | `exclusion-toggles.feature:46-115` |
| 13.3 | Settings panel toggles with "Saving…"/"Saved"/"Failed" feedback | COVERED-BOTH | toggle mechanics + "Saved" COVERED-E2E; "Saving…"/"Failed" states COVERED-UNIT (`SettingsPanel.test.tsx:144-178`) — corrects a stale prior verdict, this was already covered before Task 9 follow-up #8 confirmed it |
| 13.4 | Reveal-in-Finder refused server-side for outside-root paths | COVERED-UNIT | `tests/revealRoute.test.ts:50-69`, `tests/finderService.test.ts:22-40`; no e2e from the actual UI button |

## §14 Theming

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 14.1 | ProFolder(default)/Light/Dark dropdown, localStorage persistence, no-flash, legacy migration | PARTIAL | select+persist+transition-chain+default+reload-survival COVERED-E2E (`theme-toggle.feature:19-49`); legacy-key migration COVERED-UNIT (`App.theme.test.tsx`); no-flash-before-paint claim NOT-HEADLESS-VERIFIABLE / functionally NONE (no paint-timing test attempted) |
| 14.2 | All interactive components have distinct dark/light color treatments; zero component-level theme-conditional logic, all theming via CSS tokens | PARTIAL: architecture claim (no component holds `isDark`/`isProFolder` branching) COVERED-UNIT via the permanent `isDarkIsProFolderSweep.test.ts` regression test (independently mutation-tested across multiple files, including a comment-adjacency probe); actual rendered color-treatment/contrast claim remains NOT-HEADLESS-VERIFIABLE. Several ProFolder-specific color roles are still interim placeholders reusing Light's values pending a future visual-design pass (documented in `index.css`, not a coverage gap — a known, user-approved open item) |
| 14.3 | Splash screen: 1s, full-viewport, theme-aware background, logo + "Syncing…" | COVERED-UNIT | `SplashScreen.test.tsx` (timing, token-class background, logo accessible label); visual appearance NOT-HEADLESS-VERIFIABLE |
| 14.4 | Logo mark in header + favicon; header/tab title "ProFolder" | COVERED-UNIT | `Logo.test.tsx`, `App.theme.test.tsx` (header/footer text assertions); favicon file existence/reference verified manually, not by an automated test |

## §15 Custom Tabs

*Added after the original Task 9 audit (§1–§14) — §15 didn't exist yet at that time, so it carries
no Task-9-era staleness risk. Coverage below reflects the feature's own dev-loop cycle
(repository/route/component/e2e tasks, plus the later Escape-key-scoping fix), not a
retrospective audit.*

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 15.1 | Custom tab creation: name, type choice, optional Status/Score/Tags pickers | COVERED-BOTH | `tests/customTabsRoute.test.ts` (`POST /api/custom-tabs` validation/persistence, incl. invalid-entry filtering and default-empty-arrays); `CreateCustomTabModal.test.tsx` (name validation, exact submit payload, default type, success/error paths); `e2e/features/custom-tabs/create-and-delete.feature` (create-with-filter and create-with-no-filter scenarios for both types) |
| 15.2 | Status/Score/Tags locked at creation, no edit UI | COVERED-UNIT | No `PATCH`/edit route or UI exists for a custom tab's own filter fields (`src/api/routes/customTabs.ts` only exposes GET/POST/DELETE) — confirmed by absence; `CustomFilesTabPanel.test.tsx`/`CustomProjectsTabPanel.test.tsx`'s "locked filters seed the initial fetch" blocks prove the tab's statuses/scores/tags are read once into the initial fetch and never re-derived from any editable control |
| 15.3 | Search/sort live on top of locked subset; Status/Score/Tags pickers hidden while locked | COVERED-BOTH | pickers-hidden COVERED-UNIT (`CustomFilesTabPanel.test.tsx`/`CustomProjectsTabPanel.test.tsx` "locked pickers are hidden" blocks; `FilterToolbar.tsx`'s own `locked` prop, asserted directly in neither file's dedicated test but exercised here); live-search/live-sort COVERED-BOTH (same two files' "live search"/"live sort" blocks asserting the locked params + new term/sort both reach the API call; `e2e/features/custom-tabs/locked-filtering.feature` "Locked filter controls are hidden but search and sort remain live" and "Typing a search term further narrows the already-locked result set") |
| 15.4 | Search/sort reset to defaults on tab switch-away-and-back (remount, not just cold start) | COVERED-E2E | `e2e/features/custom-tabs/locked-filtering.feature`'s "Switching away from a custom tab and back resets live search and sort" scenario — sets a search term and sort, switches to Project Folders and back, asserts both reset. Not separately unit-tested (the remount mechanics live in `App.tsx`'s conditional-render + `key={custom-${id}}`, which is App-level wiring, not either panel's own logic) |
| 15.5 | Same row interactions as the default tabs: detail panel, status/score/tags edit incl. §12 linking, batch edit, pagination, reveal | COVERED-BOTH | detail panel open/edit + linking COVERED-UNIT (`CustomFilesTabPanel.test.tsx`/`CustomProjectsTabPanel.test.tsx`'s "editing status/tags/score inside the panel" blocks, explicitly asserting which cross-type refresh props fire per field, mirroring §12's file↔project directions); batch edit COVERED-UNIT (same files' "batch edit" blocks); reveal COVERED-UNIT (same files' "reveal" blocks, success + failure-banner); pagination/selection-reset-on-filter-or-page-change COVERED-UNIT (same files' "selection resets on filter/page change" blocks); real-UI walkthrough COVERED-E2E (`e2e/features/custom-tabs/locked-filtering.feature`'s cascade scenario opens a file detail panel inside a custom Files tab, edits its score, and confirms the parent project's score updated on the Project Folders tab) |
| 15.6 | Playback is global/app-level, not per-tab | COVERED-UNIT | `CustomFilesTabPanel.test.tsx`'s "playback pass-through (App-level/global, not local state)" block — `playingFileId`/`isPlaying`/`onPlayClick` are asserted as pure pass-through props with no local play/pause state in the panel; `CustomProjectsTabPanel` has no player wiring at all (Projects rows aren't playable), consistent with playback living once in `App.tsx`. No e2e scenario plays audio while switching between a custom tab and a default tab specifically, but the unit-level pass-through proof plus `App.tsx`'s single `<AudioPlayerBar>` mount (unconditional, outside the tab-switch conditional) make this low-risk |
| 15.7 | "×" delete button + confirmation dialog; deleting the active tab falls back to Project Folders | COVERED-BOTH | dialog mechanics COVERED-UNIT (`DeleteTabConfirmDialog.test.tsx` — renders tabName, Confirm/Cancel call the right callback, Escape/backdrop dismiss, theming); delete-and-fallback COVERED-BOTH (`frontend/src/test/App.customTabs.test.tsx`'s single wiring test drives the full create→switch→delete→confirm→fallback-to-Project-Folders path through real `App.tsx` state; `e2e/features/custom-tabs/create-and-delete.feature`'s "Cancelling the delete confirmation leaves the tab in place" and "Confirming the delete removes the tab and falls back to Project Folders when it was active" scenarios) |

Repository-layer round-trip (JSON-array field encode/decode, creation-order listing, delete
idempotence/non-existent-id) is additionally COVERED-UNIT via `tests/customTabRepository.test.ts`
and doesn't map to a single requirement clause above since it's implementation plumbing underneath
15.1/15.2's persistence, not a distinct user-facing behavior.

---

## §16 Copy, Move & Delete

*Added by the Copy/Move/Delete feature's own dev-loop cycle (`docs/TODO.md` item 5, Tasks 1-12),
after both the original Task 9 audit and the later §15 cycle — carries no staleness risk from
either. Coverage below reflects that feature's own tasks (TrashService/FileOpsService,
single-file DB rekey, project-subtree DB rekey, routes, API client + destination picker,
`CopyMoveDeleteDialog`, wiring into the default and custom detail/batch panels, e2e), not a
retrospective audit.*

| # | Clause | Verdict | Citation |
|---|---|---|---|
| 16.1 | Reachable from the File detail panel, Project detail panel, and batch panel, in both default and custom tabs | COVERED-BOTH | single-item wiring COVERED-UNIT (`FileDetailPanel.test.tsx`'s/`ProjectDetailPanel.test.tsx`'s "Copy/Move/Delete buttons" blocks; default-tab callback plumbing in `frontend/src/test/App.fileOps.test.tsx`'s "App - file operations (Copy/Move/Delete) wiring, Files tab"/"...Projects tab" describe blocks; custom-tab equivalent in `CustomFilesTabPanel.test.tsx`'s/`CustomProjectsTabPanel.test.tsx`'s "Copy/Move/Delete wiring" blocks); batch wiring COVERED-UNIT (`BatchEditPanel.test.tsx`'s "Copy/Move/Delete actions" block; default-tab batch plumbing in `App.fileOps.test.tsx`'s "App - batch Copy/Move/Delete wiring (Task 10)" blocks; custom-tab batch plumbing in `CustomFilesTabPanel.test.tsx`'s/`CustomProjectsTabPanel.test.tsx`'s "batch Copy/Move/Delete wiring" blocks); real-UI walkthrough COVERED-E2E for the default tabs (`e2e/features/file-ops/{copy,move,delete,project-move}.feature`, each driven from a detail panel) and for a custom tab specifically (`e2e/features/file-ops/custom-tab-reachability.feature`, Delete driven from a custom Audio Files tab's own detail panel) |
| 16.2 | Delete moves to macOS Trash (reversible), not permanent deletion | COVERED-BOTH | actual Trash relocation COVERED-UNIT via a real `~/.Trash` filesystem check, not a mock — `tests/trashService.test.ts`'s "actually moves a real file to ~/.Trash and removes it from its original location" and "...a real folder (with a file inside it)..." (lines 236, 253); UI wording COVERED-UNIT (`CopyMoveDeleteDialog.test.tsx`'s `buildExplanationText` "delete, single file, states Trash (not permanent deletion)..." case); app-level removal-from-active-list COVERED-E2E (`e2e/features/file-ops/delete.feature`, `batch-delete.feature`) — the e2e layer confirms the row disappears from the app's own table, not the file's actual `~/.Trash` location (that's the unit-layer citation above) |
| 16.3 | Copy/Move destinations restricted to the configured music root; destination picker only shows in-root folders; backend independently re-validates | COVERED-UNIT | picker itself sources folders from the pre-existing `GET /api/folders/tree` (already root-scoped by construction, not a new containment check introduced by this feature — not re-tested here); this clause's own new coverage is the backend's independent re-validation on every route regardless of what the picker sent: `tests/fileOpsService.test.ts`'s "rejects with PathOutsideRootError when the source/destination is outside the configured root" and "...for a symlink inside root pointing outside it" (both `movePath` and `copyPath`); `tests/fileOpsRoutes.test.ts`'s "returns 400 when destDir resolves outside the configured music root" (copy and move); `tests/projectOpsRoutes.test.ts`'s "400s when the destination is outside the configured music root..." |
| 16.4 | Moving/copying a project folder relocates/duplicates the whole subtree (project + nested sub-projects + all contained files) atomically, preserving status/tags/score, via in-place DB rekey rather than rescan | COVERED-BOTH | DB-rekey mechanics COVERED-UNIT (`tests/subtreeRekey.test.ts` — single project, nested sub-project, three-level-deep nesting, atomicity/rollback-on-collision, and the LIKE-wildcard-hazard proof that a literal prefix match is used, not SQL `LIKE`); route-level COVERED-UNIT (`tests/projectOpsRoutes.test.ts`'s "clones the whole subtree (project + nested sub-project + files), leaving the source untouched" and "physically moves and DB-rekeys the whole subtree, leaving nothing at the old location"); real-UI walkthrough COVERED-E2E (`e2e/features/file-ops/project-move.feature`'s "Moving a project folder relocates its own row and its file, preserving both metadata") |
| 16.5 | Moving/copying a single audio file preserves status/tags/score; project association is recomputed from the new location | COVERED-BOTH | DB-rekey mechanics COVERED-UNIT (`tests/audioFileRepository.test.ts`'s `describe("moveFile")`/`describe("cloneFile")` blocks, including the project-(re)association tests: moving into a different project recomputes both projects' aggregates, moving outside any project clears `projectId`, and the "name merely starts with a project's name" / plain-folder / DAW-folder positive-and-negative control tests at lines 571-710); route-level COVERED-UNIT (`tests/fileOpsRoutes.test.ts`'s "moves/copies a file to destDir" tests); real-UI walkthrough COVERED-E2E (`e2e/features/file-ops/move.feature`, `copy.feature` — both assert status/score/tags survived) |
| 16.6 | Name-collision behavior: Move rejects (no overwrite); Copy auto-renames Finder-style (`"name copy"`, `"name copy 2"`, ...) | COVERED-UNIT | `tests/fileOpsService.test.ts`'s `movePath` "rejects with NameConflictError when the destination already has an item with the same name..." and `copyPath`'s "auto-renames Finder-style on collision for a file/directory..." + "skips past an already-taken 'copy' name..."; route-level `tests/fileOpsRoutes.test.ts`'s "returns 409 on a name collision..." and `tests/projectOpsRoutes.test.ts`'s "409s on a name collision...". No e2e scenario currently drives an actual collision (the 8 e2e scenarios use collision-free fixture destinations) — unit/route layer only |
| 16.7 | Batch Copy/Move/Delete report success/failure per item; a partial failure does not roll back items that already succeeded | COVERED-BOTH | route-level per-item independence COVERED-UNIT (`tests/fileOpsRoutes.test.ts`'s `POST /batch/copy`/`POST /batch/move`/`DELETE /batch` "processes each id independently: partial failure doesn't roll back the successful items" trio; `tests/projectOpsRoutes.test.ts`'s "batch routes" partial-failure trio, same pattern); UI banner/refetch wiring COVERED-UNIT (`frontend/src/test/App.fileOps.test.tsx`'s "App - batch Copy/Move/Delete wiring (Task 10)" blocks assert a pluralized succeeded/failed banner and that the batch panel stays open; `CustomFilesTabPanel.test.tsx`'s/`CustomProjectsTabPanel.test.tsx`'s "batch Copy/Move/Delete wiring" blocks for the custom-tab equivalent); real-UI walkthrough COVERED-E2E (`e2e/features/file-ops/batch-delete.feature`'s two-file batch delete) — the e2e scenario is an all-succeed case only, not a mixed partial-failure one, so the partial-failure branch itself is unit/route-layer only |
| 16.8 | Known, deliberately deferred limitations (misleading nonexistent-destination error message; `batch/copy` id-dedup gap; `batch/move` order-dependent ancestor+descendant flattening for non-UI callers) | NONE (by design) | Not test-covered at any layer — these are documented-but-not-fixed gaps, not asserted behaviors. Findings and reasoning recorded in `docs/TODO.md`'s "Found along the way" list under "Copy/Move/Delete feature" (grep that file for the phrase); the ancestor+descendant case's *frontend mitigation* (`excludeNestedProjectIds`, which prevents the UI itself from ever sending such a batch) is separately COVERED-UNIT via `BatchEditPanel.test.tsx`'s dedup tests and `CustomProjectsTabPanel.test.tsx`'s "excludes a selected nested sub-project from a batch Move, sending only the parent's id" — but the underlying raw-API gap this clause describes remains untested and unfixed, as intended |

Repository/service-layer plumbing not mapped to a single requirement clause above: `NodeFileOpsService`'s EXDEV (cross-device rename) fallback-to-copy-then-delete, including its own rollback-on-partial-failure handling, is COVERED-UNIT via `tests/fileOpsService.test.ts`'s `movePath` EXDEV block (7 tests covering the fallback itself, directory variants, non-EXDEV passthrough, and three distinct failure-during-fallback shapes); `MacTrashService`'s AppleScript string-escaping (quotes, backslashes, multi-path batches) is COVERED-UNIT via `tests/trashService.test.ts`'s escaping block; the physical-operation-succeeded-but-DB-update-failed inconsistency handling (both single-item and batch, both files and projects) is COVERED-UNIT via `tests/fileOpsRoutes.test.ts`'s and `tests/projectOpsRoutes.test.ts`'s respective "discoverably reports (does not silently swallow)"/"surfaces (does not silently swallow)" tests.

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
