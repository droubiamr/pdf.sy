-- Billing state lives on the user; Stripe remains the source of truth and this
-- is only a cache of what its webhooks last told us.
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN plan_status TEXT;        -- active | past_due | canceled
ALTER TABLE users ADD COLUMN plan_renews_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);

-- Which version a link serves is already in links.pinned_version; this records
-- who last replaced the file, so the stats page can say "updated 2 days ago".
ALTER TABLE document_versions ADD COLUMN label TEXT;
