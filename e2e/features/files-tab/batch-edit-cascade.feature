@mode:serial
Feature: Cross-view batch cascade — a single batch file edit resyncing multiple distinct projects

  # This file targets the one piece of the batch file-edit route that Task 5b.3's reverse-cascade
  # scenario and Tasks 6.2/6.3's batch-edit scenarios don't cover: `syncProjectsForFiles` in
  # src/api/routes/files.ts, which the "/batch/score" and "/batch/tags" routes both call after
  # applying a batch edit. It DEDUPES the selected files' project ids down to a `Set` before
  # calling `syncProjectFromFiles` once per distinct project — Task 5b.3 already proves the
  # underlying single-project recompute logic itself (raise/lower-back, MAX score, tag union) via
  # a single file's own detail-panel edit; what's untested is specifically whether ONE batch call
  # spanning files that belong to TWO different projects actually resyncs BOTH of them, not just
  # the first project id the loop happens to encounter.
  #
  # Fixtures (see ALL_PROJECTS_E2E_FIXTURES in projects.steps.ts / ALL_FILES_E2E_FIXTURES in
  # files.steps.ts for their registration in both tabs' isolation lists):
  #   "Batch E2E Cascade Proj1/" — DAW marker + 2 files: cascade-proj1-take1.wav (edited through
  #     the batch panel below) and cascade-proj1-take2.wav (a "control" file, seeded via the API,
  #     never selected — its continued, untouched value is what proves the batch call only
  #     resyncs the PROJECT, not the unselected sibling file).
  #   "Batch E2E Cascade Proj2/" — DAW marker + 1 file: cascade-proj2-take1.wav, its project's
  #     only file, so the project's recomputed value always just mirrors this one file's own.
  # Every scenario below searches "Batch E2E Cascade" first to scope to just these two projects'
  # 3 files — deliberately distinct from "Batch E2E Projects"/"Batch E2E Files" (Tasks 6.2/6.3's
  # own fixture prefixes), so this file's search term never widens into their fixtures or
  # vice versa (relative-path/name substring matching — see the search route in
  # audioFileRepository.ts / projectRepository.ts).
  #
  # `@mode:serial` (playwright-bdd's special tag — see SpecialTags in playwright-bdd), same as
  # both Task 6.2's and Task 6.3's batch-edit.feature files: multiple scenarios below batch-write
  # DIFFERENT target scores onto the same 3 shared fixture files (4 then 1), and — confirmed
  # empirically while writing this file, the same failure mode those two files' own comments
  # describe — running without `@mode:serial` produces intermittent failures where one scenario's
  # concurrently-running batch score edit lands on a fixture mid another scenario's assertion.
  #
  # No shared Background: each scenario re-seeds via API `Given` calls whatever score/tag state
  # it depends on before asserting on it (mirroring both batch-edit.feature files' own
  # Background-less rationale), so no scenario here relies on another scenario's leftover
  # mutation, and seeding happens before "I open the app" (the all-tags dictionary is fetched
  # once on mount). Seeding a file's score/tags via the single-file PATCH routes (files.steps.ts's
  # "file ... has score ... and tags ...") already cascades onto its project by itself (see
  # src/api/routes/files.ts's `/:id/score` and `/:id/tags` routes, which call
  # `syncProjectFromFiles` directly, not through the batch dedupe loop) — that's what lets each
  # scenario below establish a known starting project state before its own batch action runs
  # through the untested `/batch/score`/`/batch/tags` routes specifically.

  Scenario: A single batch score edit resyncs both distinct projects the selection spans, without touching the unselected sibling file
    Given file "cascade-proj1-take1.wav" has no score
    And file "cascade-proj1-take2.wav" has score 2 and tags ""
    And file "cascade-proj2-take1.wav" has no score
    And I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Batch E2E Cascade"
    When I select file "cascade-proj1-take1.wav"
    And I select file "cascade-proj2-take1.wav"
    And I open the "audio files" batch edit panel
    And I set the batch score to 4 in the "audio files" batch edit panel
    And I close the "audio files" batch edit panel
    Then the file "cascade-proj1-take1.wav" row should show score 4
    And the file "cascade-proj2-take1.wav" row should show score 4
    And the file "cascade-proj1-take2.wav" row should show score 2
    When I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Cascade"
    Then the projects table row for "Batch E2E Cascade Proj1" should show score 4
    And the projects table row for "Batch E2E Cascade Proj2" should show score 4

  # Self-contained (not depending on the previous scenario's mutation), per this file's own
  # Background-less rationale. Proj1's own starting state (take1 at 4, take2 at 2) is seeded
  # directly via the single-file PATCH route, which already cascades on its own — so by the time
  # this scenario's own batch action runs, Proj1 already shows score 4 (MAX(4, 2)) and Proj2
  # already shows score 4 (its only file) purely from seeding, before the batch route is ever
  # touched. The batch action below then lowers take1 back down to 1 through the untested
  # dedupe-loop route specifically, proving it's a genuine LIVE recompute through that route (not
  # a sticky, additive cascade) for both distinct projects at once: Proj1 falls back to take2's
  # still-higher value (2), while Proj2 — whose only file is take1 — follows take1 all the way
  # down to 1.
  Scenario: Lowering a batch-edited score live-recomputes both projects, including falling back to a sibling's value
    Given file "cascade-proj1-take1.wav" has score 4 and tags ""
    And file "cascade-proj1-take2.wav" has score 2 and tags ""
    And file "cascade-proj2-take1.wav" has score 4 and tags ""
    And I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Batch E2E Cascade"
    When I select file "cascade-proj1-take1.wav"
    And I select file "cascade-proj2-take1.wav"
    And I open the "audio files" batch edit panel
    And I set the batch score to 1 in the "audio files" batch edit panel
    And I close the "audio files" batch edit panel
    Then the file "cascade-proj1-take1.wav" row should show score 1
    And the file "cascade-proj2-take1.wav" row should show score 1
    When I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Cascade"
    Then the projects table row for "Batch E2E Cascade Proj1" should show score 2
    And the projects table row for "Batch E2E Cascade Proj2" should show score 1

  # Tag-side proof of the same dedupe loop, through "/batch/tags" instead of "/batch/score" — the
  # part of syncProjectsForFiles's `for (const projectId of projectIds) syncProjectFromFiles(...)`
  # loop that a broken "only resync the first distinct project" implementation would still pass
  # for Proj1 (whichever project id the loop happens to reach first) but fail for Proj2.
  Scenario: A single batch tag edit unions the new tag into both distinct projects the selection spans
    Given file "cascade-proj1-take1.wav" has tags ""
    And file "cascade-proj2-take1.wav" has tags ""
    And I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Batch E2E Cascade"
    When I select file "cascade-proj1-take1.wav"
    And I select file "cascade-proj2-take1.wav"
    And I open the "audio files" batch edit panel
    And I add the batch tag "batch-cascade-tag" in the "audio files" batch edit panel
    And I close the "audio files" batch edit panel
    Then the file "cascade-proj1-take1.wav" row should have tag "batch-cascade-tag"
    And the file "cascade-proj2-take1.wav" row should have tag "batch-cascade-tag"
    When I switch to the "Project Folders" tab
    And I search projects for "Batch E2E Cascade"
    Then the projects table row for "Batch E2E Cascade Proj1" should show tags "batch-cascade-tag"
    And the projects table row for "Batch E2E Cascade Proj2" should show tags "batch-cascade-tag"
