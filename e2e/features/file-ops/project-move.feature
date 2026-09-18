Feature: Copy/Move/Delete — moving a project folder relocates its whole subtree

  # "File Ops E2E Project Move Source/" (a real DAW-marker project folder — see project.als,
  # copied from the existing Ableton-marker convention already used by "Batch E2E Projects
  # Alpha/" — containing one audio file, "File Ops E2E Project Track.wav") and "File Ops E2E
  # Project Move Destination/" (a plain destination folder with an untouched "keep.wav"
  # placeholder, same convention as every other destination folder in this directory) are both
  # exclusive to this scenario — a project move physically relocates the whole source folder (and
  # therefore its file) on disk, and rekeys both the project's own id/path and its nested file's
  # id/relativePath (see `moveProjectSubtree` in subtreeRekey.ts). One-shot mutation, no
  # restoration attempted, per this directory's established convention. See
  # ALL_PROJECTS_E2E_FIXTURES in projects.steps.ts and ALL_FILES_E2E_FIXTURES in files.steps.ts
  # for both fixtures' registration.
  #
  # This is the suite's only project-level copy/move scenario (the task brief asks for "at least
  # one"; move was chosen over copy because it also proves the id/path REKEY — a copy only ever
  # clones under a brand-new id, so it wouldn't exercise the "same row, prefix rewritten in place"
  # path `moveProjectSubtree` takes, which is the more interesting of the two to prove works
  # end-to-end through the (until recently broken, see fileOps.steps.ts's top doc comment)
  # destination-picker path).
  #
  # ProjectsTable.tsx renders each row's own DB id (its root-relative path, e.g. "File Ops E2E
  # Project Move Source" before the move, "File Ops E2E Project Move Destination/File Ops E2E
  # Project Move Source" after) as visible text right under the project's name — see
  # ProjectsTable.tsx's `{project.id}` div — so the existing "I should see project ... in the
  # table" / "the projects table row for ... should show score/tags ..." steps (projects.steps.ts,
  # untouched by this task) can be reused as-is here simply by passing that full nested id string:
  # it substring-matches only the POST-move row's own id text, which is a positive proof of
  # relocation no scenario could produce before the move (the "Destination/" prefix couldn't have
  # been part of any row's id until the move actually happened).

  Scenario: Moving a project folder relocates its own row and its file, preserving both metadata
    Given file "File Ops E2E Project Track.wav" has status "done", score 5, and tags "subtree-tag"
    And I open the app
    And I switch to the "Project Folders" tab
    When I search projects for "File Ops E2E Project Move Source"
    Then I should see project "File Ops E2E Project Move Source" in the table
    When I open the folder detail panel for "File Ops E2E Project Move Source"
    And I click "Move" in the folder detail panel
    Then I should see the file operation dialog
    When I select destination folder "File Ops E2E Project Move Destination" in the file operation dialog
    And I type "MOVE" to confirm in the file operation dialog
    Then the file operation apply button should be enabled
    When I confirm the project move in the file operation dialog
    Then I should not see the file operation dialog
    And I should see project "File Ops E2E Project Move Destination/File Ops E2E Project Move Source" in the table
    And the projects table row for "File Ops E2E Project Move Destination/File Ops E2E Project Move Source" should show score 5
    And the projects table row for "File Ops E2E Project Move Destination/File Ops E2E Project Move Source" should show tags "subtree-tag"
    When I switch to the "Audio Files" tab
    And I search files for "File Ops E2E Project Track.wav"
    Then I should see 1 row for file "File Ops E2E Project Track.wav" in the table
    And the file "File Ops E2E Project Track.wav" row at location "File Ops E2E Project Move Destination / File Ops E2E Project Move Source" should show score 5
    And the file "File Ops E2E Project Track.wav" row at location "File Ops E2E Project Move Destination / File Ops E2E Project Move Source" should have tag "subtree-tag"
