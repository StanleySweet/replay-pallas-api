--------------------------------------------------------------------------------
-- Up

-- The three tables that hang off a replay had no way to follow it: deleting a
-- replay meant four hand-ordered DELETEs, and a forgotten table left orphans.
-- They now cascade on match_id.
--
-- Their id columns were also declared TEXT while the parents use INTEGER. Rows
-- came in as '47.0' (forum import, and REAL parameters bound into a TEXT column),
-- which never equals 47: an uploader's own replays did not match their id, and
-- the foreign keys to users and lobby_players could not hold. The columns are
-- INTEGER now, so '47.0' and 47.0 are stored as 47.
--
-- SQLite cannot add ON DELETE or change a column type in place, so each table
-- is rebuilt. Nothing references these three tables, so dropping them is safe.

-- Rows whose parent is gone mean nothing and would break the new foreign keys.
DELETE FROM replay_user_link
WHERE match_id NOT IN (SELECT match_id FROM replays)
   OR CAST(user_id AS INTEGER) NOT IN (SELECT id FROM users);

DELETE FROM replay_lobby_player_link
WHERE match_id NOT IN (SELECT match_id FROM replays)
   OR CAST(lobby_player_id AS INTEGER) NOT IN (SELECT id FROM lobby_players);

DELETE FROM lobby_ranking_history
WHERE match_id NOT IN (SELECT match_id FROM replays)
   OR lobby_player_id NOT IN (SELECT id FROM lobby_players);

DROP INDEX ux_replay_user_link_user_match;

CREATE TABLE replay_user_link_new (
  "id" integer NOT NULL PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES users(id),
  "match_id" text NOT NULL REFERENCES replays(match_id) ON DELETE CASCADE,
  "modification_date" timestamp with time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  "creation_date" timestamp with time zone NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- '47' and '47.0' were distinct strings, so the old unique index let both exist
-- for one replay. Keep the oldest row of each (user, replay) pair.
INSERT INTO replay_user_link_new (id, user_id, match_id, modification_date, creation_date)
SELECT MIN(id), CAST(user_id AS INTEGER), match_id, modification_date, creation_date
FROM replay_user_link
GROUP BY CAST(user_id AS INTEGER), match_id;

DROP TABLE replay_user_link;
ALTER TABLE replay_user_link_new RENAME TO replay_user_link;

CREATE UNIQUE INDEX ux_replay_user_link_user_match ON replay_user_link(user_id, match_id);
CREATE INDEX ix_replay_user_link_match_id ON replay_user_link(match_id);

CREATE TABLE replay_lobby_player_link_new (
  "id" integer NOT NULL PRIMARY KEY,
  "lobby_player_id" integer NOT NULL REFERENCES lobby_players(id),
  "match_id" text NOT NULL REFERENCES replays(match_id) ON DELETE CASCADE
);

INSERT INTO replay_lobby_player_link_new (id, lobby_player_id, match_id)
SELECT id, CAST(lobby_player_id AS INTEGER), match_id FROM replay_lobby_player_link;

DROP TABLE replay_lobby_player_link;
ALTER TABLE replay_lobby_player_link_new RENAME TO replay_lobby_player_link;

CREATE INDEX ix_replay_lobby_player_link_match_id ON replay_lobby_player_link(match_id);

CREATE TABLE lobby_ranking_history_new (
  "id" integer NOT NULL PRIMARY KEY,
  "lobby_player_id" integer NOT NULL REFERENCES lobby_players(id),
  "elo" integer NOT NULL,
  "match_id" text NOT NULL REFERENCES replays(match_id) ON DELETE CASCADE,
  "date" timestamp with time zone NULL DEFAULT (CURRENT_TIMESTAMP)
);

INSERT INTO lobby_ranking_history_new (id, lobby_player_id, elo, match_id, date)
SELECT id, lobby_player_id, elo, match_id, date FROM lobby_ranking_history;

DROP TABLE lobby_ranking_history;
ALTER TABLE lobby_ranking_history_new RENAME TO lobby_ranking_history;

CREATE INDEX ix_lobby_ranking_history_match_id ON lobby_ranking_history(match_id);

--------------------------------------------------------------------------------
-- Down

-- Restores the old shape (TEXT ids, no cascade). The rows removed as orphans
-- and the duplicate uploader links merged by Up do not come back.

DROP INDEX ix_lobby_ranking_history_match_id;
DROP INDEX ix_replay_lobby_player_link_match_id;
DROP INDEX ix_replay_user_link_match_id;
DROP INDEX ux_replay_user_link_user_match;

CREATE TABLE lobby_ranking_history_old (
  "id" integer NOT NULL CONSTRAINT "PK_lobby_players_rankings" PRIMARY KEY,
  "lobby_player_id" integer NOT NULL,
  "elo" integer NOT NULL,
  "match_id" text NOT NULL,
  "date" timestamp with time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY(lobby_player_id) REFERENCES lobby_players(id),
  FOREIGN KEY(match_id) REFERENCES replays(match_id)
);
INSERT INTO lobby_ranking_history_old SELECT id, lobby_player_id, elo, match_id, date FROM lobby_ranking_history;
DROP TABLE lobby_ranking_history;
ALTER TABLE lobby_ranking_history_old RENAME TO lobby_ranking_history;

CREATE TABLE replay_lobby_player_link_old (
  "id" integer NOT NULL CONSTRAINT "PK_replay_lobby_player_link" PRIMARY KEY,
  "lobby_player_id" text NOT NULL,
  "match_id" text NOT NULL,
  FOREIGN KEY(lobby_player_id) REFERENCES lobby_players(id)
  FOREIGN KEY(match_id) REFERENCES replays(match_id)
);
INSERT INTO replay_lobby_player_link_old SELECT id, lobby_player_id, match_id FROM replay_lobby_player_link;
DROP TABLE replay_lobby_player_link;
ALTER TABLE replay_lobby_player_link_old RENAME TO replay_lobby_player_link;

CREATE TABLE replay_user_link_old (
  "id" integer NOT NULL CONSTRAINT "PK_replay_lobby_player_link" PRIMARY KEY,
  "user_id" text NOT NULL,
  "match_id" text NOT NULL,
  "modification_date" timestamp with time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  "creation_date" timestamp with time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY(user_id) REFERENCES users(id)
  FOREIGN KEY(match_id) REFERENCES replays(match_id)
);
INSERT INTO replay_user_link_old SELECT id, user_id, match_id, modification_date, creation_date FROM replay_user_link;
DROP TABLE replay_user_link;
ALTER TABLE replay_user_link_old RENAME TO replay_user_link;

CREATE UNIQUE INDEX ux_replay_user_link_user_match ON replay_user_link(user_id, match_id);
