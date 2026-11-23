Feature: Replays belong to a 0 A.D. release
  Replays come from several 0 A.D. releases, and their balance differs, so each replay
  records the release it was played on. The release selector and every list can then be
  limited to one release.

  Scenario Outline: The release is read from the game version
    Given a replay played on version "<version>"
    Then its release is <release>

    Examples: both numbering schemes, Alpha 26 was 0.0.26
      | version | release |
      | 0.0.26  | 26      |
      | 0.26.0  | 26      |
      | 0.27.1  | 27      |
      | 0.28.0  | 28      |
      | 0.0.23  | 23      |

  Scenario: The 0ad mod wins over engine_version
    Given a replay whose 0ad mod is 0.28.0 and whose engine_version is 0.27.0
    Then its release is 28

  Scenario: engine_version is used when the replay lists no 0ad mod
    Given a replay with no 0ad mod and engine_version 0.0.26
    Then its release is 26

  Scenario: A replay that does not say its version has no release
    Given a replay that does not say its version
    Then it has no release

  Scenario: Replays stored before the release was recorded are filled in at start
    Given these replays were stored without a release:
      | id | version |
      | A  | 0.27.0  |
      | B  | 0.0.26  |
      | C  |         |
    When the server starts
    Then the releases are:
      | id | release |
      | A  | 27      |
      | B  | 26      |
      | C  | 0       |
    And starting the server again fills nothing

  Scenario: The selector offers the releases that have replays, newest first, and the unknown ones last
    Given these replays are stored:
      | id | release |
      | A  | 26      |
      | B  | 26      |
      | C  | 28      |
      | D  | 0       |
    Then the selector offers:
      | release | replays |
      | 28      | 1       |
      | 26      | 2       |
      | 0       | 1       |

  Scenario: The offered releases follow uploads and deletions
    Given these replays are stored:
      | id | release |
      | A  | 26      |
    And the selector has been shown
    When replay "B" played on release 28 is uploaded
    Then the selector offers releases 28, 26
    When replay "B" is deleted
    Then the selector offers releases 26

  Scenario: Replay lists can be limited to one release
    Given these replays are stored:
      | id | release |
      | A  | 27      |
      | B  | 26      |
      | C  | 26      |
    And the user "u" uploaded replays "A" and "B"
    Then the replays of release 26 are "B", "C"
    And the replays of release 99 are none
    And the replays uploaded by "u" on release 26 are "B"
    And without a release the replays uploaded by "u" are "A", "B"

  Scenario: A player page can be limited to one release
    Given these replays are stored:
      | id | release |
      | A  | 27      |
      | B  | 26      |
    And the player "Alice" played replays "A" and "B"
    Then the player "Alice" has 2 replays
    And the player "Alice" has replays "B" on release 26
