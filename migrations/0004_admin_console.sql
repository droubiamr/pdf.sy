-- The admin console.
--
-- Three things the console needs that nothing in the app was recording yet: a
-- log of privileged actions, proof that the nightly cron actually ran, and a
-- timestamp on plan changes. All three are write-once history — nothing here
-- can be reconstructed after the fact, which is exactly why they are tables and
-- not derived queries.

-- Every privileged action, appended and never updated.
--
-- `detail` is JSON rather than columns because the interesting field differs
-- per action (a block has a reason, a plan change has a from/to) and a schema
-- migration per new action type would guarantee the log goes stale.
CREATE TABLE IF NOT EXISTS admin_audit (
  id           TEXT PRIMARY KEY,
  actor_email  TEXT NOT NULL,
  action       TEXT NOT NULL,          -- block | unblock | delete | resolve | ...
  target_type  TEXT NOT NULL,          -- document | link | user | report | uploader
  target_id    TEXT,
  target_label TEXT,                   -- human-readable, frozen at write time
  detail       TEXT,                   -- JSON blob
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_time ON admin_audit(created_at DESC);

-- One row per run of the retention sweep.
--
-- "The cron is fine" and "the cron has not run since Tuesday" look identical
-- from outside, and the second one is a privacy-policy breach in slow motion:
-- files that were promised deleted are still sitting in R2. A row per run is
-- the cheapest possible way to tell the two apart.
CREATE TABLE IF NOT EXISTS sweep_runs (
  id          TEXT PRIMARY KEY,
  ran_at      INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  documents   INTEGER NOT NULL DEFAULT 0,
  objects     INTEGER NOT NULL DEFAULT 0,
  sessions    INTEGER NOT NULL DEFAULT 0,
  magic_links INTEGER NOT NULL DEFAULT 0,
  limits      INTEGER NOT NULL DEFAULT 0,
  error       TEXT                     -- NULL on a clean run
);
CREATE INDEX IF NOT EXISTS idx_sweep_runs_time ON sweep_runs(ran_at DESC);

-- When this user's plan last changed, set by the one UPDATE in routes/billing.
-- Without it "new paid this month" and "churned this month" are unanswerable:
-- the users table only ever knew the current state. Existing rows stay NULL —
-- the history genuinely does not exist for them, and a backfilled guess would
-- be worse than an honest gap.
ALTER TABLE users ADD COLUMN plan_changed_at INTEGER;

-- Indexes for the console's own queries. Every one of these backs a scan the
-- app itself never does: the app always asks about one slug or one owner, the
-- console always asks about a time window across everybody.
CREATE INDEX IF NOT EXISTS idx_sessions_started_all ON view_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON view_sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_created ON links(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_status ON abuse_reports(status, created_at DESC);
