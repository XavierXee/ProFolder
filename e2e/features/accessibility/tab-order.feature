Feature: Keyboard Tab order excludes closed panels' hidden controls
  Settings, Create Custom Tab, Scan Folder, Batch Edit, and All Tabs all stay mounted in the DOM
  while "closed" (slid off-screen via CSS) rather than unmounting outright, so their own slide-in
  transition can animate when opened. Their controls must not be reachable by Tab/Shift+Tab
  while closed — this is only verifiable in a real browser, since jsdom (the frontend unit-test
  harness) doesn't implement the focus-blocking half of the `inert` attribute this relies on.

  Scenario: The first Tab press from a fresh page load lands on a visible, interactable element
    Given I open the app
    When I press Tab
    Then the focused element should be visible

  Scenario: The Settings panel's own close button is not focusable while the panel is closed
    Given I open the app
    Then the Settings panel's close button should not be focusable

  Scenario: The Settings panel's own close button becomes focusable once the panel is actually open
    Given I open the app
    When I open the Settings panel
    Then the Settings panel's close button should be focusable

  Scenario: The Create Custom Tab modal's name field is not focusable while the modal is closed
    Given I open the app
    Then the Create Custom Tab modal's name field should not be focusable

  Scenario: The Create Custom Tab modal's name field becomes focusable once the modal is actually open
    Given I open the app
    When I open the Create Custom Tab modal
    Then the Create Custom Tab modal's name field should be focusable

  Scenario: The All Tabs panel's own close button is not focusable while the panel is closed
    Given I open the app
    Then the All Tabs panel's close button should not be focusable

  Scenario: The All Tabs panel's own close button becomes focusable once the panel is actually open
    Given I open the app
    When I open the All Tabs panel
    Then the All Tabs panel's close button should be focusable
