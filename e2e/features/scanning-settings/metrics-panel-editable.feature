@statuses-tags-catalog
Feature: Metrics panel — editable per-section metrics persist and stay section-independent

  Scenario: Adding a tag metric to Audio Files persists across reload without leaking into Projects
    Given I open the app
    And I switch to the "Audio Files" tab
    And I search files for "Metrics E2E Tag Count"
    When I open the statuses and tags panel
    And I create a new tag named "Metrics E2E Tag Count"
    And I close the statuses and tags panel
    And I open the file detail panel for "Metrics E2E Tag Count.wav"
    And I assign my tag "Metrics E2E Tag Count" to the open file via its tag editor
    Then the file detail panel should show my tag "Metrics E2E Tag Count"
    When I close the file detail panel
    And I open the metrics panel
    And I add my tag "Metrics E2E Tag Count" as a Tag metric to the Audio Files section
    Then the Audio Files metrics should show my tag "Metrics E2E Tag Count" with count 1
    And the Projects metrics should not show my tag "Metrics E2E Tag Count"
    And the Projects metrics should still show its default tiles
    When I reload the page
    And I open the metrics panel
    Then the Audio Files metrics should show my tag "Metrics E2E Tag Count" with count 1
    And the Projects metrics should not show my tag "Metrics E2E Tag Count"
    When I remove my tag "Metrics E2E Tag Count" metric from the Audio Files section
    And I open the statuses and tags panel
    And I click the delete button for my tag "Metrics E2E Tag Count"
    And I confirm deleting my tag "Metrics E2E Tag Count"
    Then I should not see my tag "Metrics E2E Tag Count" in the panel
