--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

Create Table local_ratings_configuration(
  "id" integer NOT NULL CONSTRAINT "PK_local_ratings_configuration" PRIMARY KEY,
  "section" text NOT NULL,
  "key" text NOT NULL,
  "value" text NOT NULL,
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

DROP TABLE local_ratings_configuration;
