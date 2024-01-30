--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE glicko2_rankings (
  "id" integer NOT NULL CONSTRAINT "PK_glicko2_rankings" PRIMARY KEY,
  "lobby_player_id" integer NOT NULL,
  "match_count" integer NOT NULL,
  "date" timestamp with
  time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  "elo" REAL NOT NULL,
  "deviation" REAL NOT NULL,
  "preview_deviation" REAL NOT NULL,
  "volatility" REAL NOT NULL,
  FOREIGN KEY(lobby_player_id) REFERENCES lobby_players(id)
);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE glicko2_rankings;


