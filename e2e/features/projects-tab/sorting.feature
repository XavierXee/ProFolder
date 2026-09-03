Feature: Projects tab sorting

  # Scoped to the 3 "Projects E2E Sort *" fixtures via a search for "Projects E2E Sort" — the
  # only fixtures in the shared scratch DB whose name contains that substring (see
  # ALL_PROJECTS_E2E_FIXTURES in projects.steps.ts). Their `contentModifiedAt` is stamped
  # deterministically by globalSetup.ts (Oldest = 2020-01-01, Middle = 2020-12-31,
  # Newest = 2021-12-31) so sort order here depends on that fixed timestamp, not on scan/copy
  # order or wall-clock time.
  Background:
    Given I open the app
    And I switch to the "Project Folders" tab
    And I search projects for "Projects E2E Sort"

  Scenario: The Sort button's first click sorts by Modified ascending (oldest first)
    When I click the projects sort button
    Then I should see these projects in this order: "Projects E2E Sort Oldest, Projects E2E Sort Middle, Projects E2E Sort Newest"
    And the projects sort button should indicate ascending order

  Scenario: Clicking the Sort button again toggles to descending (newest first)
    When I click the projects sort button
    And I click the projects sort button
    Then I should see these projects in this order: "Projects E2E Sort Newest, Projects E2E Sort Middle, Projects E2E Sort Oldest"
    And the projects sort button should indicate descending order
