Feature: Copy/Move/Delete — copying a single file

  # "File Ops E2E Copy Source.wav" (a loose, top-level fixture, seeded with status/score/tags
  # before the scenario runs) and "File Ops E2E Copy Destination/" (a plain folder containing an
  # untouched "keep.wav" placeholder so it's non-empty on disk/git, same convention as
  # destination-picker.feature's "File Ops E2E Picker Destination/") are both exclusive to this
  # scenario — the copy is a genuine, one-shot filesystem+DB mutation (a real second file gets
  # written to disk), so — per this directory's established convention — no restoration is
  # attempted and no other scenario ever touches either fixture. See ALL_FILES_E2E_FIXTURES in
  # files.steps.ts for both fixtures' registration.
  #
  # This is the first scenario in the suite to actually click Apply against a real destination
  # selection. Earlier scenarios (destination-picker.feature, cancel.feature) deliberately never
  # did, because of a since-fixed bug: CopyMoveDeleteDialog.tsx used to forward the destination
  # picker's root-RELATIVE path straight to the copy/move API routes, which require an ABSOLUTE
  # path — every real copy/move failed end-to-end (see fileOps.steps.ts's top doc comment for the
  # full historical write-up). This scenario is a genuine, DB+filesystem-verified proof that fix
  # holds: the source file must still exist unmodified at its old location, AND a real second copy
  # must now exist on disk at the destination, both with status/score/tags carried over from the
  # source (see `cloneFile` in audioFileRepository.ts).

  Scenario: Copying a file via its detail panel leaves the original in place and creates a copy at the destination
    Given file "File Ops E2E Copy Source.wav" has status "done", score 4, and tags "copy-tag"
    And I open the app
    And I switch to the "Audio Files" tab
    When I search files for "File Ops E2E Copy Source.wav"
    Then I should see 1 row for file "File Ops E2E Copy Source.wav" in the table
    When I open the file detail panel for "File Ops E2E Copy Source.wav"
    And I click "Copy" in the file detail panel
    Then I should see the file operation dialog
    And I should see the destination folder tree
    When I select destination folder "File Ops E2E Copy Destination" in the file operation dialog
    And I type "COPY" to confirm in the file operation dialog
    Then the file operation apply button should be enabled
    When I confirm the copy in the file operation dialog
    Then I should not see the file operation dialog
    And I should see 2 rows for file "File Ops E2E Copy Source.wav" in the table
    And the file "File Ops E2E Copy Source.wav" row at location "(root)" should show score 4
    And the file "File Ops E2E Copy Source.wav" row at location "(root)" should have tag "copy-tag"
    And the file "File Ops E2E Copy Source.wav" row at location "File Ops E2E Copy Destination" should show score 4
    And the file "File Ops E2E Copy Source.wav" row at location "File Ops E2E Copy Destination" should have tag "copy-tag"
