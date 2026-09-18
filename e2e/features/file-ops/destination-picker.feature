Feature: Copy/Move/Delete — destination folder picker sanity check

  # "File Ops E2E Picker Target.wav" is opened only to launch the Copy dialog and is never
  # actually copied — this scenario never clicks Apply, so it never mutates the filesystem/DB at
  # all (see fileOps.steps.ts's top doc comment for why Apply is never clicked in this task:
  # every real destination selection currently fails server-side). "File Ops E2E Picker
  # Destination/" is a plain folder (no DAW marker) that exists purely so the picker's tree has a
  # real, uniquely-named folder to select — safe to reuse read-only across this scenario and
  # cancel.feature's, since neither ever applies/mutates it. Being non-mutating, this scenario
  # needs no fixture exclusivity precaution beyond a unique NAME to assert against (see
  # ALL_FILES_E2E_FIXTURES/ALL_PROJECTS_E2E_FIXTURES in files.steps.ts/projects.steps.ts for both
  # fixtures' registration).

  Scenario: Apply stays disabled until a destination folder is picked, and picking one enables it
    Given I open the app
    And I switch to the "Audio Files" tab
    When I search files for "File Ops E2E Picker Target.wav"
    And I open the file detail panel for "File Ops E2E Picker Target.wav"
    And I click "Copy" in the file detail panel
    Then I should see the file operation dialog
    And I should see the destination folder tree
    And the file operation apply button should be disabled
    When I select destination folder "File Ops E2E Picker Destination" in the file operation dialog
    And I type "COPY" to confirm in the file operation dialog
    Then the file operation apply button should be enabled
    When I click cancel in the file operation dialog
    Then I should not see the file operation dialog
    And I should see file "File Ops E2E Picker Target.wav" in the table
