--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------


CREATE TABLE replays (
    "id" integer NOT NULL CONSTRAINT "PK_theater" PRIMARY KEY,
    "match_id"  TEXT        NOT NULL UNIQUE,
    "metadata" TEXT        NOT NULL,
    "filedata" TEXT        NOT NULL,
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

DROP TABLE replays;
