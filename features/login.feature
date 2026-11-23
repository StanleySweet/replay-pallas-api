@http
Feature: Logging in and registering
  The server hashes passwords itself, with a salt per user. An account made before that still holds the hash
  its browser computed with one salt shared by everybody: it logs in once more with the old hash, is moved to
  the server-side hash when the plain password is sent beside it, and its old hash is then useless.
  Login and registration have a much lower rate limit than the rest of the API, so these scenarios share
  ten requests with each other and stay within them. The seeded server knows "Carl" with an old hash.

  Scenario: A browser from before the change still logs in with the old hash
    When "carl@example.org" logs in with the password "old-browser-hash"
    Then the answer is 200

  Scenario: The first login with the plain password moves the account
    When "carl@example.org" logs in with the password "carl-secret" and the old hash "old-browser-hash"
    Then the answer is 200

  Scenario: After the move the old hash is no longer a way in
    When "carl@example.org" logs in with the password "old-browser-hash"
    Then the answer is 204
    When "carl@example.org" logs in with the password "carl-secret"
    Then the answer is 200
    When "carl@example.org" logs in with the password "carl-wrong"
    Then the answer is 204

  Scenario: A new account logs in with its plain password
    When "dora@example.org" registers as "Dora" with the password "dora-secret"
    Then the answer is 201
    When "dora@example.org" logs in with the password "dora-secret"
    Then the answer is 200

  Scenario: Too many attempts are refused
    When "carl@example.org" logs in 12 times with a wrong password
    Then one of the answers is 429
