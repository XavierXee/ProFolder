Feature: Copy/Move/Delete — batch delete

  # "File Ops E2E Batch Delete Alpha.wav"/"Bravo.wav" are exclusive to this scenario and both
  # physically deleted by it — fresh, single-use fixtures per the same one-shot rationale as
  # delete.feature. Batch move/copy are not exercised here (or anywhere in this task) — see
  # fileOps.steps.ts's top doc comment for the confirmed destination-picker bug that currently
  # makes every real UI-driven copy/move fail end-to-end, regardless of single-item vs batch.
  # Batch delete needs no destination, so it's unaffected and is what this scenario covers as
  # this task's "at least one batch operation" scenario. See ALL_FILES_E2E_FIXTURES in
  # files.steps.ts for these fixtures' registration in the suite-wide isolation list.

  Scenario: Batch-deleting two selected files removes both from the active list
    Given I open the app
    And I switch to the "Audio Files" tab
    When I search files for "File Ops E2E Batch Delete"
    Then I should see file "File Ops E2E Batch Delete Alpha.wav" in the table
    And I should see file "File Ops E2E Batch Delete Bravo.wav" in the table
    When I select file "File Ops E2E Batch Delete Alpha.wav"
    And I select file "File Ops E2E Batch Delete Bravo.wav"
    And I open the "audio files" batch edit panel
    And I click "Delete" in the "audio files" batch edit panel
    Then I should see the file operation dialog
    When I confirm the batch delete in the file operation dialog
    Then I should not see the file operation dialog
    And I should not see file "File Ops E2E Batch Delete Alpha.wav" in the table
    And I should not see file "File Ops E2E Batch Delete Bravo.wav" in the table
