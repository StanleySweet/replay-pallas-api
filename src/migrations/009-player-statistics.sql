--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE user_statistics_cache (
  "total_played_time" REAL NOT NULL,
  "match_count" integer NOT NULL,
  "second_most_used_cmd" TEXT NOT NULL,
  "most_used_cmd" TEXT NOT NULL,
  "win_rate_ratio" REAL NOT NULL,
  "average_cpm" REAL NOT NULL,
  "modification_date" timestamp with
  time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  "creation_date" timestamp with
  time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  "lobby_player_id" integer NOT NULL,
  FOREIGN KEY(lobby_player_id) REFERENCES lobby_players(id)
);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE user_statistics_cache;

