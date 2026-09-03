Feature: App loads

  Scenario: App loads with Project Folders as the default active tab
    Given I open the app
    Then I should see the "Project Folders" tab
    And I should see the "Audio Files" tab
    And the "Project Folders" tab should be the active tab

  Scenario: Audio Files tab loads without a backend error
    Given I open the app
    When I switch to the "Audio Files" tab
    Then the "Audio Files" tab should finish loading without a backend error
