@mode:serial
Feature: Audio Files tab sorting

  # FileTable.tsx has FOUR independently-sortable columns — Track / File (sortBy=name), Score
  # (sortBy=score), Location (sortBy=folder), and Modified (sortBy=modifiedAt) — see the SortTh
  # usages in FileTable.tsx. Each scenario below scopes its search to just the one fixture group
  # that column's sort key was built to exercise:
  #
  #   - "Files E2E NameSort" -> the 3 "Files E2E NameSort/{alpha,bravo,charlie}-name.wav" fixtures
  #     (same folder, distinct filenames) for the Track / File column.
  #   - "Files E2E FolderSort" -> the 3 "Files E2E FolderSort {A,B,C}/file.wav" fixtures (same
  #     filename, distinct folders) for the Location column. Because all three share the filename
  #     "file.wav", the by-name presence/absence pattern from filtering.feature can't disambiguate
  #     them, so these scenarios check the row *count* instead, and order-check by each row's
  #     folder text (its distinguishing feature) rather than by filename.
  #   - "Files E2E Sort" -> the 3 loose "Files E2E Sort {Oldest,Middle,Newest}.wav" fixtures for
  #     the Modified column. Their mtimes are stamped deterministically by globalSetup.ts's
  #     `stampFileSortFixtureTimestamps` (Oldest = 2020-01-01, Middle = 2020-12-31,
  #     Newest = 2021-12-31), reusing the same `SORT_FIXTURE_OFFSET_BY_SUFFIX` constant the
  #     Projects-tab sort fixtures use — so sort order here depends on that fixed timestamp, not
  #     on scan/copy order or wall-clock time.
  #   - "Files E2E ScoreSort" -> the 3 loose "Files E2E ScoreSort {Low,Mid,High}.wav" fixtures for
  #     the Score column. Score isn't scan-derived, so these get their scores (1/3/5) set at
  #     runtime via the existing "file ... has status ..., score ..." step instead of a mtime
  #     stamp — both scenarios below set the SAME target scores on the SAME 3 fixtures, so their
  #     writes are idempotent regardless of which of the two runs (or re-seeds) lands last.
  #
  # These four search terms are mutually exclusive substrings of each other's fixture paths (e.g.
  # "Files E2E FolderSort A/file.wav" does NOT contain "Files E2E Sort" as a contiguous substring
  # — "E2E " is followed by "Folder", not "Sort" — and likewise for "Files E2E NameSort"/"Files E2E
  # ScoreSort"), so each scenario's search only ever pulls in its own 3 fixtures despite sharing
  # the "Files E2E" prefix.
  #
  # All eight scenarios below cover ascending AND descending for all four columns since the
  # per-column `sortButton`/order-check helpers (now shared with the Projects tab — see
  # common.steps.ts) make each additional pair cheap. `@mode:serial` (added in Task 8 alongside
  # the new Score scenarios) serializes every scenario in this file so the Score scenarios' own
  # per-scenario PATCHes never interleave with each other under parallel execution — see
  # projects-tab/sorting.feature's equivalent comment for the fuller rationale.
  Background:
    Given I open the app
    And I switch to the "Audio Files" tab

  Scenario: The Track / File column's first click sorts by name ascending
    When I search files for "Files E2E NameSort"
    And I click the "Track / File" sort button
    Then I should see only these files in the table: "alpha-name.wav, bravo-name.wav, charlie-name.wav"
    And I should see these files in this order: "alpha-name.wav, bravo-name.wav, charlie-name.wav"
    And the "Track / File" sort button should indicate ascending order

  Scenario: Clicking the Track / File column again toggles to descending
    When I search files for "Files E2E NameSort"
    And I click the "Track / File" sort button
    And I click the "Track / File" sort button
    Then I should see these files in this order: "charlie-name.wav, bravo-name.wav, alpha-name.wav"
    And the "Track / File" sort button should indicate descending order

  Scenario: The Location column's first click sorts by folder ascending
    When I search files for "Files E2E FolderSort"
    And I click the "Location" sort button
    Then I should see exactly 3 files in the table
    And I should see these files in this order: "Files E2E FolderSort A, Files E2E FolderSort B, Files E2E FolderSort C"
    And the "Location" sort button should indicate ascending order

  Scenario: Clicking the Location column again toggles to descending
    When I search files for "Files E2E FolderSort"
    And I click the "Location" sort button
    And I click the "Location" sort button
    Then I should see exactly 3 files in the table
    And I should see these files in this order: "Files E2E FolderSort C, Files E2E FolderSort B, Files E2E FolderSort A"
    And the "Location" sort button should indicate descending order

  Scenario: The Modified column's first click sorts by modified date ascending (oldest first)
    When I search files for "Files E2E Sort"
    And I click the "Modified" sort button
    Then I should see only these files in the table: "Files E2E Sort Oldest.wav, Files E2E Sort Middle.wav, Files E2E Sort Newest.wav"
    And I should see these files in this order: "Files E2E Sort Oldest.wav, Files E2E Sort Middle.wav, Files E2E Sort Newest.wav"
    And the "Modified" sort button should indicate ascending order

  Scenario: Clicking the Modified column again toggles to descending (newest first)
    When I search files for "Files E2E Sort"
    And I click the "Modified" sort button
    And I click the "Modified" sort button
    Then I should see these files in this order: "Files E2E Sort Newest.wav, Files E2E Sort Middle.wav, Files E2E Sort Oldest.wav"
    And the "Modified" sort button should indicate descending order

  Scenario: The Score column's first click sorts by score ascending
    Given file "Files E2E ScoreSort Low.wav" has status "unknown", score 1, and tags ""
    And file "Files E2E ScoreSort Mid.wav" has status "unknown", score 3, and tags ""
    And file "Files E2E ScoreSort High.wav" has status "unknown", score 5, and tags ""
    When I search files for "Files E2E ScoreSort"
    And I click the "Score" sort button
    Then I should see only these files in the table: "Files E2E ScoreSort Low.wav, Files E2E ScoreSort Mid.wav, Files E2E ScoreSort High.wav"
    And I should see these files in this order: "Files E2E ScoreSort Low.wav, Files E2E ScoreSort Mid.wav, Files E2E ScoreSort High.wav"
    And the "Score" sort button should indicate ascending order

  Scenario: Clicking the Score column again toggles to descending
    Given file "Files E2E ScoreSort Low.wav" has status "unknown", score 1, and tags ""
    And file "Files E2E ScoreSort Mid.wav" has status "unknown", score 3, and tags ""
    And file "Files E2E ScoreSort High.wav" has status "unknown", score 5, and tags ""
    When I search files for "Files E2E ScoreSort"
    And I click the "Score" sort button
    And I click the "Score" sort button
    Then I should see these files in this order: "Files E2E ScoreSort High.wav, Files E2E ScoreSort Mid.wav, Files E2E ScoreSort Low.wav"
    And the "Score" sort button should indicate descending order
