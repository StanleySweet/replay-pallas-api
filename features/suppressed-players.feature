@http
Feature: Players who asked to be erased
  A player who asked for erasure is stored under a stable pseudonym, whoever uploads their games. Their nick
  is kept only as a keyed hash. The seeded server knows "Mallory" as suppressed.

  Scenario: A replay with a suppressed player is stored under the pseudonym
    Given a token with role 2
    When a replay "S-1" played on 0.28.0 by "Mallory" and "Dave" is uploaded
    Then the upload added "S-1"
    When the files of "S-1" are downloaded
    Then the files of "S-1" never mention "Mallory"
    And the files of "S-1" mention a pseudonym
    When a request asks for "/lobby-users"
    Then the lobby players do not include "Mallory"

  Scenario: Another spelling of the nick gets the same pseudonym
    Given a token with role 2
    When a replay "S-2" played on 0.28.0 by "MALLORY" and "Dave" is uploaded
    And the files of "S-2" are downloaded
    And the files of "S-1" are downloaded
    Then the files of "S-2" never mention "MALLORY"
    And the files of "S-1" and "S-2" hold the same pseudonym

  Scenario: A real nick shaped like a pseudonym cannot take over a pseudonym
    Given a token with role 2
    When a replay "S-3" played on 0.28.0 by "Player~DEADBEEF" and "Dave" is uploaded
    And a request asks for "/lobby-users"
    Then the lobby players do not include "Player~DEADBEEF"

  Scenario: Only an administrator can suppress a nick
    Given a token with role 2
    When "Trent" is suppressed
    Then the answer is 401

  Scenario: A second nick of the same person gets the same pseudonym
    Given a token with role 3
    When "Oscar" is suppressed
    And "Oz" is suppressed as an alias of the person of "Oscar"
    Then the answer is 200
    Given a token with role 2
    When a replay "S-4" played on 0.28.0 by "Oscar" and "Dave" is uploaded
    And a replay "S-5" played on 0.28.0 by "Oz" and "Dave" is uploaded
    And the files of "S-4" are downloaded
    And the files of "S-5" are downloaded
    Then the files of "S-4" never mention "Oscar"
    And the files of "S-5" never mention "Oz"
    And the files of "S-4" and "S-5" hold the same pseudonym

  Scenario: An alias of a person that does not exist is refused
    Given a token with role 3
    When "Oz" is suppressed as an alias of person 9999
    Then the answer is 404
