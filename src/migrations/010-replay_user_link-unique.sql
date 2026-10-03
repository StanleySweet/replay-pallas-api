--------------------------------------------------------------------------------
-- Up

-- One uploader per replay. The table had no uniqueness constraint, so a replay
-- uploaded more than once produced several identical (user_id, match_id) rows
-- and "My replays" returned the same match_id repeatedly.

DELETE FROM replay_user_link
WHERE id NOT IN (
  SELECT MIN(id) FROM replay_user_link GROUP BY user_id, match_id
);

CREATE UNIQUE INDEX ux_replay_user_link_user_match
ON replay_user_link(user_id, match_id);

--------------------------------------------------------------------------------
-- Down

DROP INDEX ux_replay_user_link_user_match;