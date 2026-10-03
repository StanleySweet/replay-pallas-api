--------------------------------------------------------------------------------
-- Up

-- Accounts sharing a nick are duplicates of the same person: same login, same
-- uploads. They are merged into the most recently created account, which keeps
-- its credentials and id; the older rows are deleted and their uploads are
-- re-pointed at the survivor.

DROP INDEX ux_replay_user_link_user_match;

-- Uploads imported from the forum store user_id as '12.0'. Normalise to integers
-- so the comparisons below are plain equality instead of type juggling.
UPDATE replay_user_link SET user_id = CAST(user_id AS INTEGER);

CREATE TEMP TABLE user_merge AS
SELECT u.id AS old_id,
       (SELECT k.id FROM users k WHERE k.nick = u.nick
         ORDER BY k.creation_date DESC, k.id DESC LIMIT 1) AS keep_id
FROM users u;

-- The survivor inherits the highest role of the group, so merging never
-- silently downgrades an administrator.
UPDATE users
SET role = (SELECT MAX(u2.role) FROM users u2 WHERE u2.nick = users.nick)
WHERE id IN (SELECT keep_id FROM user_merge);

UPDATE replay_user_link
SET user_id = (SELECT keep_id FROM user_merge WHERE old_id = replay_user_link.user_id)
WHERE user_id IN (SELECT old_id FROM user_merge WHERE old_id <> keep_id);

-- Two merged accounts can have uploaded the same replay: keep the oldest link.
DELETE FROM replay_user_link
WHERE id NOT IN (
  SELECT MIN(id) FROM replay_user_link GROUP BY user_id, match_id
);

DELETE FROM users
WHERE id IN (SELECT old_id FROM user_merge WHERE old_id <> keep_id);

CREATE UNIQUE INDEX ux_replay_user_link_user_match
ON replay_user_link(user_id, match_id);

--------------------------------------------------------------------------------
-- Down

DROP INDEX ux_replay_user_link_user_match;