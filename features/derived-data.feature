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

  Scenario: Nothing is recomputed when no replay changed
    Given the derived data was computed for the replays "3:7"
    When the derived data is refreshed for the replays "3:7"
    Then no step ran

  Scenario: A new replay brings the refresh back
    Given the derived data was computed for the replays "3:7"
    When the derived data is refreshed for the replays "4:8"
    Then the steps ran in this order: replays, local ratings, releases, glicko

  Scenario: A forced rebuild runs even when no replay changed
    Given the derived data was computed for the replays "3:7"
    When the derived data is rebuilt by force for the replays "3:7"
    Then the steps ran in this order: replays, local ratings, releases, glicko

  Scenario: A day without a change still refreshes, because the Glicko preview deviation grows with time
    Given the derived data was computed for the replays "3:7" more than a day ago
    When the derived data is refreshed for the replays "3:7"
    Then the steps ran in this order: replays, local ratings, releases, glicko

  Scenario: A failing step is counted for the alert
    Given the local ratings step fails
    When the derived data is rebuilt
    Then the failure counter of the stage "local ratings" went up by 1

  Scenario: A boot that finds the data current counts as a success for the staleness alert
    Given no success was recorded for the derived data
    When the derived data is marked current at boot
    Then the last success of the stage "derived-data" is now
