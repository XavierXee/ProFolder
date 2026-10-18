@custom-tabs @mode:serial
Feature: Custom tabs — tab bar horizontal scroll, drag-and-drop reorder, and the All Tabs panel

  # See customTabs.steps.ts's top doc comment for why these scenarios never assert the tab bar's
  # total tab count or a tab's absolute position among every tab currently open (custom tabs are
  # a GLOBAL list shared by every concurrently-running scenario/worker against this one app/DB
  # instance) — only each scenario's own, uniquely-suffixed tab(s)' relative order/behavior.
  #
  # The reorder endpoint (`PUT /api/custom-tabs/reorder`) is deliberately lenient about exactly
  # this kind of concurrent, shared-list access: it applies whatever order is sent, silently
  # skipping any id that no longer exists and leaving any tab not mentioned in the request at its
  # current position, rather than requiring an exact match against the full current set — so a
  # reorder scenario running here can never be made to fail by a completely unrelated tab being
  # created/deleted by a different scenario/worker at the same time.

  Scenario: Dragging one custom tab onto another reorders them, persisted across a reload
    Given I open the app
    When I create a custom tab of type "Audio Files" named "Custom Tabs E2E Reorder A" with no filter
    And I create a custom tab of type "Audio Files" named "Custom Tabs E2E Reorder B" with no filter
    Then my custom tab "Custom Tabs E2E Reorder A" should appear before my custom tab "Custom Tabs E2E Reorder B" in the tab bar
    When I drag my custom tab "Custom Tabs E2E Reorder A" onto my custom tab "Custom Tabs E2E Reorder B"
    Then my custom tab "Custom Tabs E2E Reorder B" should appear before my custom tab "Custom Tabs E2E Reorder A" in the tab bar
    When I reload the page
    Then my custom tab "Custom Tabs E2E Reorder B" should appear before my custom tab "Custom Tabs E2E Reorder A" in the tab bar

  Scenario: Enough custom tabs make the tab bar scroll horizontally instead of wrapping to a new line
    Given I open the app
    When I create 10 custom tabs of type "Audio Files" named "Custom Tabs E2E Scroll" with no filter
    Then the tab bar should overflow horizontally instead of wrapping to a new line

  Scenario: Selecting a custom tab from the All Tabs panel navigates to it and closes the panel
    Given I open the app
    When I create a custom tab of type "Audio Files" named "Custom Tabs E2E All Tabs Panel" with no filter
    And I switch to the "Project Folders" tab
    And I open the All Tabs panel
    And I select my custom tab "Custom Tabs E2E All Tabs Panel" from the All Tabs panel
    Then my custom tab "Custom Tabs E2E All Tabs Panel" should be the active tab
    And the All Tabs panel should be closed

  Scenario: Selecting "Audio Files" from the All Tabs panel navigates to it
    Given I open the app
    When I open the All Tabs panel
    And I select the "Audio Files" tab from the All Tabs panel
    Then the "Audio Files" tab should be the active tab
