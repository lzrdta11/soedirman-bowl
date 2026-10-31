-- Schema for Soedirman Bowl Cloudflare D1 Database

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  tier TEXT NOT NULL,
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  date TEXT,
  title TEXT,
  status TEXT DEFAULT 'scheduled',
  note TEXT DEFAULT '',
  format TEXT DEFAULT 'bo3',
  ts INTEGER NOT NULL,
  ra TEXT DEFAULT '[]',
  rb TEXT DEFAULT '[]',
  ev TEXT DEFAULT '[]',
  fin TEXT DEFAULT '[]',
  ps TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS stats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  cp INTEGER DEFAULT 0,
  ct INTEGER DEFAULT 0,
  td INTEGER DEFAULT 0,
  fp INTEGER DEFAULT 0,
  bw INTEGER DEFAULT 0,
  it INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- Default meta entries
INSERT OR IGNORE INTO meta (key, value, updated_at) VALUES
  ('cycle', '{"open":false,"startedAt":0,"closeAt":0}', 1761714000000),
  ('draft_codes', '{"A":"","B":""}', 1761714000000),
  ('draft_state', '{"capA":"","capB":"","first":"","started":false,"picks":[]}', 1761714000000),
  ('version', '1', 1761714000000);
