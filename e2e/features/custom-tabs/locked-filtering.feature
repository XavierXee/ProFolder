@custom-tabs @mode:serial
Feature: Custom tabs — locked filter + live search/sort

  # See the doc comment at the top of customTabs.steps.ts for the unique-naming/self-cleanup
  # hazard reasoning shared with create-and-delete.feature.
  #
  # Background reuses "Files E2E"/"Projects E2E ..." fixtures and re-seeds the exact same
  # status/score/tag values files-tab/filtering.feature's own Background sets on them — safe
  # because every writer (including that other file's own concurrently-running scenarios) always
  # sets the identical values, so this doesn't race. The cascade scenario below is the one
  # exception: it uses a dedicated "Custom Tabs E2E Cascade" fixture (added alongside this file —
  # see customTabs.steps.ts's doc comment for why every other DAW-linked audio fixture already in
  # this repo turned out to be unsafe to reuse for a tag-edit assertion).
  Background:
    Given file "alpha-take.wav" has status "draft", score 3, and tags "mix, alpha"
    And file "beta-mix.wav" has status "needs_mixing", score 5, and tags "master"
    And file "gamma-idea.wav" has status "released", score 1, and tags "alpha, demo"
    And I open the app

  Scenario: Locked filter controls are hidden but search and sort remain live
    When I create a custom tab of type "Audio Files" named "Custom Tabs E2E Locked Controls" with status filter "Draft"
    Then I should not see a "Status" filter control
    And I should not see a "Score" filter control
    And I should not see a "Tags" filter control
    When I search files for "alpha-take"
    Then I should see file "alpha-take.wav" in the table
    When I click the custom tab sort button
    Then the custom tab sort button should indicate active sort

  Scenario: Typing a search term further narrows the already-locked result set
    When I create a custom tab of type "Audio Files" named "Custom Tabs E2E Locked Search" with tag filter "alpha"
    Then I should see file "alpha-take.wav" in the table
    And I should see file "gamma-idea.wav" in the table
    And I should not see file "beta-mix.wav" in the table
    When I search files for "alpha-take"
    Then I should see file "alpha-take.wav" in the table
    And I should not see file "gamma-idea.wav" in the table

  Scenario: Switching away from a custom tab and back resets live search and sort
    When I create a custom tab of type "Audio Files" named "Custom Tabs E2E Locked Remount" with status filter "Draft"
    And I search files for "alpha-take"
    And I click the custom tab sort button
    Then the custom tab sort button should indicate active sort
    When I switch to the "Project Folders" tab
    And I switch to my custom tab "Custom Tabs E2E Locked Remount"
    Then the custom tab search box should be empty
    And the custom tab sort button should not indicate active sort

  # "Custom Tabs E2E Cascade/cascade-check.wav" is a dedicated fixture (DAW marker
  # "marker.als" + one audio file) used by no other feature file — see customTabs.steps.ts's
  # top doc comment for the full reasoning, including two dead ends found empirically (a tag
  # edit, and a naive score click) before landing on "I ensure the file score is {int}" below.
  Scenario: Editing a file's score inside a custom Files tab cascades onto its parent project
    When I create a custom tab of type "Audio Files" named "Custom Tabs E2E Locked Cascade" with no filter
    And I search files for "cascade-check"
    Then I should see file "cascade-check.wav" in the table
    When I open the file detail panel for "cascade-check.wav"
    And I ensure the file score is 4
    And I close the file detail panel
    And I switch to the "Project Folders" tab
    And I search projects for "Custom Tabs E2E Cascade"
    Then the projects table row for "Custom Tabs E2E Cascade" should show score 4
