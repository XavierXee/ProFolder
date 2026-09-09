@mode:serial
Feature: Projects tab batch edit — selection mechanics and batch score/tag cascade

  # `@mode:serial` (playwright-bdd's special tag, generates `test.describe.configure({ mode:
  # "serial" })` for this whole file — see SpecialTags in playwright-bdd) is required here, unlike
  # every other feature file in this suite: Playwright's default `fullyParallel: true` runs
  # scenarios in the same spec across separate workers concurrently, and several scenarios below
  # deliberately mutate the SAME 3 shared fixtures' score with DIFFERENT target values (4 vs 5).
  # Without serial mode, two such scenarios can genuinely interleave their PATCH requests against
  # the same project rows (confirmed while writing this file: the score-cascade scenario failed
  # intermittently because a concurrently-running scenario's score-5 batch edit landed on
  # "Charlie" mid-assertion) — each scenario's own self-contained `Given` re-seeding only protects
  # against *ordering* assumptions, not true concurrent writes to the same row.
  #
  # "Batch E2E Projects Alpha/Bravo/Charlie" are this file's 3 fixtures (see
  # ALL_PROJECTS_E2E_FIXTURES in projects.steps.ts / ALL_FILES_E2E_FIXTURES in files.steps.ts for
  # their registration in both tabs' isolation lists), each with one audio file
  # (alpha-cascade.wav / bravo-cascade.wav / charlie-cascade.wav) for the cascade scenario below.
  # Every scenario searches "Batch E2E Projects" first to scope the table to just these 3, per
  # this suite's usual convention.
  #
  # All 7 scenarios below share these same 3 fixtures rather than getting one set each — that's
  # deliberate (the Architect's design, not a shortcut): each scenario re-seeds via API `Given`
  # calls whatever score/tag state it depends on before asserting on it, and a fresh
  # `page.goto("/")` per scenario (via "I open the app") resets all client-side selection state
  # regardless of what a previous scenario left selected. No scenario here relies on another
  # scenario's leftover mutation — every scenario that cares about a specific score/tag starting
  # point seeds it explicitly, even where that means re-doing what an earlier scenario's own edit
  # already produced. That said, these scenarios are NOT safe to run individually out of order
  # without their own seeding (e.g. running only "should show no score" from scenario 2 without
  # its own Background — there is none, each scenario is self-contained top to bottom).
  #
  # No shared Background, mirroring detail-panel-status-tags-score.feature: only some scenarios
  # need API seeding, and it must happen before "I open the app" (the all-tags dictionary is
  # fetched once on mount).

  Scenario: Batch Edit is disabled below 2 selected rows, enabled at 2 or more
    Given I open the app
    And I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Projects"
    Then the batch edit button should be disabled
    When I select project folder "Batch E2E Projects Alpha"
    Then the batch edit button should be disabled
    When I select project folder "Batch E2E Projects Bravo"
    Then the batch edit button should be enabled

  Scenario: Batch-setting a score only applies to the selected rows, not an unselected one
    Given project "Batch E2E Projects Alpha" has no score
    And project "Batch E2E Projects Bravo" has no score
    And project "Batch E2E Projects Charlie" has no score
    And I open the app
    And I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Projects"
    When I select project folder "Batch E2E Projects Alpha"
    And I select project folder "Batch E2E Projects Bravo"
    And I open the "project folders" batch edit panel
    And I set the batch score to 4 in the "project folders" batch edit panel
    And I close the "project folders" batch edit panel
    Then the projects table row for "Batch E2E Projects Alpha" should show score 4
    And the projects table row for "Batch E2E Projects Bravo" should show score 4
    And the projects table row for "Batch E2E Projects Charlie" should show no score

  # Alpha starts with its own pre-existing tag; Bravo starts with none. Bravo ending up with just
  # "batch-ready" and Alpha ending up with BOTH tags is what proves batch tag application is a
  # union (addTagsToProjects — see linkSync.ts / projectRepository.ts), not a replace.
  Scenario: Batch-adding a tag unions onto each selected row's existing tags rather than replacing them
    Given project "Batch E2E Projects Alpha" has tags "preexisting"
    And project "Batch E2E Projects Bravo" has tags ""
    And I open the app
    And I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Projects"
    When I select project folder "Batch E2E Projects Alpha"
    And I select project folder "Batch E2E Projects Bravo"
    And I open the "project folders" batch edit panel
    And I add the batch tag "batch-ready" in the "project folders" batch edit panel
    And I close the "project folders" batch edit panel
    Then the projects table row for "Batch E2E Projects Alpha" should show tags "preexisting, batch-ready"
    And the projects table row for "Batch E2E Projects Bravo" should show tags "batch-ready"

  # Self-contained repeat of the batch-score edit (rather than depending on the previous
  # scenario's mutation having already run — see this file's own Background-less rationale
  # above), so this scenario alone proves the batch route's per-id
  # `cascadeProjectScoreToFiles` loop (src/api/routes/projects.ts) actually reaches each
  # selected project's files, and does NOT reach an unselected project's files.
  Scenario: Batch-setting a project's score cascades onto its files, but not an unselected project's files
    Given project "Batch E2E Projects Alpha" has no score
    And project "Batch E2E Projects Bravo" has no score
    And project "Batch E2E Projects Charlie" has no score
    And I open the app
    And I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Projects"
    When I select project folder "Batch E2E Projects Alpha"
    And I select project folder "Batch E2E Projects Bravo"
    And I open the "project folders" batch edit panel
    And I set the batch score to 4 in the "project folders" batch edit panel
    And I close the "project folders" batch edit panel
    And I switch to the "Audio Files" tab
    And I search files for "Batch E2E Projects"
    Then the file "alpha-cascade.wav" row should show score 4
    And the file "bravo-cascade.wav" row should show score 4
    And the file "charlie-cascade.wav" row should show no score

  # Sibling of the score-cascade scenario above, same self-contained rationale: proves the batch
  # route's per-id `cascadeProjectTagsToFiles` loop (src/api/routes/projects.ts) actually reaches
  # each selected project's files, and does NOT reach an unselected project's files. The existing
  # "Batch-adding a tag unions..." scenario above only ever asserts the Projects tab table rows —
  # it never switches to the Audio Files tab, so it can't tell the difference between the batch
  # route's own file-cascade working and the (separately-covered) single-project tag PATCH's own
  # cascade happening to also produce the right-looking table row. "batch-folder-tag-cascade" is a
  # scenario-unique tag string (grepped across e2e/features and e2e/support/fixtures first — see
  # this task's own notes) never touched by any other Given step in the suite, since the cascade is
  # add-only and this tag becoming permanent on Alpha/Bravo's files for the rest of the run must
  # not collide with any other scenario's search/filter/assertion.
  Scenario: Batch-adding a tag cascades onto its files, but not an unselected project's files
    Given project "Batch E2E Projects Alpha" has tags ""
    And project "Batch E2E Projects Bravo" has tags ""
    And project "Batch E2E Projects Charlie" has tags ""
    And I open the app
    And I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Projects"
    When I select project folder "Batch E2E Projects Alpha"
    And I select project folder "Batch E2E Projects Bravo"
    And I open the "project folders" batch edit panel
    And I add the batch tag "batch-folder-tag-cascade" in the "project folders" batch edit panel
    And I close the "project folders" batch edit panel
    And I switch to the "Audio Files" tab
    And I search files for "Batch E2E Projects"
    Then the file "alpha-cascade.wav" row should have tag "batch-folder-tag-cascade"
    And the file "bravo-cascade.wav" row should have tag "batch-folder-tag-cascade"
    And the file "charlie-cascade.wav" row should not have tag "batch-folder-tag-cascade"

  Scenario: The header checkbox selects every visible row, and a second click clears the selection
    Given I open the app
    And I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Projects"
    When I click the select-all project folders checkbox
    Then the select-all project folders checkbox should be checked
    And the batch edit button should read "Batch Edit (3)"
    When I click the select-all project folders checkbox
    Then the select-all project folders checkbox should not be checked
    And the batch edit button should read "Batch Edit"
    And the batch edit button should be disabled

  # Distinct from the previous scenario: that one only proves the checkbox/button *look* selected.
  # This one proves the underlying Set the header checkbox populates is what the batch PATCH
  # endpoint actually receives and acts on — Charlie (never individually clicked) ending up
  # scored too is what a purely-visual/unwired select-all could not produce.
  Scenario: The select-all checkbox's selection is what the batch endpoint actually acts on
    Given project "Batch E2E Projects Alpha" has no score
    And project "Batch E2E Projects Bravo" has no score
    And project "Batch E2E Projects Charlie" has no score
    And I open the app
    And I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Projects"
    When I click the select-all project folders checkbox
    And I open the "project folders" batch edit panel
    And I set the batch score to 5 in the "project folders" batch edit panel
    And I close the "project folders" batch edit panel
    Then the projects table row for "Batch E2E Projects Alpha" should show score 5
    And the projects table row for "Batch E2E Projects Bravo" should show score 5
    And the projects table row for "Batch E2E Projects Charlie" should show score 5

  # Covers REQUIREMENTS §9.1: selection must clear both when the active filter changes and when
  # switching tabs (handleProjectsFilterChange / handleTabChange in App.tsx).
  Scenario: Selection clears when the filter changes, and when switching tabs
    Given I open the app
    And I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Projects"
    When I select project folder "Batch E2E Projects Alpha"
    And I select project folder "Batch E2E Projects Bravo"
    Then the batch edit button should be enabled
    When I filter projects by status "Draft"
    Then the batch edit button should be disabled
    When I clear all project filters
    And I search projects for "Batch E2E Projects"
    And I select project folder "Batch E2E Projects Alpha"
    And I select project folder "Batch E2E Projects Bravo"
    Then the batch edit button should be enabled
    When I switch to the "Audio Files" tab
    And I switch to the "Project Folders" tab
    Then the batch edit button should be disabled
