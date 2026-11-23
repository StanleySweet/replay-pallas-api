--------------------------------------------------------------------------------
-- Up

-- The 0 A.D. release a replay was played on (26 for A26 / 0.0.26, 27 for 0.27.x,
-- 28 for 0.28.x), so lists and ratings can be split per release. NULL means not
-- computed yet, 0 means the metadata does not say. Filled by the API: at upload,
-- by the rebuild, and for existing rows by a backfill when the server starts.
ALTER TABLE replays ADD COLUMN "game_release" integer NULL;
CREATE INDEX ix_replays_game_release ON replays(game_release);

--------------------------------------------------------------------------------
-- Down

DROP INDEX ix_replays_game_release;
ALTER TABLE replays DROP COLUMN "game_release";
