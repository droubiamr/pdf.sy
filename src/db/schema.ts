// Type-level mirror of migrations/0000_init.sql. Hand-written rather than
// generated so there is exactly one source of truth to read.

export type Document = {
  id: string;
  owner_id: string | null;
  title: string;
  manage_token: string;
  current_version: number;
  status: "processing" | "ready" | "blocked";
  created_at: number;
  deleted_at: number | null;
};

export type DocumentVersion = {
  id: string;
  document_id: string;
  version: number;
  r2_key: string;
  sha256: string;
  size_bytes: number;
  page_count: number | null;
  created_at: number;
};

export type Link = {
  slug: string;
  document_id: string;
  pinned_version: number | null;
  name: string | null;
  password_hash: string | null;
  allow_download: number;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
};

export type ViewSession = {
  id: string;
  slug: string;
  version: number;
  viewer_email: string | null;
  country: string | null;
  ip_hash: string | null;
  device: string | null;
  referrer: string | null;
  started_at: number;
  last_seen_at: number;
  total_ms: number;
  max_page: number;
  downloaded: number;
};

export type PageStat = {
  slug: string;
  version: number;
  page: number;
  views: number;
  total_ms: number;
};

export type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  /** Optional override; the request's own origin is used when unset. */
  SITE_URL?: string;
  /** Set with `wrangler secret put RESEND_API_KEY`. Absent locally: mail is logged. */
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  /** All set with `wrangler secret put`; billing is simply off without them. */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_LITE_MONTHLY?: string;
  STRIPE_PRICE_LITE_YEARLY?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_PRO_YEARLY?: string;
  ANON_LINK_TTL_DAYS: string;
  MAX_UPLOAD_MB: string;
  /** Public, so it lives in wrangler.toml. Absent means the widget is off. */
  TURNSTILE_SITE_KEY?: string;
  /** `wrangler secret put TURNSTILE_SECRET`. Absent means checks are skipped. */
  TURNSTILE_SECRET?: string;
  /** Comma-separated allowlist. Falls back to the request's own host. */
  TURNSTILE_HOSTNAMES?: string;
};
