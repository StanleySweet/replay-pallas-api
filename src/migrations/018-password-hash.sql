--------------------------------------------------------------------------------
-- Up

-- The server hashes passwords itself, with a salt per user (src/users/passwordHash.ts). Until now
-- users.password held what the browser sent: a bcrypt hash made with one salt shared by everybody,
-- which was enough to log in with, so a copy of the table was a copy of every login. password stays
-- for accounts that have not logged in since: it is emptied when the account moves to password_hash.
ALTER TABLE users ADD COLUMN "password_hash" text NULL;

--------------------------------------------------------------------------------
-- Down

ALTER TABLE users DROP COLUMN "password_hash";
