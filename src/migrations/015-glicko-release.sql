--------------------------------------------------------------------------------
-- Up

-- Glicko ratings per 0 A.D. release. NULL is the set rated over every replay, which is what the
-- table held before, so existing rows and readers are unchanged. A number is the set rated over the
-- replays of that release only (replays.game_release).
ALTER TABLE glicko2_rankings ADD COLUMN "game_release" integer NULL;
CREATE INDEX ix_glicko2_rankings_release ON glicko2_rankings(game_release, lobby_player_id);

--------------------------------------------------------------------------------
-- Down

DROP INDEX ix_glicko2_rankings_release;
ALTER TABLE glicko2_rankings DROP COLUMN "game_release";
