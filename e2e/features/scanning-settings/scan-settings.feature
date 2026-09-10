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
  # Each scenario below is fully self-contained: it sets up whatever starting state it needs
  # itself (never assuming a prior scenario in this file already ran) and restores the baseline
  # (both toggles back to their default `true`/excluded, and any scan-triggered DB changes
  # reverted) before it finishes — mirroring exclusion-toggles.feature's own established
  # self-restoring convention. This is required, not just tidy: under `--repeat-each=N`,
  # Playwright runs N independent copies of this whole scenario group, and while `@mode:serial`
  # correctly orders scenarios WITHIN one copy, it does nothing to stop a DIFFERENT copy's
  # scenario 1 from running in the gap between this copy's own scenario 1 and scenario 3 (the
  # scan-lock mutex is held per-scenario, not per-copy-of-the-whole-file) — so a scenario that
  # assumed an earlier scenario's leftover state, rather than establishing its own, could
  # observe a different copy's state instead and fail or false-pass nondeterministically.

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
    # Cleanup: restore "Exclude Samples folders" back to its default (excluded) state so this
    # scenario doesn't leave global config mutated for whichever scenario/copy runs next.
    When I open the settings panel
    And I toggle "Exclude Samples folders" in the settings panel
    Then the settings panel should show save state "Saved"
    When I close the settings panel
    And I open the production folder scan settings panel
    And I start a scan from the scan settings panel
    Then I should see a scan complete banner
    And I should not see file "track.wav" in the table

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
    # Cleanup: restore "Exclude Backup folders" back to its default (excluded) state so this
    # scenario doesn't leave global config mutated for whichever scenario/copy runs next.
    When I open the settings panel
    And I toggle "Exclude Backup folders" in the settings panel
    Then the settings panel should show save state "Saved"
    When I close the settings panel
    And I open the production folder scan settings panel
    And I start a scan from the scan settings panel
    Then I should see a scan complete banner
    And I should not see file "track.wav" in the table

  # Distinct from the two scenarios above: proves toggling BOTH settings off together (a single
  # save round-trip per checkbox, but one shared rescan) reveals both fixtures at once, not just
  # each in isolation — then restores both toggles back to their default, confirming the setting
  # works correctly in both directions together as well.
  Scenario: Toggling both exclusions off together reveals both fixtures after a single rescan
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Scanning E2E Settings/Samples"
    Then I should not see file "track.wav" in the table
    When I search files for "Scanning E2E Settings/Backup"
    Then I should not see file "track.wav" in the table
    When I open the settings panel
    And I toggle "Exclude Samples folders" in the settings panel
    Then the settings panel should show save state "Saved"
    And I toggle "Exclude Backup folders" in the settings panel
    Then the settings panel should show save state "Saved"
    When I close the settings panel
    And I open the production folder scan settings panel
    And I start a scan from the scan settings panel
    Then I should see a scan complete banner
    And I should see file "track.wav" in the table
    When I search files for "Scanning E2E Settings/Samples"
    Then I should see file "track.wav" in the table
    # Cleanup: restore both toggles back to their default (excluded) state so this scenario
    # doesn't leave global config mutated for whichever scenario/copy runs next.
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
