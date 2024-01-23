--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE lobby_players (
  "id" integer NOT NULL CONSTRAINT "PK_replay_lobby_player_link" PRIMARY KEY,
  "nick" text NOT NULL UNIQUE,
  "modification_date" timestamp
  with
    time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  "creation_date" timestamp
  with
    time zone NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE replay_lobby_player_link (
  "id" integer NOT NULL CONSTRAINT "PK_replay_lobby_player_link" PRIMARY KEY,
  "lobby_player_id" text NOT NULL,
  "match_id" text NOT NULL,
  FOREIGN KEY(lobby_player_id) REFERENCES lobby_players(id)
  FOREIGN KEY(match_id) REFERENCES replays(match_id)
);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE lobby_players;
DROP TABLE replay_lobby_player_link;
