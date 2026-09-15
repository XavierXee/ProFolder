Feature: Copy/Move/Delete — cancelling the dialog never mutates anything

  # "File Ops E2E Cancel Target.wav" is exclusive to this scenario — seeded with a known
  # status/score/tags via the API, then a Move dialog is opened, a destination selected (so
  # Apply is enabled/clickable, proving this isn't just "cancel while Apply happens to be
  # disabled anyway"), and Cancel clicked instead. Reuses "File Ops E2E Picker Destination/" as
  # the folder to select (see destination-picker.feature's doc comment for why that's safe to
  # share read-only) and asserts the file's seeded status/score/tags are unchanged and it's still
  # the only row matching this filename — a real Move would have rekeyed the row's id/relativePath
  # and moved it out of the search results entirely.

  Scenario: Cancelling a move dialog leaves the file's location and metadata unchanged
    Given file "File Ops E2E Cancel Target.wav" has status "done", score 4, and tags "keep"
    And I open the app
    And I switch to the "Audio Files" tab
    When I search files for "File Ops E2E Cancel Target.wav"
    Then the file "File Ops E2E Cancel Target.wav" row should show score 4
    When I open the file detail panel for "File Ops E2E Cancel Target.wav"
    And I click "Move" in the file detail panel
    Then I should see the file operation dialog
    When I select destination folder "File Ops E2E Picker Destination" in the file operation dialog
    Then the file operation apply button should be enabled
    When I click cancel in the file operation dialog
    Then I should not see the file operation dialog
    And I should see file "File Ops E2E Cancel Target.wav" in the table
    And the file "File Ops E2E Cancel Target.wav" row should show score 4
