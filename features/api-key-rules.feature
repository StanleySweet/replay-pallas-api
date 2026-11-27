Feature: API key rules
  What the database decides about a key: when it expires, which role it gives and when it was last used.

  Scenario: A key that has expired gives nothing
    Given an account "Eve" with the role 2
    And a key for "Eve" with the role 2 that expired yesterday
    Then the key gives no claims

  Scenario: A key that has not expired yet works
    Given an account "Eve" with the role 2
    And a key for "Eve" with the role 2 that expires tomorrow
    Then the key gives the role 2 to "Eve"

  Scenario: A key never gives more than its owner has now
    Given an account "Eve" with the role 2
    And a key for "Eve" with the role 2 that does not expire
    When "Eve" is lowered to the role 1
    Then the key gives the role 1 to "Eve"

  Scenario: Using a key records when it was last used
    Given an account "Eve" with the role 2
    And a key for "Eve" with the role 2 that does not expire
    Then the key was never used
    When the key is used
    Then the key was used just now
