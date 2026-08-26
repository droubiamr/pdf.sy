// Who may open the console, and what happens when they use it.
//
// Access is an allowlist of email addresses in the ADMIN_EMAILS environment
// variable, deliberately not a `role` column on `users`. There is no screen
// anywhere in this product that grants admin, so the only route to it is
// deploy access. That means a privilege-escalation bug in the app — a bad
// UPDATE, a forgotten ownership check — still cannot make anybody an admin.
//
// Unset or empty ADMIN_EMAILS switches the whole console off. That is the
// correct default for a fresh clone: someone running this locally with a copy
// of the code should not get an admin panel by accident.
import type { Context, Next } from "hono";
import type { Env } from "./context";
import { newId } from "./ids";

export function adminEmails(env: Env["Bindings"]): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(env: Env["Bindings"], email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = adminEmails(env);
  return allowed.size > 0 && allowed.has(email.toLowerCase());
}

/** The signed-in admin, or null. Never throws — callers choose the response. */
export function currentAdmin(c: Context<Env>): { id: string; email: string } | null {
  const user = c.get("user");
  return user && isAdminEmail(c.env, user.email) ? { id: user.id, email: user.email } : null;
}

/**
 * The gate, applied once to the whole `/admin` tree.
 *
 * Guarding at the route group rather than inside each handler means a page
 * added tomorrow is protected the moment the file exists. The failure mode of
 * per-handler guards is always the same: the one handler somebody forgot.
 *
 * A 404 rather than a 403, matching the rest of the site — an unauthorised
 * visitor should not learn that /admin is a real route. `throw` hands control
 * to Hono's notFound handler, so the response is byte-identical to a genuine
 * miss, right down to the language of the copy on it.
 */
export async function requireAdmin(c: Context<Env>, next: Next): Promise<Response | void> {
  if (!currentAdmin(c)) return c.notFound();
  // Nothing in here is ever cacheable or indexable, and this is a cheaper place
  // to say so once than a prop on every page.
  await next();
  c.res.headers.set("cache-control", "no-store");
  c.res.headers.set("x-robots-tag", "noindex, nofollow");
}

export type AuditEntry = {
  actorEmail: string;
  action: string;
  targetType: "document" | "link" | "user" | "report" | "uploader" | "hash";
  targetId?: string | null;
  targetLabel?: string | null;
  detail?: Record<string, unknown>;
};

/**
 * Record a privileged action.
 *
 * Called on the way out of every mutating handler, never conditionally. The
 * write is allowed to fail without failing the action itself: losing the
 * ability to take down a phishing document because the log table is unhappy
 * would be the worse outcome by a long way. It is logged loudly instead, so a
 * silently broken audit trail cannot sit there unnoticed.
 */
export async function logAdmin(db: D1Database, entry: AuditEntry): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO admin_audit
         (id, actor_email, action, target_type, target_id, target_label, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId(),
      entry.actorEmail,
      entry.action,
      entry.targetType,
      entry.targetId ?? null,
      entry.targetLabel ?? null,
      entry.detail ? JSON.stringify(entry.detail) : null,
      Date.now(),
    ).run();
  } catch (error) {
    console.error("[admin] AUDIT WRITE FAILED", JSON.stringify(entry), error);
  }

  // Also to the Worker log, which survives the database being the thing that
  // broke. `observability` is on in wrangler.toml, so this is searchable.
  console.warn(
    `[admin] ${entry.actorEmail} ${entry.action} ${entry.targetType} ` +
      `${entry.targetLabel ?? entry.targetId ?? ""}`,
  );
}
