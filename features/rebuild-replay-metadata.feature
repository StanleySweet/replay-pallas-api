Feature: Rebuilding the replay metadata
  What the site shows for a replay is derived from its commands.txt, which is kept as uploaded.
  The rebuild derives it again. It runs in the background and reports how far it is, and the
  people using the site never see it half done.

  Background:
    Given these replays played by Alice, Bob and the AI Petra:
      | id | version | alice orders |
      | R1 | 0.27.0  | 3            |
      | R2 | 0.0.26  | 2            |

  Scenario: The metadata is derived again from commands.txt
    When the metadata is rebuilt
    Then the metadata of "R1" counts 3 orders for Alice
    And the metadata of "R2" counts 2 orders for Alice

  Scenario: Every replay gets its 0 A.D. release
    When the metadata is rebuilt
    Then the release of "R1" is 27
    And the release of "R2" is 26

  Scenario: AI players are not lobby players
    When the metadata is rebuilt
    Then the lobby players are "Alice" and "Bob" only
    And "R1" is linked to "Alice" and "Bob"

  Scenario: The lobby rating in a player's name goes into the ranking history
    When the metadata is rebuilt
    Then Alice has a lobby rating of 1500 in "R1"

  Scenario: A replay that cannot be read is skipped and the others are still rebuilt
    Given a replay "BAD" whose stored metadata cannot be read
    When the metadata is rebuilt
    Then 1 replay was skipped
    And the metadata of "R1" counts 3 orders for Alice

  Scenario: Progress is reported while it runs
    When the metadata is rebuilt
    Then progress was reported, never going backwards, ending at 2 of 2 replays

  Scenario: Readers see the old links until the rebuild is finished
    Given "R1" has an old link to the player "Stale"
    When the metadata is rebuilt
    Then the link tables did not change while the rebuild was reading
    And "R1" no longer has a link to "Stale"

  Scenario: A replay uploaded while the rebuild runs keeps its links
    When the metadata is rebuilt and replay "NEW" is uploaded while it reads
    Then "NEW" is linked to "Alice" and "Bob"

  Scenario: Rebuilding twice gives the same result
    When the metadata is rebuilt
    And the metadata is rebuilt again
    Then the links, ranking history and metadata are the same as after the first rebuild
