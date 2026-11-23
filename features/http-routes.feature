@http
Feature: The HTTP routes
  Every route answers a missing or bad token with 401, and a role that is too low with 401 or 403 depending
  on the route, never with a server error. A reader sees the replays, the releases and the leaderboard, narrowed by ?release=.
  The data is three games between Alice and Bob: two on release 26 won by Alice, one on release 28 won by Bob.

  Scenario: No token is refused
    When a request without a token asks for "/replays/releases"
    Then the answer is 401

  Scenario: A token that is not one is refused, not a server error
    Given the token "not.a.token"
    When a request asks for "/replays/releases"
    Then the answer is 401

  Scenario: A user without a role cannot read replays
    Given a token with role 0
    When a request asks for "/replays/all-list-items"
    Then the answer is 401

  Scenario: A reader sees the releases that have replays
    Given a token with role 1
    When a request asks for "/replays/releases"
    Then the answer is 200
    And the releases are 28 with 1 replay, 26 with 2 replays

  Scenario: The replay list can be narrowed to one release
    Given a token with role 1
    When a request asks for "/replays/all-list-items?release=26"
    Then the answer is 200
    And the list holds 2 replays
    When a request asks for "/replays/all-list-items"
    Then the list holds 3 replays

  Scenario: A release without replays gives no content
    Given a token with role 1
    When a request asks for "/replays/all-list-items?release=99"
    Then the answer is 204

  Scenario: The leaderboard of a release
    Given a token with role 1
    When a request asks for "/replays/glicko-leaderboard?release=26"
    Then the leaderboard lists Alice, Bob

  Scenario: The leaderboard can ask for a minimum of games
    Given a token with role 1
    When a request asks for "/replays/glicko-leaderboard?release=26&minGames=3"
    Then the leaderboard lists nobody

  Scenario: The account page lists the replays of its own player
    Given a token with role 1
    When a request asks for "/users/GetDetails/2"
    Then the account page lists 3 replays
    When a request asks for "/users/GetDetails/2?release=28"
    Then the account page lists 1 replays

  Scenario: Only an administrator can start the metadata rebuild
    Given a token with role 2
    When a request asks for "/replays/rebuild-replay-metadata"
    Then the answer is 401
