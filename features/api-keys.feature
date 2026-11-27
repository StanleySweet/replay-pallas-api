@http
Feature: API keys
  A tool such as the Replay Pallas mod keeps an API key instead of the account password. The key is made
  while logged in and shown once, only its hash is stored, it never needs renewing, and deleting it stops it
  at once. It gives at most the role it was made with, and never more than its owner has. A key cannot make,
  list or delete keys: that takes a login.
  These scenarios use the seeded Alice (a reader, user 2) and the seeded admin (user 1).

  Scenario: A key made with a login opens the API
    Given Alice is logged in with a token
    When she makes a key named "mod" for the role 1
    Then the answer is 201
    And the key starts with "rp_"
    When the key is used to ask for "/replays/releases"
    Then the answer is 200

  Scenario: A wrong key is refused
    Given the token "rp_not-a-real-key"
    When a request asks for "/replays/releases"
    Then the answer is 401

  Scenario: A reader cannot make a key that does more than a reader
    Given Alice is logged in with a token
    When she makes a key named "mod" for the role 2
    Then the answer is 400

  Scenario: Nobody can make an administrator key
    Given the admin is logged in with a token
    When she makes a key named "all" for the role 3
    Then the answer is 400

  Scenario: A key cannot make or list keys
    Given Alice is logged in with a token
    When she makes a key named "mod" for the role 1
    And the key is used to make a key named "again" for the role 1
    Then the answer is 401
    When the key is used to ask for "/users/api-keys"
    Then the answer is 401

  Scenario: The list shows the keys without their secret
    Given Alice is logged in with a token
    When she makes a key named "mod" for the role 1
    And she lists her keys
    Then the answer is 200
    And the list holds the key "mod" and no secret

  Scenario: A key stops working once it is deleted
    Given Alice is logged in with a token
    When she makes a key named "mod" for the role 1
    And she deletes that key
    Then the answer is 204
    When the key is used to ask for "/replays/releases"
    Then the answer is 401

  Scenario: Somebody else's key is not theirs to delete
    Given Alice is logged in with a token
    When she makes a key named "mod" for the role 1
    And the admin is logged in with a token
    And she deletes that key
    Then the answer is 404

  Scenario: Five keys at most, deleting one frees a place
    Given the admin is logged in with a token
    When she makes 5 keys
    And she makes a key named "sixth" for the role 2
    Then the answer is 409
    When she deletes that key
    And she makes a key named "sixth" for the role 2
    Then the answer is 201
