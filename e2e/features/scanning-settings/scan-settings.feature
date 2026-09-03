@mode:serial @scan-lock
Feature: Settings panel — name-based folder exclusion toggles

  # "Scanning E2E Settings/Samples/track.wav" and "Scanning E2E Settings/Backup/track.wav" (see
  # ALL_FILES_E2E_FIXTURES in files.steps.ts / ALL_PROJECTS_E2E_FIXTURES in projects.steps.ts) are
  # nested under a distinctly-named parent folder ("Scanning E2E Settings") specifically so the
  # parent itself is never named "samples"/"backup" — only the two CHILD folders are, which is
  # what `shouldIgnoreDir` (ignoreRules.ts) actually tests against (an exact, case-insensitive
  # Set.has() lookup on just the folder's own basename, not a substring/prefix check against its
  # full path — confirmed by reading walk.ts's `shouldIgnoreDir(entry.name, ...)` call site). Both
  # "Exclude Samples folders" and "Exclude Backup folders" default to `true` (excluded), so both
  # children start with no DB row from globalSetup.ts's own seed scan; the parent folder itself
  # has no DAW marker and no loose file of its own, so it's always walked and always gets its own
  # (empty) project row regardless of either toggle.
  #
  # This is a wholly separate exclusion mechanism from the "Prod Folder" scan settings panel's
  # per-path checkboxes (Task 7.1, exclusion-toggles.feature): that one persists an exact
  # relative-*path* allowlist via `PUT /api/scan/exclusions`; this one persists two booleans via
  # `PUT /api/config/scan-settings`, matched by folder *name* alone, anywhere in the tree. Per the
  # scope decision behind this task, only the SAFE direction is exercised here — default-excluded
  # -> toggle off -> scan -> file appears is a plain INSERT, no crash risk even without Task 7.0's
  # fix — the reactivation-after-exclusion proof (soft-remove, then reappear with prior status/
  # score/tags intact) is already covered thoroughly by Task 7.1's own scenario against the OTHER
  # mechanism and isn't repeated here.
  #
  # `@mode:serial`: confirmed empirically, not just assumed, mirroring the now-standing practice
  # from exclusion-toggles.feature's own investigation. Every scan below is a real
  # `POST /api/scan` mid-test, and `PUT /api/config/scan-settings` — while it upserts one settings
  # key at a time (see setSetting in appSettingsRepository.ts), not a whole-table replace like
  # `scan_exclusions` — still mutates suite-wide global state read by every concurrently-running
  # scan. With `@mode:serial` removed, `playwright test --grep "Settings panel" --workers=8` (this
  # file's 3 scenarios, isolated from every other file) failed on multiple runs; with it restored,
  # the same invocation passed cleanly across repeated runs.
  #
  # `@scan-lock`: `@mode:serial` alone only serializes THIS file's own 3 scenarios against each
  # other — it does nothing to prevent a scenario here from running genuinely concurrently (in a
  # separate worker process) with one of exclusion-toggles.feature's own real-scan scenarios,
  # which mutates the SAME global scan state and ALSO triggers real scans. That cross-file race is
  # real, not hypothetical: confirmed empirically with `playwright test --grep "path-exclusion
  # toggles|Settings panel"` (both files together) failing intermittently — at both an elevated
  # `--workers=8` and this suite's actual default worker count — with a file re-included and
  # rescanned by one file's own scenario not showing up, even though each file was independently
  # stable in isolation. `@scan-lock` (see scanLock.ts / scanLockHooks.ts) is a cross-process
  # lockfile held for a whole tagged scenario's duration, applied to every scenario in both this
  # file and exclusion-toggles.feature that mutates scan configuration and/or triggers a scan —
  # with it applied to both files, the same combined `--grep` invocation passed cleanly across
  # repeated runs at both worker counts.
  #
  # Scenario 3 deliberately depends on scenarios 1 and 2 having already run (it restores BOTH
  # toggles back to their default `true`, cleaning up after both) rather than restoring its own
  # state independently — safe only because `@mode:serial` (playwright-bdd's
  # `test.describe.configure({ mode: "serial" })`) guarantees these three scenarios run in this
  # file's declared order, one after another, in the same worker.

  Scenario: Toggling "Exclude Samples folders" off reveals the excluded fixture after a rescan
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Scanning E2E Settings/Samples"
    Then I should not see file "track.wav" in the table
    When I open the settings panel
    And I toggle "Exclude Samples folders" in the settings panel
    Then the settings panel should show save state "Saved"
    When I close the settings panel
    And I open the production folder scan settings panel
    And I start a scan from the scan settings panel
    Then I should see a scan complete banner
    And I should see file "track.wav" in the table

  Scenario: Toggling "Exclude Backup folders" off reveals the excluded fixture after a rescan
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Scanning E2E Settings/Backup"
    Then I should not see file "track.wav" in the table
    When I open the settings panel
    And I toggle "Exclude Backup folders" in the settings panel
    Then the settings panel should show save state "Saved"
    When I close the settings panel
    And I open the production folder scan settings panel
    And I start a scan from the scan settings panel
    Then I should see a scan complete banner
    And I should see file "track.wav" in the table

  # Cleanup + a lightweight proof the setting works in both directions (toggling both fixtures'
  # exclusions back on removes their now-reappeared files again), restoring the suite-wide default
  # (both toggles on) so it isn't left mutated for whichever scenario/spec runs next.
  Scenario: Restoring both exclusion toggles removes both fixtures again after a rescan
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Scanning E2E Settings/Samples"
    Then I should see file "track.wav" in the table
    When I open the settings panel
    And I toggle "Exclude Samples folders" in the settings panel
    Then the settings panel should show save state "Saved"
    And I toggle "Exclude Backup folders" in the settings panel
    Then the settings panel should show save state "Saved"
    When I close the settings panel
    And I open the production folder scan settings panel
    And I start a scan from the scan settings panel
    Then I should see a scan complete banner
    And I should not see file "track.wav" in the table
    When I search files for "Scanning E2E Settings/Backup"
    Then I should not see file "track.wav" in the table
