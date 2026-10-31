-- Saved designs. Each browser has a private library id; full images live in the DESIGN_IMAGES KV store.
CREATE TABLE IF NOT EXISTS designs (
  id         TEXT PRIMARY KEY,
  library    TEXT NOT NULL,
  name       TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  style      TEXT NOT NULL,
  room       TEXT NOT NULL,
  cost       INTEGER,
  thumb      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS designs_by_library ON designs (library, created_at DESC);
