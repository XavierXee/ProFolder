@mode:serial
Feature: Projects tab sorting

  # ProjectsTable.tsx has THREE independently-sortable columns — Project Folder (sortBy=name),
  # Score (sortBy=score), and Modified (sortBy=modifiedAt) — see the SortTh usages in
  # ProjectsTable.tsx. Each scenario below scopes its search to just the one fixture group that
  # column's sort key was built to exercise:
  #
  #   - "Projects E2E Sort" -> the 3 "Projects E2E Sort {Oldest,Middle,Newest}" fixture folders,
  #     reused for BOTH the Project Folder column (their names are already alphabetically
  #     distinct: Middle < Newest < Oldest) and the Modified column. Their `contentModifiedAt` is
  #     stamped deterministically by globalSetup.ts (Oldest = 2020-01-01, Middle = 2020-12-31,
  #     Newest = 2021-12-31) so Modified-column sort order here depends on that fixed timestamp,
  #     not on scan/copy order or wall-clock time.
  #   - "Projects E2E ScoreSort" -> the 3 "Projects E2E ScoreSort {Low,Mid,High}" fixture folders
  #     for the Score column. Score isn't scan-derived, so these get their scores (1/3/5) set at
  #     runtime via the existing "project ... has status ..., score ..." step instead of a mtime
  #     stamp — both Score scenarios below set the SAME target scores on the SAME 3 fixtures, so
  #     their writes are idempotent regardless of which of the two runs (or re-seeds) lands last.
  #
  # These two search terms are mutually exclusive substrings of each other's fixture paths (e.g.
  # "Projects E2E ScoreSort Low" does NOT contain "Projects E2E Sort" as a contiguous substring —
  # "E2E " is followed by "ScoreSort", not "Sort "), so each scenario's search only ever pulls in
  # its own 3 fixtures despite sharing the "Projects E2E" prefix.
  #
  # `@mode:serial` (added in Task 8 alongside the new Score scenarios) serializes every scenario
  # in this file so the Score scenarios' own per-scenario PATCHes never interleave with each
  # other under parallel execution — the fixed values below make an interleaving safe on its own
  # (idempotent, both scenarios target the same numbers), but per this project's established
  # e2e convention for scenarios that mutate shared fixtures, serializing rather than relying
  # on that idempotence is the safer, empirically-checked default for scenarios that mutate shared
  # fixture rows at runtime.
  Background:
    Given I open the app
    And I switch to the "Project Folders" tab

  Scenario: The Project Folder column's first click sorts by name ascending
    When I search projects for "Projects E2E Sort"
    And I click the "Project Folder" sort button
    Then I should see these projects in this order: "Projects E2E Sort Middle, Projects E2E Sort Newest, Projects E2E Sort Oldest"
    And the "Project Folder" sort button should indicate ascending order

  Scenario: Clicking the Project Folder column again toggles to descending
    When I search projects for "Projects E2E Sort"
    And I click the "Project Folder" sort button
    And I click the "Project Folder" sort button
    Then I should see these projects in this order: "Projects E2E Sort Oldest, Projects E2E Sort Newest, Projects E2E Sort Middle"
    And the "Project Folder" sort button should indicate descending order

  Scenario: The Modified column's first click sorts by modified date ascending (oldest first)
    When I search projects for "Projects E2E Sort"
    And I click the "Modified" sort button
    Then I should see these projects in this order: "Projects E2E Sort Oldest, Projects E2E Sort Middle, Projects E2E Sort Newest"
    And the "Modified" sort button should indicate ascending order

  Scenario: Clicking the Modified column again toggles to descending (newest first)
    When I search projects for "Projects E2E Sort"
    And I click the "Modified" sort button
    And I click the "Modified" sort button
    Then I should see these projects in this order: "Projects E2E Sort Newest, Projects E2E Sort Middle, Projects E2E Sort Oldest"
    And the "Modified" sort button should indicate descending order

  Scenario: The Score column's first click sorts by score ascending
    Given project "Projects E2E ScoreSort Low" has status "unknown", score 1, and tags ""
    And project "Projects E2E ScoreSort Mid" has status "unknown", score 3, and tags ""
    And project "Projects E2E ScoreSort High" has status "unknown", score 5, and tags ""
    When I search projects for "Projects E2E ScoreSort"
    And I click the "Score" sort button
    Then I should see these projects in this order: "Projects E2E ScoreSort Low, Projects E2E ScoreSort Mid, Projects E2E ScoreSort High"
    And the "Score" sort button should indicate ascending order

  Scenario: Clicking the Score column again toggles to descending
    Given project "Projects E2E ScoreSort Low" has status "unknown", score 1, and tags ""
    And project "Projects E2E ScoreSort Mid" has status "unknown", score 3, and tags ""
    And project "Projects E2E ScoreSort High" has status "unknown", score 5, and tags ""
    When I search projects for "Projects E2E ScoreSort"
    And I click the "Score" sort button
    And I click the "Score" sort button
    Then I should see these projects in this order: "Projects E2E ScoreSort High, Projects E2E ScoreSort Mid, Projects E2E ScoreSort Low"
    And the "Score" sort button should indicate descending order
