Feature: Projects tab filtering

  # Fixture state seeded via direct API PATCH calls in the Background below (not UI clicks —
  # see the doc comment atop projects.steps.ts for why). "Projects E2E Delta Untouched" is
  # deliberately left unseeded (stays at scan defaults: status unknown, score null, no tags)
  # so it can serve as the negative case every scenario below must correctly exclude.
  # Seeding happens before "I open the app": the app fetches its all-tags list (which backs the
  # Tags filter dropdown's options) once on mount, so seeding first guarantees "alpha"/"mix"/
  # "master"/"demo" already exist in the DB by the time that fetch fires.
  Background:
    Given project "Projects E2E Alpha Sessions" has status "draft", score 3, and tags "mix, alpha"
    And project "Projects E2E Beta Session" has status "needs_mixing", score 5, and tags "master"
    And project "Projects E2E Gamma Idea" has status "released", score 1, and tags "alpha, demo"
    And I open the app
    And I switch to the "Project Folders" tab

  Scenario: Searching by name shows only the matching project
    When I search projects for "Projects E2E Alpha"
    Then I should see only these projects in the table: "Projects E2E Alpha Sessions"

  Scenario: Filtering by status shows only projects with that status
    When I search projects for "Projects E2E"
    And I filter projects by status "Draft"
    Then I should see only these projects in the table: "Projects E2E Alpha Sessions"
    And I should see the project result count "1 of 1 projects"

  Scenario: Filtering by an exact score shows only projects with that score
    When I search projects for "Projects E2E"
    And I filter projects by score "5"
    Then I should see only these projects in the table: "Projects E2E Beta Session"

  Scenario: Filtering by the Unscored bucket excludes every project with a score set
    When I search projects for "Projects E2E"
    And I filter projects by score "Unscored"
    Then I should see project "Projects E2E Delta Untouched" in the table
    And I should not see project "Projects E2E Alpha Sessions" in the table
    And I should not see project "Projects E2E Beta Session" in the table
    And I should not see project "Projects E2E Gamma Idea" in the table

  Scenario: Filtering by a tag shows every project that has that tag
    When I search projects for "Projects E2E"
    And I filter projects by tag "alpha"
    Then I should see only these projects in the table: "Projects E2E Alpha Sessions, Projects E2E Gamma Idea"

  Scenario: Combining a status filter and a tag filter requires both to match
    When I search projects for "Projects E2E"
    And I filter projects by status "Released"
    And I filter projects by tag "alpha"
    Then I should see only these projects in the table: "Projects E2E Gamma Idea"

  Scenario: Clearing all filters restores every project that was filtered out
    When I search projects for "Projects E2E"
    And I filter projects by status "Draft"
    Then I should see only these projects in the table: "Projects E2E Alpha Sessions"
    When I clear all project filters
    And I search projects for "Projects E2E"
    Then I should see project "Projects E2E Alpha Sessions" in the table
    And I should see project "Projects E2E Beta Session" in the table
    And I should see project "Projects E2E Gamma Idea" in the table
    And I should see project "Projects E2E Delta Untouched" in the table

  # ProjectsTable.tsx picks its empty-state message off whether a content filter (search/status/
  # score/tag) is active, not off the filtered `total` alone (docs/TODO.md item 95 — `total` is
  # already the filtered count, so it can't distinguish "empty library" from "filtered to zero").
  # A search matching zero projects IS an active filter, so this renders "No folders match your
  # filters.", not "No folders found yet."
  Scenario: Searching for a term matching nothing shows an empty-results message
    When I search projects for "Projects E2E Nonexistent Zzz"
    Then I should see the projects empty-results message
