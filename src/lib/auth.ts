// Magic-link auth. No passwords means no password database, no reset flow, and
// no credential stuffing — the whole surface is "can you read this inbox".
//
// The rule that makes it safe: every token is random, and only its SHA-256 is
// stored. A stolen database dump cannot be replayed as a login.
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import type { Bindings } from "../db/schema";
import type { Env } from "./context";
import { newId, sha256Hex } from "./ids";

// The real environment rather than a hand-copied shape. This is a type-only
// import, so the cycle with lib/context.ts (which imports `User` from here)
// costs nothing at runtime — and it means adding a request variable cannot
// leave a second, stale definition of the same thing behind in this file.
type Ctx = Context<Env>;

export const SESSION_COOKIE = "pdfsy_session";
/**
 * Two session lifetimes, chosen by the "stay signed in" box on the login form.
 *
 * The short one is a backstop, not the main mechanism. Unticked, the cookie is
 * written with no `maxAge` at all, which makes it a *session cookie* — the
 * browser drops it when it closes, and nothing on our side is involved. The
 * reason there is still a server-side cap: Chrome, Edge and Firefox all offer
 * "continue where you left off", and when that is on they restore session
 * cookies after a restart. So on a shared machine the browser's promise alone
 * is not one we can make. Twelve hours is ours, and it is enforced in
 * `auth_sessions.expires_at` where the person at the keyboard cannot edit it.
 */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, ticked
const SESSION_TTL_SHORT_MS = 12 * 60 * 60 * 1000; // 12 hours, unticked
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;        // 15 minutes
const MAGIC_LINKS_PER_HOUR = 5;

export type User = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  created_at: number;
  last_seen_at: number | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  plan_status?: string | null;
  plan_renews_at?: number | null;
};

/** 32 random bytes, URL-safe. Never stored — only its hash is. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const hash = (token: string) => sha256Hex(new TextEncoder().encode(token));

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/* ------------------------------- magic links ------------------------------ */

/**
 * Returns null when the address has asked too often in the last hour.
 *
 * `remember` rides along on the row because the session it governs is not
 * created here — it is created when the link is clicked, in a different
 * request. See migrations/0005.
 */
export async function createMagicLink(
  db: D1Database, rawEmail: string, remember: boolean,
): Promise<string | null> {
  const email = normalizeEmail(rawEmail);
  const since = Date.now() - 60 * 60 * 1000;

  const recent = await db
    .prepare(`SELECT COUNT(*) AS n FROM magic_links WHERE email = ? AND created_at > ?`)
    .bind(email, since)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAGIC_LINKS_PER_HOUR) return null;

  const token = newToken();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO magic_links (id, email, expires_at, created_at, remember)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(await hash(token), email, now + MAGIC_LINK_TTL_MS, now, remember ? 1 : 0)
    .run();

  return token;
}

export type ConsumedLink = { email: string; remember: boolean };

/** Single use: the same link cannot be replayed, even inside its 15 minutes. */
export async function consumeMagicLink(
  db: D1Database, token: string,
): Promise<ConsumedLink | null> {
  const id = await hash(token);
  const now = Date.now();

  const row = await db
    .prepare(`SELECT email, expires_at, used_at, remember FROM magic_links WHERE id = ?`)
    .bind(id)
    .first<{ email: string; expires_at: number; used_at: number | null; remember: number }>();

  if (!row || row.used_at || row.expires_at < now) return null;

  const claimed = await db
    .prepare(`UPDATE magic_links SET used_at = ? WHERE id = ? AND used_at IS NULL`)
    .bind(now, id)
    .run();
  // If two tabs race, only the update that changed a row wins.
  if (claimed.meta.changes !== 1) return null;

  return { email: row.email, remember: row.remember === 1 };
}

/* --------------------------------- users --------------------------------- */

export async function findOrCreateUser(db: D1Database, rawEmail: string): Promise<User> {
  const email = normalizeEmail(rawEmail);
  const existing = await db.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<User>();
  if (existing) return existing;

  const user: User = {
    id: newId(),
    email,
    name: null,
    plan: "free",
    created_at: Date.now(),
    last_seen_at: null,
  };
  await db
    .prepare(`INSERT INTO users (id, email, name, plan, created_at) VALUES (?, ?, NULL, 'free', ?)`)
    .bind(user.id, user.email, user.created_at)
    .run();
  return user;
}

/* -------------------------------- sessions -------------------------------- */

/**
 * `remember` decides how long this lasts, and it is applied in two places on
 * purpose: the database row and the cookie.
 *
 * The database is the one that counts. A cookie's lifetime is a hint the
 * browser is free to ignore and the person holding it is free to edit — an
 * expiry enforced only there is not an expiry. `expires_at` in `auth_sessions`
 * is checked by `currentUser` on every request, so a cookie that outlives its
 * row simply stops working.
 */
export async function startSession(c: Ctx, userId: string, remember: boolean): Promise<void> {
  const token = newToken();
  const now = Date.now();
  const ttl = remember ? SESSION_TTL_MS : SESSION_TTL_SHORT_MS;

  await c.env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
  ).bind(await hash(token), userId, now + ttl, now).run();

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    // Lax rather than Strict: the magic link arrives as a top-level navigation
    // from an email client, and Strict would drop the cookie on that first hop.
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    // Omitted entirely when not remembering, which is what makes it a session
    // cookie. Passing 0 or a short number would instead write a cookie that
    // expires on a clock — a different thing, and one that survives the browser
    // closing. There is no `maxAge: undefined` shortcut here: the key has to be
    // absent from the object, not present and undefined.
    ...(remember ? { maxAge: SESSION_TTL_MS / 1000 } : {}),
  });
}

export async function currentUser(c: Ctx): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  const user = await c.env.DB.prepare(
    `SELECT u.* FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`,
  ).bind(await hash(token), Date.now()).first<User>();

  return user ?? null;
}

export async function endSession(c: Ctx): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare(`DELETE FROM auth_sessions WHERE id = ?`).bind(await hash(token)).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
