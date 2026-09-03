Feature: Dark/light theme toggle

  Scenario: Toggling the theme updates the page immediately and persists to localStorage
    Given I open the app
    Then the theme should be "dark"
    And the stored theme preference should be "true"
    When I toggle the theme
    Then the theme should be "light"
    And the stored theme preference should be "false"

  Scenario: The chosen theme survives a reload, in both directions
    Given I open the app
    When I toggle the theme
    And I reload the page
    Then the theme should be "light"
    And the stored theme preference should be "false"
    When I toggle the theme
    And I reload the page
    Then the theme should be "dark"
    And the stored theme preference should be "true"
