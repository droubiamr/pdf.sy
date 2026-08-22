-- pdf.sy phase 1. Accounts arrive in phase 2; until then a document is owned
-- by whoever holds its manage_token.

CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT,
  title           TEXT NOT NULL,
  manage_token    TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'ready',   -- processing | ready | blocked
  created_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);

CREATE TABLE IF NOT EXISTS document_versions (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  r2_key      TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  page_count  INTEGER,
  created_at  INTEGER NOT NULL,
  UNIQUE (document_id, version)
);

-- One document, many links. This is how you send the same deck to twelve
-- investors and still tell them apart.
CREATE TABLE IF NOT EXISTS links (
  slug           TEXT PRIMARY KEY,
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  pinned_version INTEGER,
  name           TEXT,
  password_hash  TEXT,
  allow_download INTEGER NOT NULL DEFAULT 1,
  expires_at     INTEGER,
  revoked_at     INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_doc ON links(document_id);

CREATE TABLE IF NOT EXISTS view_sessions (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL REFERENCES links(slug) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  viewer_email TEXT,
  country      TEXT,
  ip_hash      TEXT,          -- salted per day; the raw IP is never stored
  device       TEXT,
  referrer     TEXT,
  started_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  total_ms     INTEGER NOT NULL DEFAULT 0,
  max_page     INTEGER NOT NULL DEFAULT 0,
  downloaded   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_slug ON view_sessions(slug, started_at DESC);

CREATE TABLE IF NOT EXISTS page_stats (
  slug     TEXT NOT NULL,
  version  INTEGER NOT NULL,
  page     INTEGER NOT NULL,
  views    INTEGER NOT NULL DEFAULT 0,
  total_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, version, page)
);

CREATE TABLE IF NOT EXISTS blocked_hashes (
  sha256     TEXT PRIMARY KEY,
  reason     TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS abuse_reports (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL,
  reason         TEXT NOT NULL,
  reporter_email TEXT,
  status         TEXT NOT NULL DEFAULT 'open',
  created_at     INTEGER NOT NULL
);
