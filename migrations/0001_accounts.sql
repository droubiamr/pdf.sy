-- Accounts. Magic links only: there is no password to leak, reset, or support.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  plan       TEXT NOT NULL DEFAULT 'free',   -- free | lite | pro
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);

-- The id IS the SHA-256 of the cookie value. The raw token exists only in the
-- user's browser, so a database dump cannot be replayed as a login.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

-- Same trick: the id is the hash of the token that went out in the email.
CREATE TABLE IF NOT EXISTS magic_links (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email, created_at DESC);

-- Owners can mute a noisy link without revoking it.
ALTER TABLE links ADD COLUMN notify_on_view INTEGER NOT NULL DEFAULT 1;

-- One "someone opened it" email per view session, not per ping.
ALTER TABLE view_sessions ADD COLUMN notified_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id, created_at DESC);
