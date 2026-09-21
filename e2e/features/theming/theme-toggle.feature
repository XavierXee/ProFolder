Feature: Default/Light/Dark theme dropdown

  # ThemeSelector.tsx is a 3-way single-select dropdown (trigger + listbox), not the old 2-way
  # toggle button. Purely client-side (App.tsx's `theme` state, mirrored onto
  # `<html data-theme="...">` and `localStorage["musicLibraryManager.theme"]` by a
  # useLayoutEffect that also runs on initial mount) — no backend/scan involvement, and every
  # scenario gets its own fresh browser context with isolated localStorage, so no
  # `@mode:serial`/`@scan-lock` tagging is needed (see theme.steps.ts's doc comment).
  #
  # Scenario count: one scenario chains all 3 possible selections (profolder -> light -> dark ->
  # profolder) rather than a separate scenario per option, since each transition in that chain
  # starts from a DIFFERENT theme than its target, so each step has real discriminating power
  # (unlike e.g. selecting "Default" while already on "Default", which wouldn't prove
  # anything changed). A second scenario covers the untouched default on a fresh app open, and a
  # third covers reload-survival for one non-default theme — matching this suite's existing
  # judgment (see files-tab/sorting.feature) of scoping scenario count to genuinely distinct
  # behavior rather than exhaustively cross-multiplying every option against every check.
  #
  # ThemeSelector now lives inside the Settings panel (SettingsPanel.tsx), not directly in the
  # header — so any scenario that actually clicks the dropdown (not just reads its trigger text
  # via "the theme selector should show", a plain text-content check that works regardless of the
  # panel's open/off-screen state) must open the Settings panel first, or the click hits an
  # off-screen element (settings.steps.ts's own doc comment covers why: SettingsPanel stays
  # permanently mounted, just translated off-screen via CSS when closed).

  Scenario: Selecting a theme option updates the page immediately and persists to localStorage
    Given I open the app
    And I open the settings panel
    When I open the theme dropdown
    And I select the "Light" theme option
    Then the page theme should be "light"
    And the stored theme preference should be "light"
    And the theme selector should show "Light"
    When I open the theme dropdown
    And I select the "Dark" theme option
    Then the page theme should be "dark"
    And the stored theme preference should be "dark"
    And the theme selector should show "Dark"
    When I open the theme dropdown
    And I select the "Default" theme option
    Then the page theme should be "profolder"
    And the stored theme preference should be "profolder"
    And the theme selector should show "Default"

  Scenario: The default theme on a fresh app open is Default
    Given I open the app
    Then the page theme should be "profolder"
    And the stored theme preference should be "profolder"
    And the theme selector should show "Default"

  Scenario: A selected theme survives a page reload
    Given I open the app
    And I open the settings panel
    When I open the theme dropdown
    And I select the "Dark" theme option
    And I reload the page
    Then the page theme should be "dark"
    And the stored theme preference should be "dark"
    And the theme selector should show "Dark"
