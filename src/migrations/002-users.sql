--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE users (
  "id" integer NOT NULL CONSTRAINT "PK_theater" PRIMARY KEY,
  "nick" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password" text NOT NULL,
  "role" integer NOT NULL,
  "modification_date" timestamp
  with
    time zone NULL DEFAULT (CURRENT_TIMESTAMP),
    "creation_date" timestamp
  with
    time zone NULL DEFAULT (CURRENT_TIMESTAMP)
);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE users;
