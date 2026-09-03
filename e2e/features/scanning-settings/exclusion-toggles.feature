@mode:serial @scan-lock
Feature: Prod Folder scan settings panel — path-exclusion toggles

  # "Scanning E2E Exclusion Toggle/track.wav" (see ALL_FILES_E2E_FIXTURES in files.steps.ts /
  # ALL_PROJECTS_E2E_FIXTURES in projects.steps.ts) is a plain top-level folder — generic name,
  # deliberately not "samples"/"backup", so it never collides with the Settings tab's own
  # name-based exclusion rules (Task 7.2, a separate file) — holding one loose audio file. It
  # starts included by default (path exclusions are empty by default), so it's already active
  # from globalSetup.ts's own seed scan by the time any scenario below runs.
  #
  # This is the first file in the suite whose scenarios trigger a REAL `POST /api/scan` mid-test
  # (every other scenario elsewhere only ever relies on globalSetup.ts's one seed scan, plus
  # ordinary PATCH-based edits) — every scan below is a full rescan of the whole scratch music
  # root, not scoped to this task's own fixture, so its `POST /api/scan` result numbers (new/
  # modified/removed) reflect every fixture in the suite, not just this one. What each scenario
  # actually asserts on is this task's own fixture's presence/absence/detail in the Audio Files
  # tab, never the scan's raw counts.
  #
  # `@mode:serial`: `PUT /api/scan/exclusions` (see setExcludedPaths in
  # scanExclusionRepository.ts) REPLACES the entire `scan_exclusions` table in one transaction —
  # unlike every other mutation this suite performs (which are scoped to one row/fixture by id),
  # this is genuinely global, un-scoped state. Two scenarios below racing that PUT concurrently
  # would silently clobber each other's exclusion list (the last write wins, dropping whichever
  # scenario's own toggle wasn't included in that write). Confirmed empirically, not just assumed:
  # with `@mode:serial` removed, `playwright test --grep exclusion --workers=8` (this file's 3
  # scenarios, eligible under `fullyParallel: true` to run concurrently with each other even
  # within one spec file) failed on 3 of 4 runs with exactly that signature — a file re-included
  # and rescanned by one scenario not showing up because a concurrently-running scenario's PUT had
  # clobbered the first scenario's own exclusion-list write. With `@mode:serial` restored, the
  # same `--workers=8` invocation passed cleanly on 5 of 5 runs. Every scenario below also restores
  # the exclusion set back to its own starting point (nothing excluded) by the time it finishes,
  # so the suite-wide default the seed scan established is never left mutated for whichever
  # scenario/spec runs next, in this file or any other.
  #
  # No shared Background: each scenario spells out its own steps in full, mirroring this suite's
  # established Background-less convention for scenarios that mutate shared fixture/global state
  # (see batch-edit-cascade.feature's equivalent rationale).
  #
  # `@scan-lock` (added by Task 7.2, once a SECOND file — scan-settings.feature — started also
  # mutating global scan configuration and triggering real mid-test scans): `@mode:serial` above
  # only serializes this file's own 3 scenarios against each other, not against a DIFFERENT file's
  # scenarios running concurrently in another worker process. See scanLock.ts's own doc comment
  # for the empirical confirmation and full mechanism (a cross-process lockfile, held for a whole
  # `@scan-lock`-tagged scenario's duration via the Before/After hooks in scanLockHooks.ts).

  Scenario: Excluding a folder and rescanning removes its file from the Files tab
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Scanning E2E Exclusion Toggle"
    Then I should see file "track.wav" in the table
    When I open the production folder scan settings panel
    And I toggle the "Scanning E2E Exclusion Toggle" folder exclusion in the scan settings panel
    Then the scan settings panel should show save state "Saved"
    When I start a scan from the scan settings panel
    Then I should see a scan complete banner
    And I should not see file "track.wav" in the table
    # Cleanup: restore the default (nothing excluded) state and reactivate the file, so the
    # suite-wide baseline the seed scan established isn't left mutated for later scenarios.
    When I open the production folder scan settings panel
    And I toggle the "Scanning E2E Exclusion Toggle" folder exclusion in the scan settings panel
    Then the scan settings panel should show save state "Saved"
    When I start a scan from the scan settings panel
    Then I should see a scan complete banner
    And I should see file "track.wav" in the table

  # The exact path Task 7.0 unblocked: reactivating a soft-removed audio file used to crash the
  # scan (a stale existing row hitting the INSERT's UNIQUE constraint); the fix keeps the
  # reappearing row's own prior status/tags/score and recomputes its `project_id` fresh (see
  # updateAudioFileMetadata in audioFileRepository.ts / the reactivation branch in scanner.ts).
  # Task 7.0's own Tester already proved this at the API/unit level (tests/audioFileRepository
  # .test.ts, tests/scanner.integration.test.ts) — this scenario is the real end-to-end proof
  # through the actual UI: exclude the fixture's folder (soft-removes its file), rescan, confirm
  # it's gone, re-include the folder, rescan again, and confirm the file doesn't just reappear —
  # it reappears with the exact status/score/tag it had before it was ever excluded.
  Scenario: Re-including a folder after exclusion restores the file with its prior status, score, and tags
    Given file "track.wav" has status "released", score 5, and tags "vocal-take"
    And I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Scanning E2E Exclusion Toggle"
    Then I should see file "track.wav" in the table
    When I open the production folder scan settings panel
    And I toggle the "Scanning E2E Exclusion Toggle" folder exclusion in the scan settings panel
    Then the scan settings panel should show save state "Saved"
    When I start a scan from the scan settings panel
    Then I should see a scan complete banner
    And I should not see file "track.wav" in the table
    When I open the production folder scan settings panel
    And I toggle the "Scanning E2E Exclusion Toggle" folder exclusion in the scan settings panel
    Then the scan settings panel should show save state "Saved"
    When I start a scan from the scan settings panel
    Then I should see a scan complete banner
    And I should see file "track.wav" in the table
    When I open the file detail panel for "track.wav"
    Then the file detail panel should show status "Released"
    And the file detail panel should show score 5
    And the file detail panel should show exactly these tags: "vocal-take"

  # Lightweight: pure exclusion-list state + its persisted round-trip, no scan needed. A full
  # browser reload (not just closing/reopening the panel client-side) is what proves each click
  # actually reached the DB rather than just updating optimistic local state — same rationale as
  # every other persistence proof in this suite (see detail-panel-status-tags-score.feature's own
  # comment on why reload, not just close/reopen, is used).
  Scenario: Select All and Unselect All update the exclusion summary and persist
    Given I open the app
    When I open the production folder scan settings panel
    And I click "Unselect All" in the scan settings panel
    Then the scan settings panel should show a nonzero exclusion count
    When I reload the page
    And I open the production folder scan settings panel
    Then the scan settings panel should show a nonzero exclusion count
    When I click "Select All" in the scan settings panel
    Then the scan settings panel should show the summary "All folders included"
    When I reload the page
    And I open the production folder scan settings panel
    Then the scan settings panel should show the summary "All folders included"
