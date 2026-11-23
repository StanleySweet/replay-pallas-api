Feature: Refreshing the data derived from the replays
  After a rebuild, and every hour, the local ratings caches and the Glicko sets are recomputed on the
  main thread. Each step is synchronous, so the steps must run in turns of the event loop: a request
  is answered between two steps instead of waiting for all of them.

  Scenario: The steps run in order
    When the derived data is rebuilt
    Then the steps ran in this order: replays, local ratings, releases, glicko

  Scenario: Other work gets a turn between two steps
    When the derived data is rebuilt while a timer is waiting
    Then the timer fired before the last step ran

  Scenario: A failing step stops the rest and reports the error
    Given the local ratings step fails
    When the derived data is rebuilt
    Then the rebuild is rejected with "ratings broke"
    And the releases and glicko steps did not run
