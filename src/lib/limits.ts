// Request limits.
//
// Read this before changing anything here: a limiter that lives inside the
// Worker runs *after* the request has already been paid for, and every check
// below costs a D1 write. That makes this the second line of defence, not the
// first. The first is a WAF rate-limiting rule and a Turnstile challenge in the
// Cloudflare dashboard — see SECURITY.md. What this file buys is a correctness
// guarantee (no single client can run the storage bill up, brute-force a
// document password, or mail-bomb an owner) rather than raw volume protection.
//
// The limits are deliberately generous. A limiter that fires on real use is a
// bug report waiting to happen, and the numbers here are ceilings on abuse, not
// quotas on normal work.
import type { Context } from "hono";
import type { Bindings } from "../db/schema";
import type { Env } from "./context";
import { hashIp } from "./ids";

export type Limit = { limit: number; windowMs: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Every limited action, in one table.
 *
 * Grouped by what an attacker gains, because that is what decides the number:
 * uploads cost storage, magic links and view pings cost someone else's inbox,
 * unlocks cost CPU, and reports cost a person's attention.
 */
export const LIMITS = {
  /** Storage. The expensive one — this is the bill-running vector. */
  upload: { limit: 20, windowMs: DAY },
  uploadBurst: { limit: 5, windowMs: 10 * MINUTE },

  /** Somebody else's inbox. */
  magicLink: { limit: 10, windowMs: HOUR },

  /** PBKDF2 at 100k iterations. Cheap to ask for, expensive to answer. */
  unlock: { limit: 10, windowMs: 15 * MINUTE },

  // Fabricated analytics, and the "someone opened it" email behind them.
  //
  // Set high on purpose: a whole office behind one NAT address opening a
  // company-wide document must not trip this. It exists to stop a script, and
  // a script will exceed it by orders of magnitude.
  viewSession: { limit: 200, windowMs: HOUR },
  ping: { limit: 600, windowMs: HOUR },

  /**
   * Notification emails per link per day, keyed by slug rather than by caller.
   *
   * This is the one that actually protects an owner's inbox. Per-IP limits do
   * not: sessions are anonymous and cheap, so a spread-out attacker stays under
   * every per-caller ceiling while the mail still lands in one place. Capping
   * the destination is the only limit that holds regardless of where the
   * traffic comes from.
   */
  notify: { limit: 100, windowMs: DAY },

  /** A person reads these. */
  report: { limit: 5, windowMs: HOUR },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

export type Verdict = {
  ok: boolean;
  /** Seconds until the window rolls over. Goes straight into Retry-After. */
  retryAfter: number;
};

/**
 * A stable, non-identifying handle for the caller.
 *
 * Salted per day and per scope so the same visitor is not correlatable across
 * either, which keeps the "we never store your IP" promise literally true.
 */
export async function clientKey(c: Context<Env>, scope: string): Promise<string> {
  const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";
  return hashIp(ip, `ratelimit:${scope}`);
}

/**
 * Counts one hit against a fixed window and says whether it fits.
 *
 * Fixed rather than sliding: it is one upsert instead of a range scan, and the
 * worst case — twice the limit across a window boundary — is irrelevant at
 * these numbers. `RETURNING` makes the read-modify-write a single atomic
 * statement, so two simultaneous requests cannot both see the same count.
 */
export async function hit(
  db: D1Database,
  name: LimitName,
  key: string,
): Promise<Verdict> {
  const { limit, windowMs } = LIMITS[name];
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expiresAt = windowStart + windowMs;
  const bucket = `${name}:${key}:${windowStart}`;

  try {
    const row = await db
      .prepare(
        `INSERT INTO rate_limits (bucket, count, expires_at) VALUES (?, 1, ?)
         ON CONFLICT (bucket) DO UPDATE SET count = count + 1
         RETURNING count`,
      )
      .bind(bucket, expiresAt)
      .first<{ count: number }>();

    const count = row?.count ?? 1;
    return { ok: count <= limit, retryAfter: Math.ceil((expiresAt - now) / 1000) };
  } catch (error) {
    // Fail open, loudly. A limiter that takes the site down when its own table
    // is unavailable has caused the outage it exists to prevent.
    console.error("rate limit check failed", name, error);
    return { ok: true, retryAfter: 0 };
  }
}

/** `hit`, keyed by the caller's address, for the common case. */
export async function hitByClient(c: Context<Env>, name: LimitName): Promise<Verdict> {
  return hit(c.env.DB, name, await clientKey(c, name));
}

/**
 * The 429 body.
 *
 * Shape follows the route, not the request headers. Sniffing `Accept` looked
 * tidier until a browser upload — multipart request, no Accept header — got
 * plain text back and the client's `JSON.parse` fell through to a generic
 * "upload failed", hiding the one message that would have told the person to
 * simply wait. A route knows what it speaks; the header does not.
 */
export function tooMany(
  c: Context<Env>,
  verdict: Verdict,
  message: string,
  format: "json" | "text" = "text",
) {
  const headers = { "retry-after": String(Math.max(1, verdict.retryAfter)) };

  return format === "json"
    ? c.json({ error: message, code: "rate_limited" }, 429, headers)
    : c.text(message, 429, headers);
}

/* ------------------------------ plan ceilings ----------------------------- */

/**
 * Active links an account is holding. Only counts links that still resolve —
 * revoked and expired ones cost nothing and should not count against anyone.
 */
export async function activeLinkCount(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM links l
         JOIN documents d ON d.id = l.document_id
        WHERE d.owner_id = ?
          AND d.deleted_at IS NULL
          AND d.status != 'blocked'
          AND l.revoked_at IS NULL
          AND (l.expires_at IS NULL OR l.expires_at > ?)`,
    )
    .bind(userId, Date.now())
    .first<{ n: number }>();

  return row?.n ?? 0;
}

/** Has this uploader been blocked outright? */
export async function isBlockedUploader(db: D1Database, uploaderHash: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT uploader_hash FROM blocked_uploaders
        WHERE uploader_hash = ? AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .bind(uploaderHash, Date.now())
    .first();

  return row !== null;
}

/** Bulk-removes windows that have rolled over. Called from the nightly cron. */
export async function purgeExpiredLimits(env: Bindings): Promise<number> {
  const result = await env.DB.prepare(`DELETE FROM rate_limits WHERE expires_at < ?`)
    .bind(Date.now())
    .run();
  return result.meta.changes ?? 0;
}
