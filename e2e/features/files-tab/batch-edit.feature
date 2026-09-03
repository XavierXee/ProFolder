@mode:serial
Feature: Audio Files tab batch edit — selection mechanics and batch score/tag (standalone, no cascade)

  # This file mirrors e2e/features/projects-tab/batch-edit.feature's structure (Task 6.2),
  # adapted for the Audio Files tab's 3 own fixtures: "Batch E2E Files Alpha/Bravo/Charlie.wav"
  # (see ALL_FILES_E2E_FIXTURES in files.steps.ts for their registration in the isolation list).
  # Unlike the Projects-tab fixtures, these are loose, standalone top-level files under
  # music-root/ with no DAW marker — they are not linked to any project — so this file
  # deliberately does NOT include the Projects-tab equivalent's cascade scenarios (its scenarios
  # 4 and 6, which prove a project-folder batch edit cascades onto that project's files): there
  # is no project for a standalone file's batch edit to cascade to or from. Every scenario below
  # searches "Batch E2E Files" first to scope the table to just these 3 fixtures, per this
  # suite's usual convention.
  #
  # `@mode:serial` (playwright-bdd's special tag, generates `test.describe.configure({ mode:
  # "serial" })` for this whole file — see SpecialTags in playwright-bdd) IS required here, same
  # as the Projects-tab file: the "score only applies to selected rows" scenario sets score 4 on
  # Alpha+Bravo (leaving Charlie unscored), while the select-all scenario sets score 5 on all
  # three INCLUDING Charlie — two scenarios batch-writing different target scores onto the SAME
  # shared 3 fixtures. Confirmed empirically while writing this file: without `@mode:serial`, the
  # "should show no score" assertion on Charlie in the first scenario failed intermittently
  # because the select-all scenario's concurrently-running score-5 batch edit landed on Charlie
  # mid-assertion — each scenario's own self-contained `Given` re-seeding only protects against
  # *ordering* assumptions, not true concurrent writes to the same row, exactly the failure mode
  # the Projects-tab file's own `@mode:serial` comment describes.
  #
  # No shared Background, mirroring the Projects-tab file: only some scenarios need API seeding,
  # and it must happen before "I open the app" (the all-tags dictionary is fetched once on mount).

  Scenario: Batch Edit is disabled below 2 selected rows, enabled at 2 or more
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Batch E2E Files"
    Then the batch edit button should be disabled
    When I select file "Batch E2E Files Alpha.wav"
    Then the batch edit button should be disabled
    When I select file "Batch E2E Files Bravo.wav"
    Then the batch edit button should be enabled

  Scenario: Batch-setting a score only applies to the selected rows, not an unselected one
    Given file "Batch E2E Files Alpha.wav" has no score
    And file "Batch E2E Files Bravo.wav" has no score
    And file "Batch E2E Files Charlie.wav" has no score
    And I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Batch E2E Files"
    When I select file "Batch E2E Files Alpha.wav"
    And I select file "Batch E2E Files Bravo.wav"
    And I open the "audio files" batch edit panel
    And I set the batch score to 4 in the "audio files" batch edit panel
    And I close the "audio files" batch edit panel
    Then the file "Batch E2E Files Alpha.wav" row should show score 4
    And the file "Batch E2E Files Bravo.wav" row should show score 4
    And the file "Batch E2E Files Charlie.wav" row should show no score

  # Alpha starts with its own pre-existing tag; Bravo starts with none. Bravo ending up with just
  # "batch-ready" and Alpha ending up with BOTH tags is what proves batch tag application is a
  # union (addTagsToFiles — see linkSync.ts / audioFileRepository.ts), not a replace.
  Scenario: Batch-adding a tag unions onto each selected row's existing tags rather than replacing them
    Given file "Batch E2E Files Alpha.wav" has tags "preexisting"
    And file "Batch E2E Files Bravo.wav" has tags ""
    And I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Batch E2E Files"
    When I select file "Batch E2E Files Alpha.wav"
    And I select file "Batch E2E Files Bravo.wav"
    And I open the "audio files" batch edit panel
    And I add the batch tag "batch-ready" in the "audio files" batch edit panel
    And I close the "audio files" batch edit panel
    Then the file "Batch E2E Files Alpha.wav" row should have tag "preexisting"
    And the file "Batch E2E Files Alpha.wav" row should have tag "batch-ready"
    And the file "Batch E2E Files Bravo.wav" row should have tag "batch-ready"

  Scenario: The header checkbox selects every visible row, and a second click clears the selection
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Batch E2E Files"
    When I click the select-all files checkbox
    Then the select-all files checkbox should be checked
    And the batch edit button should read "Batch Edit (3)"
    When I click the select-all files checkbox
    Then the select-all files checkbox should not be checked
    And the batch edit button should read "Batch Edit"
    And the batch edit button should be disabled

  # Distinct from the previous scenario: that one only proves the checkbox/button *look* selected.
  # This one proves the underlying Set the header checkbox populates is what the batch PATCH
  # endpoint actually receives and acts on — Charlie (never individually clicked) ending up
  # scored too is what a purely-visual/unwired select-all could not produce.
  Scenario: The select-all checkbox's selection is what the batch endpoint actually acts on
    Given file "Batch E2E Files Alpha.wav" has no score
    And file "Batch E2E Files Bravo.wav" has no score
    And file "Batch E2E Files Charlie.wav" has no score
    And I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Batch E2E Files"
    When I click the select-all files checkbox
    And I open the "audio files" batch edit panel
    And I set the batch score to 5 in the "audio files" batch edit panel
    And I close the "audio files" batch edit panel
    Then the file "Batch E2E Files Alpha.wav" row should show score 5
    And the file "Batch E2E Files Bravo.wav" row should show score 5
    And the file "Batch E2E Files Charlie.wav" row should show score 5

  # Covers REQUIREMENTS §9.1: selection must clear both when the active filter changes and when
  # switching tabs (handleFilesFilterChange / handleTabChange in App.tsx).
  Scenario: Selection clears when the filter changes, and when switching tabs
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Batch E2E Files"
    When I select file "Batch E2E Files Alpha.wav"
    And I select file "Batch E2E Files Bravo.wav"
    Then the batch edit button should be enabled
    When I filter files by status "Draft"
    Then the batch edit button should be disabled
    When I clear all file filters
    And I search files for "Batch E2E Files"
    And I select file "Batch E2E Files Alpha.wav"
    And I select file "Batch E2E Files Bravo.wav"
    Then the batch edit button should be enabled
    When I switch to the "Project Folders" tab
    And I switch to the "Audio Files" tab
    Then the batch edit button should be disabled

  # Task 6.3-specific: these 3 fixtures are loose, standalone files with no linked project (no
  # DAW marker file in their folder — they sit directly under music-root/), so searching for
  # their shared prefix on the Projects tab must never surface a row. This is what proves they
  # really are standalone rather than accidentally getting linked into some project during the
  # scan (e.g. via a stray marker file or folder-grouping heuristic).
  Scenario: These standalone files never appear as a row on the Projects tab
    Given I open the app
    And I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Files"
    Then I should not see project "Batch E2E Files Alpha" in the table
    And I should not see project "Batch E2E Files Bravo" in the table
    And I should not see project "Batch E2E Files Charlie" in the table
