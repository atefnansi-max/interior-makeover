-- Accounts: guests (id = library code) and Google users (id = "g:" + Google user id)
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,            -- 'guest' or 'google'
  email         TEXT,
  name          TEXT,
  picture       TEXT,
  tokens        INTEGER NOT NULL DEFAULT 50,
  bonus_claimed INTEGER NOT NULL DEFAULT 0,
  merged_into   TEXT,                     -- a guest that signed in points to its Google account
  created_at    TEXT NOT NULL
);

-- Sign-in sessions (random 64-character tokens kept in the browser)
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_account ON sessions (account_id);

-- Designs now keep every generation (kind) and a favorite flag; saved designs from before count as favorites
ALTER TABLE designs ADD COLUMN favorite INTEGER NOT NULL DEFAULT 1;
ALTER TABLE designs ADD COLUMN kind TEXT NOT NULL DEFAULT 'saved';
ALTER TABLE designs ADD COLUMN image_key TEXT;
