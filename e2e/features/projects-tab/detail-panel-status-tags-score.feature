Feature: Projects tab detail panel — status, score, and tags edit-and-persist

  # "Projects E2E DetailPanel Session" and "Projects E2E Cascade Session" are the two fixtures
  # reserved for this file (see Task 4.2's fixture list / ALL_PROJECTS_E2E_FIXTURES in
  # projects.steps.ts) — every other "Projects E2E ..." fixture is owned by filtering.feature or
  # sorting.feature and is deliberately left untouched here.
  #
  # No shared Background: unlike filtering.feature (where every scenario needs the exact same
  # seeded fixtures), only some scenarios below need API seeding, and it must happen *before*
  # "I open the app" (the app fetches its all-tags dictionary once on mount — see the tag-
  # suggestion scenario). So each scenario spells out its own steps in full rather than forcing
  # unrelated scenarios through a shared Background just for the ones that need seeding.
  #
  # Persistence is proved with "I reload the page" (a real browser reload — fresh mount, fresh
  # fetch from the server) rather than just closing and reopening the panel client-side, so a
  # save that only updated optimistic UI state without actually reaching the DB would be caught.

  Scenario: Clicking a folder's row opens its detail panel
    Given I open the app
    And I switch to the "Project Folders" tab
    When I open the folder detail panel for "Projects E2E DetailPanel Session"
    Then I should see the folder detail panel for "Projects E2E DetailPanel Session"

  Scenario: Editing status via the detail panel persists after reload
    Given I open the app
    And I switch to the "Project Folders" tab
    When I open the folder detail panel for "Projects E2E DetailPanel Session"
    And I set the folder status to "Done"
    Then the folder detail panel should show status "Done"
    And the projects table row for "Projects E2E DetailPanel Session" should show status "Done"
    When I reload the page
    And I switch to the "Project Folders" tab
    And I open the folder detail panel for "Projects E2E DetailPanel Session"
    Then the folder detail panel should show status "Done"

  Scenario: Editing score via the detail panel persists after reload
    Given I open the app
    And I switch to the "Project Folders" tab
    When I open the folder detail panel for "Projects E2E DetailPanel Session"
    And I set the folder score to 4
    Then the folder detail panel should show score 4
    And the projects table row for "Projects E2E DetailPanel Session" should show score 4
    When I reload the page
    And I switch to the "Project Folders" tab
    And I open the folder detail panel for "Projects E2E DetailPanel Session"
    Then the folder detail panel should show score 4

  # The suggestion-source tag is seeded onto "Projects E2E DetailPanel Session" itself and then
  # immediately cleared again: setting a project's tags to [] only deletes its `project_tags`
  # join rows, not the `tags` dictionary row itself (see setTags in projectRepository.ts), so
  # "detailpanel-suggestion-seed" stays available as a global suggestion afterwards even though
  # this project no longer has it applied — which is required for it to show up as a *suggestion*
  # (TagEditor excludes tags the current item already has — see TagEditor.tsx's `suggestions`).
  # This is deliberately self-contained (not relying on filtering.feature's "alpha"/"mix"/
  # "master"/"demo" tags already existing) — this suite runs with `fullyParallel: true` and no
  # workers/order guarantee, so which spec file's Background has run first by the time this
  # scenario's own "I open the app" fires its all-tags fetch is not something to depend on.
  Scenario: Adding a tag via free text and via an autocomplete suggestion both persist
    Given project "Projects E2E DetailPanel Session" has tags "detailpanel-suggestion-seed"
    And project "Projects E2E DetailPanel Session" has tags ""
    And I open the app
    And I switch to the "Project Folders" tab
    When I open the folder detail panel for "Projects E2E DetailPanel Session"
    And I type "freetext-tag" into the folder tag input and press Enter
    And I type "suggestion" into the folder tag input and select the suggestion "detailpanel-suggestion-seed"
    Then the folder detail panel should show exactly these tags: "freetext-tag, detailpanel-suggestion-seed"
    When I reload the page
    And I switch to the "Project Folders" tab
    And I open the folder detail panel for "Projects E2E DetailPanel Session"
    Then the folder detail panel should show exactly these tags: "freetext-tag, detailpanel-suggestion-seed"
    And the projects table row for "Projects E2E DetailPanel Session" should show tags "freetext-tag, detailpanel-suggestion-seed"

  # "Projects E2E Cascade Session" has 2 audio files: cascade-take-1.wav and cascade-take-2.wav.
  # cascade-take-1.wav is pre-seeded (via a direct file-level API call, not the UI) with its own
  # tag before anything touches the project, so this proves the *union* semantics of
  # cascadeProjectTagsToFiles/addTagsToFiles (see linkSync.ts) end-to-end through the real UI:
  # editing the project's score/tags overwrites every file's score and *adds* the project's tags
  # onto each file, without ever wiping a tag a file already had of its own.
  #
  # This is also the scenario the Architect flagged as covering something the backend tests
  # (tests/linkSync.test.ts) don't: the frontend's refetch()-after-cascade wiring in App.tsx's
  # handleProjectScoreSave/handleProjectTagsSave. Without that refetch() call, the Audio Files
  # tab's `files` state would still hold pre-cascade data even though the cascade itself
  # succeeded server-side — which is exactly what switching tabs and reading the files' rows
  # below (rather than re-asserting through the Projects tab) is positioned to catch.
  Scenario: Editing a project's score and tags cascades onto its files without wiping a file's own tag
    Given file "cascade-take-1.wav" has tag "take1-own-tag"
    And I open the app
    And I switch to the "Project Folders" tab
    When I open the folder detail panel for "Projects E2E Cascade Session"
    And I set the folder score to 4
    And I type "cascade-project-tag" into the folder tag input and press Enter
    And I close the folder detail panel
    And I switch to the "Audio Files" tab
    And I search files for "cascade-take-1"
    Then the file "cascade-take-1.wav" row should show score 4
    And the file "cascade-take-1.wav" row should have tag "cascade-project-tag"
    And the file "cascade-take-1.wav" row should have tag "take1-own-tag"
    When I search files for "cascade-take-2"
    Then the file "cascade-take-2.wav" row should show score 4
    And the file "cascade-take-2.wav" row should have tag "cascade-project-tag"
