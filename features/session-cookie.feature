@http
Feature: The session cookie
  A browser logs in and keeps its token in an httpOnly cookie that script on the page cannot read. A script
  keeps sending the token as a Bearer header. A cookie is only honoured for a change when the request comes
  from the site itself, and only the named sites can call the API from a browser with it.
  These scenarios log in as Alice, who is a reader, from their own visitor address so that the login limit used up
  by login.feature does not reach them.

  Scenario: Logging in sets an httpOnly cookie
    When "alice@example.org" logs in with the password "alice-pw" for the cookie
    Then the answer is 200
    And the cookie is httpOnly, secure and same-site

  Scenario: The cookie alone opens the API
    Given Alice is logged in in a browser
    When a browser from "https://replay-pallas.wildfiregames.ovh" asks for "/replays/releases" with its cookie
    Then the answer is 200

  Scenario: A Bearer token still works with no cookie
    Given a token with role 1
    When a request asks for "/replays/releases"
    Then the answer is 200

  Scenario: A change made with the cookie from another site is refused
    Given Alice is logged in in a browser
    When a browser from "https://evil.example" changes something with its cookie
    Then the answer is 403

  Scenario: A change made with the cookie from the site itself goes through the checks
    Given Alice is logged in in a browser
    When a browser from "https://replay-pallas.wildfiregames.ovh" changes something with its cookie
    Then the answer is not 403

  Scenario: Only the named sites may call the API from a browser
    When a browser from "https://evil.example" sends a preflight
    Then no origin is allowed
    When a browser from "https://replay-pallas.wildfiregames.ovh" sends a preflight
    Then that origin is allowed with credentials

  Scenario: Logging out clears the cookie
    When the browser logs out
    Then the answer is 204
    And the cookie is cleared

  Scenario: A cookie that is almost expired is renewed
    Given a cookie that has 10 minutes left
    When a browser from "https://replay-pallas.wildfiregames.ovh" asks for "/replays/releases" with its cookie
    Then the answer is 200
    And the cookie is renewed
