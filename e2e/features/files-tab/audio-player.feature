Feature: Audio Files tab — audio player bar

  # Reuses "Files E2E/alpha-take.wav" and "Files E2E/beta-mix.wav" (Task 5a's own fixtures) rather
  # than adding new ones — audio-player interactions are entirely read-only (no PATCH, no DB
  # mutation; clicking Play/Stop/Close only flips AudioPlayerBar.tsx's own local React state and
  # App.tsx's playingFile/isPlaying), so sharing these fixtures with filtering.feature's Background
  # (which seeds status/score/tags onto both) is safe: nothing here touches either field.
  #
  # Per the Architect's confirmed decision, no scenario below asserts duration, seek position, or
  # the Play/Pause icon's playing/paused state (see the doc comment atop the audio-player section
  # of files.steps.ts for why) — only DOM/state driven directly by the click handlers themselves:
  # bar mount/visibility, filename text, Stop's displayed-time reset, Close hiding the bar, and
  # that the row-level play button does not also open the file detail panel.

  Scenario: Clicking a file's play button opens the audio player bar without opening the detail panel
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "alpha-take"
    When I click the play button for file "alpha-take.wav"
    Then I should see the audio player bar for "alpha-take.wav"
    And I should not see the file detail panel

  Scenario: Clicking play on a different row switches the audio player bar to the new file
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Files E2E"
    When I click the play button for file "alpha-take.wav"
    Then I should see the audio player bar for "alpha-take.wav"
    When I click the play button for file "beta-mix.wav"
    Then I should see the audio player bar for "beta-mix.wav"

  Scenario: Stopping playback resets the displayed time to 0:00
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "alpha-take"
    When I click the play button for file "alpha-take.wav"
    And I click stop on the audio player
    Then the audio player time should show "0:00"

  Scenario: Closing the audio player hides the bar
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "beta-mix"
    When I click the play button for file "beta-mix.wav"
    Then I should see the audio player bar for "beta-mix.wav"
    When I close the audio player
    Then I should not see the audio player bar
