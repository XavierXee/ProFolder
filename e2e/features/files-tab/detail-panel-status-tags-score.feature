Feature: Audio Files tab detail panel — status, score, and tags edit-and-persist

  # "Files E2E DetailPanel Take.wav" is the loose top-level fixture reserved for this file (see
  # Task 5b.1's fixture and ALL_FILES_E2E_FIXTURES in files.steps.ts) — every other "Files E2E
  # ..." fixture is owned by filtering.feature or sorting.feature and is deliberately left
  # untouched here. It's left at scan defaults (status unknown, score null, no tags), so each
  # scenario below starts from a clean, unseeded row and edits it through the UI itself.
  # "Files E2E ReverseCascade Session/" (reverse-take-1.wav, reverse-take-2.wav) is a second,
  # separate fixture group reserved for this file's reverse-cascade scenario (Task 5b.3) — see
  # that scenario's own doc comment below.
  #
  # No shared Background: each scenario spells out its own steps in full, mirroring
  # projects-tab/detail-panel-status-tags-score.feature's rationale.
  #
  # Persistence is proved with "I reload the page" (a real browser reload — fresh mount, fresh
  # fetch from the server) rather than just closing and reopening the panel client-side, so a
  # save that only updated optimistic UI state without actually reaching the DB would be caught.

  Scenario: Clicking a file's row opens its detail panel
    Given I open the app
    And I switch to the "Audio Files" tab
    When I open the file detail panel for "Files E2E DetailPanel Take.wav"
    Then I should see the file detail panel for "Files E2E DetailPanel Take.wav"

  Scenario: Editing status via the detail panel persists after reload
    Given I open the app
    And I switch to the "Audio Files" tab
    When I open the file detail panel for "Files E2E DetailPanel Take.wav"
    And I set the file status to "Done"
    Then the file detail panel should show status "Done"
    When I reload the page
    And I switch to the "Audio Files" tab
    And I open the file detail panel for "Files E2E DetailPanel Take.wav"
    Then the file detail panel should show status "Done"

  Scenario: Editing score via the detail panel persists after reload
    Given I open the app
    And I switch to the "Audio Files" tab
    When I open the file detail panel for "Files E2E DetailPanel Take.wav"
    And I set the file score to 4
    Then the file detail panel should show score 4
    When I reload the page
    And I switch to the "Audio Files" tab
    And I open the file detail panel for "Files E2E DetailPanel Take.wav"
    Then the file detail panel should show score 4

  # The suggestion-source tag is seeded onto "Files E2E DetailPanel Take.wav" itself and then
  # immediately cleared again: setting a file's tags to [] only deletes its `audio_file_tags` join
  # rows, not the `tags` dictionary row itself (see setTags in audioFileRepository.ts — confirmed
  # identical semantics to projectRepository.ts's equivalent in Task 4.5), so
  # "filetag-suggestion-seed" stays available as a global suggestion afterwards even though this
  # file no longer has it applied — which is required for it to show up as a *suggestion*
  # (TagEditor excludes tags the current item already has — see TagEditor.tsx's `suggestions`).
  # Seeding happens before "I open the app" for the same reason as projects-tab's equivalent
  # scenario: the app fetches its all-tags dictionary once on mount. This is deliberately
  # self-contained (not relying on filtering.feature's tags already existing) — this suite runs
  # with `fullyParallel: true` and no workers/order guarantee, so which spec file's Background has
  # run first by the time this scenario's own "I open the app" fires its all-tags fetch is not
  # something to depend on. Both tag-adding methods are proved in a single scenario (rather than
  # two independent ones) because `fullyParallel: true` also means scenarios within this same file
  # can run concurrently — two scenarios independently mutating and then asserting "exactly these
  # tags" on the same shared fixture file would race each other; this file's status/score
  # scenarios above avoid that only because they each assert a different, unrelated field.
  Scenario: Adding a tag via free text and via an autocomplete suggestion both persist
    Given file "Files E2E DetailPanel Take.wav" has tags "filetag-suggestion-seed"
    And file "Files E2E DetailPanel Take.wav" has tags ""
    And I open the app
    And I switch to the "Audio Files" tab
    When I open the file detail panel for "Files E2E DetailPanel Take.wav"
    And I type "filetag-freetext" into the file tag input and press Enter
    And I type "suggestion" into the file tag input and select the suggestion "filetag-suggestion-seed"
    Then the file detail panel should show exactly these tags: "filetag-freetext, filetag-suggestion-seed"
    When I reload the page
    And I switch to the "Audio Files" tab
    And I open the file detail panel for "Files E2E DetailPanel Take.wav"
    Then the file detail panel should show exactly these tags: "filetag-freetext, filetag-suggestion-seed"

  # "Files E2E ReverseCascade Session" is a project folder (DAW-marker "reverse.pts") with two
  # audio files: reverse-take-1.wav (edited through the UI below) and reverse-take-2.wav (a
  # "control" file, pre-seeded via the API with its own score and tag before anything else
  # happens, so it never depends on the timing of the UI edits below).
  #
  # Unlike the Task 4.5 project->file cascade (projects-tab/detail-panel-status-tags-score.feature
  # — an overwrite/additive push onto every file), a file's score/tags edit does NOT push
  # additively onto its project: syncProjectFromFiles (see linkSync.ts) RECOMPUTES the project
  # from scratch every time — score becomes MAX(score) over the project's active files, tags
  # become the full UNION of the project's active files' current tags. So this scenario has two
  # halves, not one:
  #   1. Raise reverse-take-1.wav's score/tags above the control's — the project should follow.
  #   2. Lower reverse-take-1.wav's score/tags back down *while reverse-take-2.wav still holds its
  #      original, lower score and its own, different tag* — the project's score should fall back
  #      to the control's value (proving live MAX recompute, not a sticky additive cascade) and
  #      the project's tags should drop "reverse-cascade-tag" (proving live union-from-scratch
  #      recompute) while still showing "reverse-own-tag" (proving it's a genuine live union, not
  #      just "cleared to nothing" — the control file's own tag was never touched).
  #
  # This is also the scenario the Architect flagged as covering something the backend tests
  # (tests/linkSync.test.ts) don't: the frontend's refetchProjects()-after-save wiring in
  # App.tsx's handleFileScoreSave/handleFileTagsSave — "I set the file score to"/the tag-add and
  # tag-remove steps all wait for both the file's own PATCH and the resulting GET /api/projects
  # refetch (see files.steps.ts), which is what makes reading the result back through the
  # Projects tab below meaningful (rather than racing the still-in-flight refetch).
  Scenario: Editing a file's score and tags recomputes its project live, including falling back once the file's own value drops
    Given file "reverse-take-2.wav" has score 3 and tags "reverse-own-tag"
    And I open the app
    And I switch to the "Audio Files" tab
    When I open the file detail panel for "reverse-take-1.wav"
    And I set the file score to 4
    And I type "reverse-cascade-tag" into the file tag input and press Enter
    And I close the file detail panel
    And I switch to the "Project Folders" tab
    And I search projects for "Files E2E ReverseCascade Session"
    Then the projects table row for "Files E2E ReverseCascade Session" should show score 4
    And the projects table row for "Files E2E ReverseCascade Session" should show tags "reverse-cascade-tag, reverse-own-tag"
    When I switch to the "Audio Files" tab
    And I open the file detail panel for "reverse-take-1.wav"
    And I set the file score to 1
    And I remove the file tag "reverse-cascade-tag"
    And I close the file detail panel
    And I switch to the "Project Folders" tab
    And I search projects for "Files E2E ReverseCascade Session"
    Then the projects table row for "Files E2E ReverseCascade Session" should show score 3
    And the projects table row for "Files E2E ReverseCascade Session" should show tags "reverse-own-tag"
    And the projects table row for "Files E2E ReverseCascade Session" should not show tag "reverse-cascade-tag"
