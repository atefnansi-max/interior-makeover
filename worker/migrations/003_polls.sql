-- Family votes: an owner shares 2 to 6 of their designs; anyone with the link hearts one favourite.
-- Items keep their own copy of the thumbnail so a poll still shows if the design is deleted later.
CREATE TABLE IF NOT EXISTS polls (
  id         TEXT PRIMARY KEY,           -- 16 random hex characters, the share link
  owner      TEXT NOT NULL,              -- account id (guest library code or "g:" + Google id)
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS polls_by_owner ON polls (owner, created_at DESC);

CREATE TABLE IF NOT EXISTS poll_items (
  poll_id   TEXT NOT NULL,
  idx       INTEGER NOT NULL,
  design_id TEXT NOT NULL,
  name      TEXT NOT NULL,
  thumb     TEXT,
  image_key TEXT,
  PRIMARY KEY (poll_id, idx)
);

-- One favourite per voter (a random id kept in the voter's browser); voting again changes it
CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id    TEXT NOT NULL,
  voter      TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  idx        INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (poll_id, voter)
);
