@statuses-tags-catalog @mode:serial
Feature: Statuses & tags catalog — CRUD, filter/picker wiring, and cascade-on-delete

  # See the doc comment at the top of statusesTagsCatalog.steps.ts for the full hazard reasoning
  # this file's scenarios and step definitions are built around — mirrors custom-tabs' own
  # doc-commented reasoning (see customTabs.steps.ts): statuses and tags are GLOBAL, shared-
  # visibility catalog rows (like custom tabs), not per-scenario-scoped, so every status/tag
  # created below gets a random suffix, every assertion is scoped to a scenario's own created
  # row (never the panel's total counts), and every scenario self-cleans via the `After
  # ("@statuses-tags-catalog")` hook or its own UI delete flow. This is plain CRUD state, not
  # scan/config-mutating state, so `@scan-lock` is deliberately NOT used: unique names, scoped
  # assertions and self-cleanup are enough for independently-keyed rows.
  #
  # The 4 "Statuses Tags E2E ..." fixtures used below (one per scenario that assigns a status/tag
  # to a real file) are each exclusive to their own single scenario — see statusesTagsCatalog
  # .steps.ts's doc comment for why sharing one physical file's status/tags field across multiple
  # scenarios is unsafe once uniquely-named catalog rows are involved (unlike a custom tab, which
  # is its own independent row — two scenarios both writing a DIFFERENT status value onto the
  # SAME file's one `status` column cannot both "win").
  Background:
    Given I open the app

  Scenario: Opening the panel shows the seeded default statuses, but never the built-in Unknown sentinel
    When I open the statuses and tags panel
    Then I should not see the built-in Unknown status in the panel
    And I should see the default status "Draft" with edit and delete controls in the panel
    And I should see the default status "Need Mixing" with edit and delete controls in the panel
    And I should see the default status "Done" with edit and delete controls in the panel
    And I should see the default status "Released" with edit and delete controls in the panel

  Scenario: Creating a new status makes it available in the panel and the Files status filter
    When I open the statuses and tags panel
    And I create a new status named "Statuses Tags E2E Filter Status" with color "#22aa88"
    Then I should see my status "Statuses Tags E2E Filter Status" in the panel
    When I switch to the "Audio Files" tab
    Then I should see my status "Statuses Tags E2E Filter Status" as an option in the Files status filter

  Scenario: Assigning a custom status to a file, then deleting it, reassigns the file to Unknown
    Given I switch to the "Audio Files" tab
    And I search files for "Statuses Tags E2E Status Assign"
    When I open the statuses and tags panel
    And I create a new status named "Statuses Tags E2E Assign Status" with color "#4488ff"
    And I close the statuses and tags panel
    And I open the file detail panel for "Statuses Tags E2E Status Assign.wav"
    And I set the file status to my status "Statuses Tags E2E Assign Status"
    Then the file detail panel should show my status "Statuses Tags E2E Assign Status"
    When I close the file detail panel
    Then I should see my status "Statuses Tags E2E Assign Status" as an option in the Files status filter
    When I open the statuses and tags panel
    And I click the delete button for my status "Statuses Tags E2E Assign Status"
    And I confirm deleting my status "Statuses Tags E2E Assign Status"
    Then I should not see my status "Statuses Tags E2E Assign Status" in the panel
    And I should not see my status "Statuses Tags E2E Assign Status" as an option in the Files status filter
    When I close the statuses and tags panel
    And I open the file detail panel for "Statuses Tags E2E Status Assign.wav"
    Then the file detail panel should show status "Unknown"

  Scenario: Editing a status's name and color updates its badge everywhere it's shown
    Given I switch to the "Audio Files" tab
    And I search files for "Statuses Tags E2E Status Edit"
    When I open the statuses and tags panel
    And I create a new status named "Statuses Tags E2E Edit Status" with color "#886644"
    And I close the statuses and tags panel
    And I open the file detail panel for "Statuses Tags E2E Status Edit.wav"
    And I set the file status to my status "Statuses Tags E2E Edit Status"
    Then the file detail panel should show my status "Statuses Tags E2E Edit Status"
    When I close the file detail panel
    And I open the statuses and tags panel
    And I rename my status "Statuses Tags E2E Edit Status" to "Statuses Tags E2E Edited Name" with color "#00ffcc"
    Then I should see my status "Statuses Tags E2E Edit Status" in the panel
    When I close the statuses and tags panel
    And I open the file detail panel for "Statuses Tags E2E Status Edit.wav"
    Then the file detail panel should show my status "Statuses Tags E2E Edit Status"
    And the file detail panel's status badge for "Statuses Tags E2E Edit Status" should have color "#00ffcc"

  Scenario: Cancelling adding or deleting a status leaves the catalog unchanged
    When I open the statuses and tags panel
    And I create a new status named "Statuses Tags E2E Cancel Status" with color "#123abc"
    Then I should see my status "Statuses Tags E2E Cancel Status" in the panel
    When I click the delete button for my status "Statuses Tags E2E Cancel Status"
    Then I should see the delete confirmation for my status "Statuses Tags E2E Cancel Status"
    When I cancel the delete status confirmation
    Then I should see my status "Statuses Tags E2E Cancel Status" in the panel
    When I start creating a status named "Statuses Tags E2E Cancel New Status" then cancel
    Then the cancelled status should not appear in the panel

  Scenario: Creating a tag, assigning it to a file, then deleting it removes the tag everywhere
    Given I switch to the "Audio Files" tab
    And I search files for "Statuses Tags E2E Tag Assign"
    When I open the statuses and tags panel
    And I create a new tag named "Statuses Tags E2E Assign Tag"
    Then I should see my tag "Statuses Tags E2E Assign Tag" in the panel
    When I close the statuses and tags panel
    And I open the file detail panel for "Statuses Tags E2E Tag Assign.wav"
    And I assign my tag "Statuses Tags E2E Assign Tag" to the open file via its tag editor
    Then the file detail panel should show my tag "Statuses Tags E2E Assign Tag"
    When I close the file detail panel
    And I open the statuses and tags panel
    And I click the delete button for my tag "Statuses Tags E2E Assign Tag"
    And I confirm deleting my tag "Statuses Tags E2E Assign Tag"
    Then I should not see my tag "Statuses Tags E2E Assign Tag" in the panel
    When I close the statuses and tags panel
    And I open the file detail panel for "Statuses Tags E2E Tag Assign.wav"
    Then the file detail panel should not show my tag "Statuses Tags E2E Assign Tag"

  Scenario: Renaming a tag that's applied to a file updates the tag's name on that file
    Given I switch to the "Audio Files" tab
    And I search files for "Statuses Tags E2E Tag Rename"
    When I open the statuses and tags panel
    And I create a new tag named "Statuses Tags E2E Rename Tag"
    When I close the statuses and tags panel
    And I open the file detail panel for "Statuses Tags E2E Tag Rename.wav"
    And I assign my tag "Statuses Tags E2E Rename Tag" to the open file via its tag editor
    Then the file detail panel should show my tag "Statuses Tags E2E Rename Tag"
    When I close the file detail panel
    And I open the statuses and tags panel
    And I rename my tag "Statuses Tags E2E Rename Tag" to "Statuses Tags E2E Renamed Tag"
    When I close the statuses and tags panel
    And I open the file detail panel for "Statuses Tags E2E Tag Rename.wav"
    Then the file detail panel should show my tag "Statuses Tags E2E Rename Tag"

  Scenario: Cancelling adding or deleting a tag leaves the catalog unchanged
    When I open the statuses and tags panel
    And I create a new tag named "Statuses Tags E2E Cancel Tag"
    Then I should see my tag "Statuses Tags E2E Cancel Tag" in the panel
    When I click the delete button for my tag "Statuses Tags E2E Cancel Tag"
    Then I should see the delete confirmation for my tag "Statuses Tags E2E Cancel Tag"
    When I cancel the delete tag confirmation
    Then I should see my tag "Statuses Tags E2E Cancel Tag" in the panel
    When I start creating a tag named "Statuses Tags E2E Cancel New Tag" then cancel
    Then the cancelled tag should not appear in the panel
