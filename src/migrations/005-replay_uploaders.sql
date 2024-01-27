
CREATE TABLE replay_user_link (
  "id" integer NOT NULL CONSTRAINT "PK_replay_lobby_player_link" PRIMARY KEY,
  "user_id" text NOT NULL,
  "match_id" text NOT NULL,
  "modification_date" timestamp
  with
    time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  "creation_date" timestamp
  with
    time zone NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY(user_id) REFERENCES users(id)
  FOREIGN KEY(match_id) REFERENCES replays(match_id)
);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE replay_user_link;
