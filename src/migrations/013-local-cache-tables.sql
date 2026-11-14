--------------------------------------------------------------------------------
-- Up

-- The local-ratings caches used to live in four JSON files under dist/cache/.
-- Three of them (replays, ratings, history) are derived from `replays`; aliases
-- are the only data that exists nowhere else. Each row holds one key of the old
-- file: `data` is the JSON of that key's minified value, so the shapes the
-- Minifier produces are unchanged.
--
-- A replay's cache row cascades with the replay, so deleting a replay can no
-- longer leave it behind in the cache.

CREATE TABLE local_replays (
  "match_id" text NOT NULL PRIMARY KEY REFERENCES replays(match_id) ON DELETE CASCADE,
  "data" text NOT NULL
);

CREATE TABLE local_ratings (
  "player" text NOT NULL PRIMARY KEY,
  "data" text NOT NULL
);

CREATE TABLE local_history (
  "player" text NOT NULL PRIMARY KEY,
  "data" text NOT NULL
);

CREATE TABLE local_aliases (
  "alias_group" text NOT NULL PRIMARY KEY,
  "data" text NOT NULL
);

--------------------------------------------------------------------------------
-- Down

DROP TABLE local_aliases;
DROP TABLE local_history;
DROP TABLE local_ratings;
DROP TABLE local_replays;
