Feature: Audio Files tab filtering

  # Fixture state seeded via direct API PATCH calls in the Background below (not UI clicks —
  # see the doc comment atop files.steps.ts for why). "delta-untouched.wav" is deliberately left
  # unseeded (stays at scan defaults: status unknown, score null, no tags) so it can serve as the
  # negative case every scenario below must correctly exclude. Seeding happens before "I open the
  # app": the app fetches its all-tags list (which backs the Tags filter dropdown's options) once
  # on mount, so seeding first guarantees "alpha"/"mix"/"master"/"demo" already exist in the DB by
  # the time that fetch fires.
  Background:
    Given file "alpha-take.wav" has status "draft", score 3, and tags "mix, alpha"
    And file "beta-mix.wav" has status "needs_mixing", score 5, and tags "master"
    And file "gamma-idea.wav" has status "released", score 1, and tags "alpha, demo"
    And I open the app
    And I switch to the "Audio Files" tab

  Scenario: Searching by name shows only the matching file
    When I search files for "alpha-take"
    Then I should see only these files in the table: "alpha-take.wav"

  Scenario: Filtering by status shows only files with that status
    When I search files for "Files E2E"
    And I filter files by status "Draft"
    Then I should see only these files in the table: "alpha-take.wav"
    And I should see the file result count "1 of 1 files"

  Scenario: Filtering by an exact score shows only files with that score
    When I search files for "Files E2E"
    And I filter files by score "5"
    Then I should see only these files in the table: "beta-mix.wav"

  Scenario: Filtering by the Unscored bucket excludes every file with a score set
    When I search files for "Files E2E"
    And I filter files by score "Unscored"
    Then I should see file "delta-untouched.wav" in the table
    And I should not see file "alpha-take.wav" in the table
    And I should not see file "beta-mix.wav" in the table
    And I should not see file "gamma-idea.wav" in the table

  Scenario: Filtering by a tag shows every file that has that tag
    When I search files for "Files E2E"
    And I filter files by tag "alpha"
    Then I should see only these files in the table: "alpha-take.wav, gamma-idea.wav"

  Scenario: Combining a status filter and a tag filter requires both to match
    When I search files for "Files E2E"
    And I filter files by status "Released"
    And I filter files by tag "alpha"
    Then I should see only these files in the table: "gamma-idea.wav"

  Scenario: Clearing all filters restores every file that was filtered out
    When I search files for "Files E2E"
    And I filter files by status "Draft"
    Then I should see only these files in the table: "alpha-take.wav"
    When I clear all file filters
    And I search files for "Files E2E"
    Then I should see file "alpha-take.wav" in the table
    And I should see file "beta-mix.wav" in the table
    And I should see file "gamma-idea.wav" in the table
    And I should see file "delta-untouched.wav" in the table

  # Unlike ProjectsTable.tsx (two empty-state messages, picked by filtered `total` — see the
  # comment on the Projects-tab equivalent scenario), FileTable.tsx renders EmptyState.tsx
  # unconditionally whenever the current page has zero rows, with a single fixed message. No
  # total-based branching to reason about here — any zero-result search reaches it the same way.
  Scenario: Searching for a term matching nothing shows an empty-results message
    When I search files for "Files E2E Nonexistent Zzz"
    Then I should see the files empty-results message
