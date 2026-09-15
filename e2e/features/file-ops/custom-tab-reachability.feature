Feature: Copy/Move/Delete — reachable from within a custom tab, not just the default tabs

  # Confirms Copy/Move/Delete is wired up inside a custom (non-default) tab too, per this
  # feature's "everywhere, not just custom tabs" scope decision — CustomFilesTabPanel.tsx mounts
  # its own FileDetailPanel + CopyMoveDeleteDialog instance, entirely separate from App.tsx's
  # default-tab ones (see CustomFilesTabPanel.tsx). Uses Delete rather than Copy/Move: see
  # fileOps.steps.ts's top doc comment for the confirmed destination-picker bug that currently
  # makes every real UI-driven copy/move fail end-to-end regardless of which tab it's driven
  # from — Delete needs no destination and so is unaffected, and is enough on its own to prove
  # this dialog is reachable and functional from a custom tab's own panel instance, not just the
  # default Files tab's.
  #
  # "File Ops E2E Custom Tab Delete.wav" is exclusive to this scenario (see
  # ALL_FILES_E2E_FIXTURES in files.steps.ts for its registration). `@custom-tabs` tags this
  # scenario for customTabs.steps.ts's `After("@custom-tabs")` cleanup hook (deletes any tab this
  # scenario created, tolerating an already-gone one) — see that file's own doc comment for the
  # full "custom tabs are a global, shared-visibility list" hazard reasoning this scenario
  # inherits by using its `createCustomTab` helper (random per-run suffix, scoped assertions).
  # `@mode:serial` isn't needed: this file has only one scenario, so there's no same-file,
  # same-fixture race to serialize against, and the tab it creates is randomly suffixed so it
  # can't collide with any other concurrently-running scenario's own custom tab.

  @custom-tabs
  Scenario: Deleting a file from within a custom tab's own detail panel removes it there too
    Given I open the app
    When I create a custom tab of type "Audio Files" named "File Ops E2E Custom Tab" with no filter
    Then my custom tab "File Ops E2E Custom Tab" should be the active tab
    When I search files for "File Ops E2E Custom Tab Delete.wav"
    And I open the file detail panel for "File Ops E2E Custom Tab Delete.wav"
    And I click "Delete" in the file detail panel
    Then I should see the file operation dialog
    When I confirm the delete in the file operation dialog
    Then I should not see the file operation dialog
    And I should not see file "File Ops E2E Custom Tab Delete.wav" in the table
