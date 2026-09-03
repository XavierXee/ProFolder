@mode:serial @scan-lock
Feature: Production folder path control — Save/Cancel/validation

  # RootPathControl.tsx — the always-mounted "production folder" (musicRoot) path editor in the
  # app header, distinct from the "Prod Folder" scan settings panel (ScanFolderPanel.tsx,
  # scanning.steps.ts) and the "Settings" panel (SettingsPanel.tsx, settings.steps.ts) — see
  # rootPath.steps.ts's own doc comment for why this task gets its own steps file. Task 7.4 is
  # deliberately scoped to Save/Cancel/validation MECHANICS ONLY — a confirmed, conservative scope
  # decision for this cycle. No scenario below ever clicks "Browse…" (it opens a real native
  # macOS AppleScript folder-picker dialog Playwright cannot see or dismiss — clicking it would
  # hang the run) and no scenario ever triggers a scan while the effective production folder
  # (`musicRoot`) is diverted away from the scratch fixture root. "Does a scan actually target the
  # new root" is explicitly out of scope, left for a future task.
  #
  # `@mode:serial`: only Scenario 3 below actually mutates the global `musicRoot` config value
  # (Scenarios 1 and 2 never successfully change it — a failed validation and a Cancel are both
  # no-ops server-side), so this file's 3 *distinct* scenarios don't race each other in a normal,
  # single-pass run: `playwright test --grep "production folder path" --workers=8`, repeated 6
  # times with every tag removed, passed cleanly every time. What genuinely does race — confirmed
  # empirically with `--repeat-each=8 --workers=8` (multiple *concurrent copies* of Scenario 3
  # itself, standing in for what a careless future addition of a second root-mutating scenario to
  # this file would look like) — is two copies of Scenario 3's divert-then-revert sequence
  # overlapping: one copy's "Save" mid-divert reads a client-side `musicRoot` that another copy's
  # concurrent Save already updated to the very value it's about to submit, so `RootPathControl`'s
  # own no-op guard (`trimmed === musicRoot` in `handleSave` — see RootPathControl.tsx) skips the
  # PUT entirely and the step's `waitForResponse` times out. This reproduced with `@mode:serial`
  # applied alone (no `@scan-lock`) just as readily as with no tag at all — `@mode:serial` only
  # orders scenarios *within one worker's run of this one file*, and `--repeat-each` schedules
  # each repeat as an independent copy that can land on any worker, so it never actually
  # serializes against a concurrent copy on another worker. Only `@scan-lock`'s cross-process
  # mutex (held for a whole scenario's duration, globally, not just within this file) closed that
  # window: the same `--repeat-each=8 --workers=8` stress run, with only `@scan-lock` applied,
  # passed 18/18. `@mode:serial` is kept anyway, matching this suite's established convention for
  # every feature file that mutates shared global state (see exclusion-toggles.feature's own
  # comment) and as cheap defense-in-depth, but note it is not what's empirically load-bearing
  # here — `@scan-lock` already fully serializes every `@scan-lock`-tagged scenario suite-wide, so
  # `@mode:serial`'s narrower (single-file) guarantee is redundant on top of it.
  #
  # `@scan-lock`: grepping the rest of the e2e suite confirms this is the ONLY feature file that
  # ever calls `PUT /config/music-root` — so, unlike exclusion-toggles.feature/scan-settings
  # .feature (which race each other over that same PUT-style global-state problem), no OTHER
  # file's scenario is racing this exact endpoint. But `@scan-lock` is still required here, for a
  # different reason than either of those two files needed it for: `POST /api/scan` (triggered by
  # scanning.steps.ts's "I start a scan from the scan settings panel") and `GET /api/folders`
  # (fetched every time the "Prod Folder" scan settings panel opens, to build its folder tree)
  # BOTH read `getEffectiveMusicRoot(db)` live at request time (see scan.ts/folders.ts) — neither
  # is scoped to a snapshot taken earlier. If exclusion-toggles.feature's or scan-settings
  # .feature's scenarios (both already `@scan-lock`-tagged) ran a real scan, or even just opened
  # that panel, concurrently with Scenario 3 below's divert window (the window between its two
  # Saves, where the effective root is a near-empty temp directory instead of the scratch
  # fixtures), that scan/tree-fetch would run against the WRONG root. Confirmed empirically, not
  # hypothetical: with `@scan-lock` removed from this file (`@mode:serial` still applied),
  # `playwright test --grep "production folder path|path-exclusion toggles|Settings panel"
  # --workers=8` (all three scan-configuration files together), run 4 times, failed twice — once
  # with exclusion-toggles.feature's own file-presence assertion finding the fixture missing
  # (exactly the "scan ran against the diverted root, misread the real fixture as removed"
  # signature this comment predicts) and once with a `PUT /api/scan/exclusions` step timing out
  # under the resulting contention. With `@scan-lock` restored on this file, the same combined
  # `--workers=8` invocation passed cleanly across 4 repeated runs, and `GET /api/config` confirmed
  # the root was genuinely restored to the scratch path at the end of every run.
  #
  # No shared Background: each scenario spells out its own steps in full, mirroring this suite's
  # established Background-less convention for scenarios that mutate shared fixture/global state
  # (see exclusion-toggles.feature's own equivalent rationale).

  Scenario: Saving a path that does not exist shows a validation error and stays in editing mode
    Given I open the app
    When I start editing the production folder path
    And I type a path that does not exist as the production folder path
    And I save the production folder path
    Then I should see a production folder path validation error for the nonexistent path
    And the production folder path editor should still be open

  Scenario: Cancelling discards the input without ever calling the save API
    Given I open the app
    When I start editing the production folder path
    And I type some throwaway text as the production folder path
    And I cancel editing the production folder path
    Then the production folder path editor should be closed
    And no request to update the production folder path should have been sent

  Scenario: Saving a valid path updates the folder and shows the update banner, then reverts cleanly
    Given I open the app
    When I start editing the production folder path
    And I type a valid temporary folder path as the production folder path
    And I save the production folder path
    Then the production folder path editor should be closed
    And the displayed production folder path should be the temporary folder path
    And I should see the production folder updated banner
    And the effective production folder path per the API should be the temporary folder path
    # Restore the scratch root before this scenario (or the suite) proceeds any further — the one
    # thing that could otherwise silently corrupt every other task's fixtures.
    When I start editing the production folder path
    And I type the original scratch production folder path
    And I save the production folder path
    Then the production folder path editor should be closed
    And the displayed production folder path should be the original scratch production folder path
    And the effective production folder path per the API should be the original scratch production folder path
