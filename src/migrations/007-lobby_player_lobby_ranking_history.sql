--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE lobby_ranking_history (
  "id" integer NOT NULL CONSTRAINT "PK_lobby_players_rankings" PRIMARY KEY,
  "lobby_player_id" integer NOT NULL,
  "elo" integer NOT NULL,
  "match_id" text NOT NULL,
  "date" timestamp
  with
    time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY(lobby_player_id) REFERENCES lobby_players(id),
  FOREIGN KEY(match_id) REFERENCES replays(match_id)
);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE lobby_ranking_history;


