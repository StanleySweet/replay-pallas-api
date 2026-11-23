Feature: Ratings per 0 A.D. release
  A player's rating on one release says nothing about the next, because the balance changes.
  Glicko and the local ratings are computed over every replay, as before, and once more per
  release. Pages read the set over every replay unless a release is asked for.

  Background:
    Given Alice beat Bob twice on release 26
    And Bob beat Alice once on release 27

  Scenario: Glicko is rated over every replay and per release
    When the glicko ratings are rebuilt
    Then there are glicko sets for every replay, release 26 and release 27

  Scenario: Each glicko set counts its own games
    When the glicko ratings are rebuilt
    Then Alice has played 3 rated games over every replay, 2 on release 26 and 1 on release 27

  Scenario: The same player is rated differently on different releases
    When the glicko ratings are rebuilt
    Then Alice is rated higher on release 26 than on release 27

  Scenario: Readers ask for the set over every replay by default
    When the glicko ratings are rebuilt
    Then Alice's latest glicko match count is 3
    And Alice's latest glicko match count on release 26 is 2
    And there is no glicko rating on release 99

  Scenario: Rebuilding twice does not double the ratings
    When the glicko ratings are rebuilt
    And the glicko ratings are rebuilt
    Then each glicko set has the same rows as after the first rebuild

  Scenario: Local ratings get a set per release
    When the local ratings are computed per release
    Then there are local rating sets for release 26 and release 27 only

  Scenario: Each local ratings set only rates its own replays
    When the local ratings are computed per release
    Then Alice has 2 rated matches on release 26 and 1 on release 27
    And Alice is rated above Bob on release 26 and below Bob on release 27

  Scenario: The local ratings over every replay are not touched by the release sets
    Given a local ratings set over every replay holding the player "Pooled"
    When the local ratings are computed per release
    Then the local ratings over every replay still hold only "Pooled"

  Scenario: A restart reads the stored local ratings sets
    When the local ratings are computed per release
    And the server restarts
    Then Alice still has 2 rated matches on release 26

  Scenario: A new replay only reaches the local ratings of its own release
    When the local ratings are computed per release
    And a replay won by Bob is added on release 27
    Then Alice has 2 rated matches on release 27 and 2 on release 26

  Scenario: A release with no replay left loses its local ratings
    When the local ratings are computed per release
    And every replay of release 27 is deleted
    And the local ratings are rebuilt per release
    Then there are local rating sets for release 26 only

  Scenario: The glicko leaderboard of a release ranks its players
    When the glicko ratings are rebuilt
    Then the glicko leaderboard of release 26 lists Alice before Bob, each with 2 games

  Scenario: The glicko leaderboard over every replay uses each player's latest rating
    When the glicko ratings are rebuilt
    Then the glicko leaderboard over every replay lists Alice and Bob, each with 3 games

  Scenario: A release without replays has an empty leaderboard
    When the glicko ratings are rebuilt
    Then the glicko leaderboard of release 99 is empty

  Scenario: Players with too few rated games are left out of the leaderboard
    When the glicko ratings are rebuilt
    Then the glicko leaderboard of release 26 with at least 3 games is empty
    And the glicko leaderboard over every replay with at least 3 games lists Alice and Bob

  Scenario: The conservative leaderboard keeps an unsure player below the regulars
    Given "Lucky" is rated 1800 with a deviation of 300 after 1 game
    And "Regular" is rated 1600 with a deviation of 50 after 10 games
    Then the leaderboard by rating lists Lucky before Regular
    And the conservative leaderboard lists Regular before Lucky
