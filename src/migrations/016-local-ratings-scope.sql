--------------------------------------------------------------------------------
-- Up

-- Local ratings per 0 A.D. release. scope 0 is the set computed over every replay, which is what
-- the two tables held before, so the existing rows move over unchanged and no cache has to be
-- rebuilt. A scope above 0 is the set computed over the replays of that release only
-- (replays.game_release). Both tables are derived from the replays.
CREATE TABLE local_ratings_new (
  "scope" integer NOT NULL DEFAULT 0,
  "player" text NOT NULL,
  "data" text NOT NULL,
  PRIMARY KEY ("scope", "player")
);
INSERT INTO local_ratings_new (scope, player, data) SELECT 0, player, data FROM local_ratings ORDER BY rowid;
DROP TABLE local_ratings;
ALTER TABLE local_ratings_new RENAME TO local_ratings;

CREATE TABLE local_history_new (
  "scope" integer NOT NULL DEFAULT 0,
  "player" text NOT NULL,
  "data" text NOT NULL,
  PRIMARY KEY ("scope", "player")
);
INSERT INTO local_history_new (scope, player, data) SELECT 0, player, data FROM local_history ORDER BY rowid;
DROP TABLE local_history;
ALTER TABLE local_history_new RENAME TO local_history;

--------------------------------------------------------------------------------
-- Down

CREATE TABLE local_ratings_old ("player" text NOT NULL PRIMARY KEY, "data" text NOT NULL);
INSERT INTO local_ratings_old (player, data) SELECT player, data FROM local_ratings WHERE scope = 0 ORDER BY rowid;
DROP TABLE local_ratings;
ALTER TABLE local_ratings_old RENAME TO local_ratings;
CREATE TABLE local_history_old ("player" text NOT NULL PRIMARY KEY, "data" text NOT NULL);
INSERT INTO local_history_old (player, data) SELECT player, data FROM local_history WHERE scope = 0 ORDER BY rowid;
DROP TABLE local_history;
ALTER TABLE local_history_old RENAME TO local_history;
