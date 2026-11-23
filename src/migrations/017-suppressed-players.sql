--------------------------------------------------------------------------------
-- Up

-- Players who asked to be erased. A person holds the stable pseudonym that replaces every one of
-- their nicks; a nick is stored only as a keyed hash (see src/replays/pseudonym.ts), never in clear.
CREATE TABLE suppressed_person (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "pseudonym" text NOT NULL UNIQUE
);
CREATE TABLE suppressed_nick (
  "hmac" text PRIMARY KEY,
  "person_id" integer NOT NULL REFERENCES suppressed_person(id) ON DELETE CASCADE
);

--------------------------------------------------------------------------------
-- Down

DROP TABLE suppressed_nick;
DROP TABLE suppressed_person;
