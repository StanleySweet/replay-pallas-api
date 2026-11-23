Feature: Replay files are stored small and come back unchanged
  Players download the replays they uploaded, and the game plays them, so the stored files
  must come back byte for byte. Everything the site shows is derived from them.

  Scenario: A stored replay comes back byte for byte
    Given the uploaded files of a replay, with accents and Windows line endings
    When they are stored and read back
    Then the text is identical

  Scenario: Stored files are smaller than before
    Given the uploaded files of a replay, with accents and Windows line endings
    When they are stored and read back
    Then they take less space than the old snappy format

  Scenario: Files stored the old way can still be read, and are rewritten without change
    Given the uploaded files of a replay stored in the old snappy format
    Then they are read as before
    And rewriting them in the new format keeps the text identical

  Scenario: The metadata keeps a count of commands, not every command
    Given the commands of a game where Alice gives 3 orders and Bob gives 1
    When the commands are read
    Then Alice's order count is 3 and Bob's is 1
    And no list of commands is kept
    And Alice's most used order is "walk"

  Scenario: The most used order is the same as before, on any amount of commands
    Given 3000 random lists of orders
    Then the most used order agrees with the earlier calculation for every list
    And 20000 orders are counted in a few milliseconds
