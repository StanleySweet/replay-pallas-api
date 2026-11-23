Feature: Starting the metadata rebuild from the site
  The rebuild takes minutes on the real data. It runs in the background, so the API keeps answering,
  and anyone can ask how far it is.

  Scenario: The rebuild runs in the background and says how it went
    Given a database file holding 120 replays
    When the rebuild is started
    Then it is accepted at once
    And a second start is refused while it runs
    When the rebuild has finished
    Then its status is done, with 120 of 120 replays
    And the caches were refreshed once it was done

  Scenario: A rebuild that cannot start says why
    When the rebuild is started on a database that cannot be opened
    And the rebuild has finished
    Then its status is failed, with a reason
    And the caches were not refreshed
