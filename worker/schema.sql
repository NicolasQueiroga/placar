-- Latest snapshot per (race, uf) — powers /feed
CREATE TABLE IF NOT EXISTS snapshots (
  race TEXT NOT NULL,
  uf TEXT NOT NULL,
  sections_counted INTEGER,
  sections_total INTEGER,
  electors INTEGER,
  valid INTEGER,
  turnout REAL,
  candidates TEXT, -- JSON array
  status TEXT,
  fetched_at INTEGER,
  PRIMARY KEY (race, uf)
);

-- Append-only minute history — powers /history and the trend chart
CREATE TABLE IF NOT EXISTS history (
  ts INTEGER NOT NULL,
  race TEXT NOT NULL,
  uf TEXT NOT NULL,
  sections_pct REAL,
  candidates TEXT
);
CREATE INDEX IF NOT EXISTS idx_history_ts ON history (ts);
