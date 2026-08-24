-- Abuse and availability hardening.
--
-- Three things this adds: somewhere to count requests, somewhere to record who
-- uploaded a file, and the indexes the nightly retention sweep needs to find
-- expired work without a table scan.

-- Fixed-window request counters. The bucket key already contains the window
-- start, so an expired window is simply a row nobody looks at again; the cron
-- deletes them in bulk rather than on the request path.
--
-- The identifier inside a bucket key is always a HASH of the client IP, never
-- the IP itself — the privacy policy promises raw addresses are never stored,
-- and a rate limiter is not an exception to that.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket     TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON rate_limits(expires_at);

-- Who uploaded this, as a daily-salted hash. Enough to block a repeat abuser
-- for a day without ever holding an address that could identify them.
ALTER TABLE documents ADD COLUMN uploader_hash TEXT;

-- Why a document was blocked, so a takedown is auditable rather than a status
-- flag nobody can explain six months later.
ALTER TABLE documents ADD COLUMN blocked_reason TEXT;

-- The serving path now filters on status and deleted_at, and the retention
-- sweep scans links by expiry. Both need to be cheap.
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_links_expiry ON links(expires_at);

-- Blocking by uploader, not only by exact file hash: changing one byte defeats
-- a sha256 block, but the person doing it is still the same person.
CREATE TABLE IF NOT EXISTS blocked_uploaders (
  uploader_hash TEXT PRIMARY KEY,
  reason        TEXT,
  expires_at    INTEGER,
  created_at    INTEGER NOT NULL
);
