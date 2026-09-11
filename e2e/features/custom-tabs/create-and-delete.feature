@custom-tabs @mode:serial
Feature: Custom tabs — create and delete

  # See the doc comment at the top of customTabs.steps.ts for the cross-worker/`--repeat-each`
  # hazard this file's scenarios (and its step definitions) are deliberately designed around:
  # every custom tab created below gets a random suffix appended to its given name so concurrent
  # repeats of the same scenario (across different Playwright workers) never collide over one
  # shared tab-bar row, and every scenario only ever asserts things about its OWN uniquely-named
  # tab — never the tab bar's total count or position among every tab any other scenario/file may
  # currently have open.
  #
  # Background reuses "Files E2E"/"Projects E2E ..." fixtures and re-seeds the exact same
  # status/score/tag values files-tab/filtering.feature's and projects-tab/filtering.feature's own
  # Backgrounds set on them — safe because every writer (including those other files' own
  # concurrently-running scenarios) always sets the identical values, so this doesn't race.
  Background:
    Given file "alpha-take.wav" has status "draft", score 3, and tags "mix, alpha"
    And file "beta-mix.wav" has status "needs_mixing", score 5, and tags "master"
    And project "Projects E2E Alpha Sessions" has status "draft", score 3, and tags "mix, alpha"
    And project "Projects E2E Beta Session" has status "needs_mixing", score 5, and tags "master"
    And I open the app

  Scenario: Creating a Files-type custom tab with a locked status filter shows only matching files
    When I create a custom tab of type "Audio Files" named "Custom Tabs E2E Files Draft" with status filter "Draft"
    Then I should see my custom tab "Custom Tabs E2E Files Draft" in the tab bar
    And my custom tab "Custom Tabs E2E Files Draft" should be the active tab
    And I should see file "alpha-take.wav" in the table
    And I should not see file "beta-mix.wav" in the table

  Scenario: Creating a Projects-type custom tab with a locked status filter shows only matching projects
    When I create a custom tab of type "Project Folders" named "Custom Tabs E2E Projects Draft" with status filter "Draft"
    Then I should see my custom tab "Custom Tabs E2E Projects Draft" in the tab bar
    And my custom tab "Custom Tabs E2E Projects Draft" should be the active tab
    And I should see project "Projects E2E Alpha Sessions" in the table
    And I should not see project "Projects E2E Beta Session" in the table

  Scenario: Creating several custom tabs keeps every one of them present in the tab bar at once
    When I create a custom tab of type "Audio Files" named "Custom Tabs E2E Multi A" with no filter
    And I create a custom tab of type "Project Folders" named "Custom Tabs E2E Multi B" with no filter
    And I create a custom tab of type "Audio Files" named "Custom Tabs E2E Multi C" with no filter
    Then I should see my custom tab "Custom Tabs E2E Multi A" in the tab bar
    And I should see my custom tab "Custom Tabs E2E Multi B" in the tab bar
    And I should see my custom tab "Custom Tabs E2E Multi C" in the tab bar
    And my custom tab "Custom Tabs E2E Multi C" should be the active tab

  Scenario: Cancelling the delete confirmation leaves the tab in place
    Given I create a custom tab of type "Audio Files" named "Custom Tabs E2E Delete Cancel" with no filter
    When I click the delete button for my custom tab "Custom Tabs E2E Delete Cancel"
    Then I should see the delete confirmation for my custom tab "Custom Tabs E2E Delete Cancel"
    When I cancel the delete confirmation
    Then I should see my custom tab "Custom Tabs E2E Delete Cancel" in the tab bar

  Scenario: Confirming the delete removes the tab and falls back to Project Folders when it was active
    Given I create a custom tab of type "Audio Files" named "Custom Tabs E2E Delete Confirm" with no filter
    Then my custom tab "Custom Tabs E2E Delete Confirm" should be the active tab
    When I click the delete button for my custom tab "Custom Tabs E2E Delete Confirm"
    And I confirm deleting my custom tab "Custom Tabs E2E Delete Confirm"
    Then I should not see my custom tab "Custom Tabs E2E Delete Confirm" in the tab bar
    And the "Project Folders" tab should be the active tab
