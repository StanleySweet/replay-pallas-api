@http
Feature: Uploading a replay
  A contributor uploads the zip of a game. The replay is stored once, filed under the release it was played
  on, linked to its players and to the uploader, and shows up in the lists. Anything else is refused or
  ignored without a server error.
  These scenarios share one seeded server with http-routes.feature, and add replays to it: cucumber runs
  http-routes first (alphabetical order), whose counts assume the three seeded games only.

  Scenario: A contributor adds a replay
    Given a token with role 2
    When a replay "U-1" played on 0.28.0 by "Carol" and "Dave" is uploaded
    Then the upload added "U-1"
    And a request asks for "/replays/U-1"
    And the answer is 200

  Scenario: The replay is filed under its release
    Given a token with role 2
    When a replay "U-2" played on 0.27.1 by "Carol" and "Dave" is uploaded
    Then the upload added "U-2"
    When a request asks for "/replays/releases"
    Then the releases include 27 with 1 replay

  Scenario: The players of the replay become lobby players
    Given a token with role 2
    When a replay "U-3" played on 0.28.0 by "Erin" and "Frank" is uploaded
    Then the upload added "U-3"
    When a request asks for "/lobby-users"
    Then the lobby players include "Erin" and "Frank"

  Scenario: The same replay twice is stored once
    Given a token with role 2
    When a replay "U-4" played on 0.28.0 by "Gina" and "Hugo" is uploaded
    And the same replay is uploaded again
    Then the second upload added nothing

  Scenario: A reader cannot upload
    Given a token with role 1
    When a replay "U-5" played on 0.28.0 by "Ivy" and "Jon" is uploaded
    Then the answer is 401

  Scenario: Something that is not a replay is refused or ignored, not a server error
    Given a token with role 2
    When a zip with no replay in it is uploaded
    Then the answer is not a server error
    And nothing was added

  Scenario: The uploaded replay downloads as the same files
    Given a token with role 2
    When a replay "U-6" played on 0.28.0 by "Kim" and "Lou" is uploaded
    Then the upload added "U-6"
    And downloading "U-6" gives back metadata.json and commands.txt
