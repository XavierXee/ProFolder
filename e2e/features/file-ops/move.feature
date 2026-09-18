Feature: Copy/Move/Delete — moving a single file

  # Mirrors copy.feature's structure exactly, with its own exclusive fixtures: "File Ops E2E Move
  # Source.wav" (a loose, top-level fixture, seeded with status/score/tags before the scenario
  # runs) and "File Ops E2E Move Destination/" (a plain folder containing an untouched "keep.wav"
  # placeholder, same convention as every other destination folder in this directory). Both are
  # exclusive to this scenario — a move physically relocates the source file and rekeys its DB row
  # id (see `moveFile` in audioFileRepository.ts), a one-shot mutation nothing else in the suite
  # ever needs to restore. See ALL_FILES_E2E_FIXTURES in files.steps.ts for both fixtures'
  # registration.
  #
  # Unlike copy.feature, a move leaves exactly ONE row behind (not two) — the same underlying file,
  # now living (and rekeyed) at the destination — so this scenario's own proof that the fix holds
  # is: exactly one row remains for this filename, it's now AT the destination folder (not the
  # original one), and its status/score/tags survived the move unchanged.

  Scenario: Moving a file via its detail panel relocates it and removes it from its old location
    Given file "File Ops E2E Move Source.wav" has status "draft", score 3, and tags "move-tag"
    And I open the app
    And I switch to the "Audio Files" tab
    When I search files for "File Ops E2E Move Source.wav"
    Then I should see 1 row for file "File Ops E2E Move Source.wav" in the table
    When I open the file detail panel for "File Ops E2E Move Source.wav"
    And I click "Move" in the file detail panel
    Then I should see the file operation dialog
    When I select destination folder "File Ops E2E Move Destination" in the file operation dialog
    And I type "MOVE" to confirm in the file operation dialog
    Then the file operation apply button should be enabled
    When I confirm the move in the file operation dialog
    Then I should not see the file operation dialog
    And I should see 1 row for file "File Ops E2E Move Source.wav" in the table
    And I should not see file "File Ops E2E Move Source.wav" at location "(root)" in the table
    And the file "File Ops E2E Move Source.wav" row at location "File Ops E2E Move Destination" should show score 3
    And the file "File Ops E2E Move Source.wav" row at location "File Ops E2E Move Destination" should have tag "move-tag"
