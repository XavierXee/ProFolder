Feature: Copy/Move/Delete — deleting a single file

  # "File Ops E2E Delete Single.wav" is exclusive to this scenario and is genuinely, physically
  # removed (moved to the OS Trash) by it — a one-shot fixture, deliberately not restored
  # afterward (see the task brief: a fresh, scenario-unique fixture for every mutating scenario
  # avoids needing any restoration logic). Real Trash-move filesystem mechanics are already
  # covered by the feature's own backend tests (TrashService/FileOpsService) — this only proves
  # the app-level, UI-driven outcome: the row disappears from the active file list once the
  # delete is confirmed. See ALL_FILES_E2E_FIXTURES in files.steps.ts for this fixture's
  # registration in the suite-wide isolation list.

  Scenario: Deleting a file via its detail panel removes it from the active list
    Given I open the app
    And I switch to the "Audio Files" tab
    When I search files for "File Ops E2E Delete Single.wav"
    Then I should see file "File Ops E2E Delete Single.wav" in the table
    When I open the file detail panel for "File Ops E2E Delete Single.wav"
    And I click "Delete" in the file detail panel
    Then I should see the file operation dialog
    When I confirm the delete in the file operation dialog
    Then I should not see the file operation dialog
    And I should not see file "File Ops E2E Delete Single.wav" in the table
