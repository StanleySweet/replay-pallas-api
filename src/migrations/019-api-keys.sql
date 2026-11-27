-- Up

-- Keys for tools (the Replay Pallas mod) that must not keep the account password. Only the SHA-256 of
-- the key is stored, the key itself is shown once when it is made. role is the most the key may do,
-- never above the owner's own role and never ADMINISTRATOR. expires_at is NULL for a key that does not
-- expire; revoked keys are deleted.
CREATE TABLE api_keys (
    id integer PRIMARY KEY AUTOINCREMENT,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label text NOT NULL,
    key_hash text NOT NULL UNIQUE,
    role integer NOT NULL,
    creation_date text NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at text NULL,
    last_used_at text NULL
);
CREATE INDEX api_keys_user_id ON api_keys(user_id);

--------------------------------------------------------------------------------
-- Down

DROP TABLE api_keys;
