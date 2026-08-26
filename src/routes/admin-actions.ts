// Everything in the console that changes something.
//
// Split out from routes/admin.tsx so that the file with side effects is short
// enough to read end to end. Every handler here follows the same four steps:
// check the actor, do the thing, write the audit row, redirect back. None of
// them return a page — a POST that renders HTML is a page you cannot reload.
//
// `requireAdmin` is applied here independently rather than inherited. It is the
// same guard the pages use, and repeating it is the point: a route file that
// mutates production data should not depend on another file's middleware still
// being wired up the way it was the day this was written.
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../lib/context";
import { currentAdmin, logAdmin, requireAdmin } from "../lib/admin";
import { sweep } from "../lib/retention";

export const adminActions = new Hono<Env>();

adminActions.use("/admin/*", requireAdmin);

/** Where to send the browser afterwards, defaulting to where it came from. */
function back(c: Context<Env>, fallback: string): Response {
  const referer = c.req.header("referer");
  // Only ever our own paths. A `referer` is attacker-influenced in general, and
  // an open redirect out of an admin console is a phishing gift.
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.origin === new URL(c.req.url).origin) {
        return c.redirect(url.pathname + url.search, 303);
      }
    } catch { /* fall through */ }
  }
  return c.redirect(fallback, 303);
}

/**
 * Trimmed, length-capped free text from a form field.
 *
 * `string | File` rather than the DOM's FormDataEntryValue: @cloudflare/workers-types
 * does not ship that alias, and a File landing here would stringify to
 * "[object File]" — which the length cap then makes harmless.
 */
const text = (value: string | File | null, max = 200): string =>
  String(value ?? "").trim().slice(0, max);

/* -------------------------------------------------------------------------- */
/*  Documents                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Block: the document stops serving, its owner can still see it and is told
 * why. Reversible, which is what makes it the right first response to a report
 * — you can act in seconds on something that looks bad and undo it if the
 * complaint turns out to be nonsense.
 */
adminActions.post("/admin/documents/:id/block", async (c) => {
  const actor = currentAdmin(c)!;
  const id = c.req.param("id");
  const form = await c.req.formData();
  const reason = text(form.get("reason")) || "abuse report";
  const reportId = text(form.get("report"), 64);

  const doc = await c.env.DB.prepare(`SELECT title FROM documents WHERE id = ?`)
    .bind(id).first<{ title: string }>();
  if (!doc) return c.notFound();

  await c.env.DB.prepare(
    `UPDATE documents SET status = 'blocked', blocked_reason = ? WHERE id = ?`,
  ).bind(reason, id).run();

  if (reportId) await resolveReport(c.env.DB, reportId);

  await logAdmin(c.env.DB, {
    actorEmail: actor.email, action: "block", targetType: "document",
    targetId: id, targetLabel: doc.title, detail: { reason, report: reportId || undefined },
  });

  return back(c, `/admin/documents/${id}`);
});

adminActions.post("/admin/documents/:id/unblock", async (c) => {
  const actor = currentAdmin(c)!;
  const id = c.req.param("id");

  const doc = await c.env.DB.prepare(`SELECT title, blocked_reason FROM documents WHERE id = ?`)
    .bind(id).first<{ title: string; blocked_reason: string | null }>();
  if (!doc) return c.notFound();

  await c.env.DB.prepare(
    `UPDATE documents SET status = 'ready', blocked_reason = NULL WHERE id = ?`,
  ).bind(id).run();

  await logAdmin(c.env.DB, {
    actorEmail: actor.email, action: "unblock", targetType: "document",
    targetId: id, targetLabel: doc.title, detail: { was: doc.blocked_reason },
  });

  return back(c, `/admin/documents/${id}`);
});

/**
 * Delete: a soft delete, deliberately.
 *
 * Setting `deleted_at` kills every link immediately — that is the part that has
 * to be instant when something genuinely harmful is up. The bytes go on the
 * next nightly sweep, which lib/retention.ts purges without the 24-hour grace
 * period it gives expired documents. So there is a window to undo a mistake by
 * hand, and no window in which harmful material is still being served.
 */
adminActions.post("/admin/documents/:id/delete", async (c) => {
  const actor = currentAdmin(c)!;
  const id = c.req.param("id");
  const form = await c.req.formData();
  const reportId = text(form.get("report"), 64);

  const doc = await c.env.DB.prepare(`SELECT title FROM documents WHERE id = ?`)
    .bind(id).first<{ title: string }>();
  if (!doc) return c.notFound();

  await c.env.DB.prepare(`UPDATE documents SET deleted_at = ? WHERE id = ?`)
    .bind(Date.now(), id).run();

  if (reportId) await resolveReport(c.env.DB, reportId);

  await logAdmin(c.env.DB, {
    actorEmail: actor.email, action: "delete", targetType: "document",
    targetId: id, targetLabel: doc.title, detail: { report: reportId || undefined },
  });

  return back(c, "/admin/moderation");
});

/* -------------------------------------------------------------------------- */
/*  Reports                                                                    */
/* -------------------------------------------------------------------------- */

async function resolveReport(db: D1Database, id: string): Promise<void> {
  await db.prepare(`UPDATE abuse_reports SET status = 'resolved' WHERE id = ?`).bind(id).run();
}

adminActions.post("/admin/reports/:id/resolve", async (c) => {
  const actor = currentAdmin(c)!;
  const id = c.req.param("id");

  const report = await c.env.DB.prepare(`SELECT slug FROM abuse_reports WHERE id = ?`)
    .bind(id).first<{ slug: string }>();
  if (!report) return c.notFound();

  await resolveReport(c.env.DB, id);

  await logAdmin(c.env.DB, {
    actorEmail: actor.email, action: "resolve", targetType: "report",
    targetId: id, targetLabel: report.slug,
  });

  return back(c, "/admin/moderation");
});

/* -------------------------------------------------------------------------- */
/*  Blocklists                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Block a file by its bytes. Narrow on purpose: changing one pixel produces a
 * different sha256 and walks straight past this. It is the right tool for a
 * specific file being re-uploaded, and the wrong one for a person who keeps
 * coming back — that is what the uploader block below is for.
 */
adminActions.post("/admin/moderation/block-hash", async (c) => {
  const actor = currentAdmin(c)!;
  const form = await c.req.formData();
  const sha256 = text(form.get("sha256"), 64).toLowerCase();
  const label = text(form.get("label"));

  if (!/^[0-9a-f]{64}$/.test(sha256)) return c.text("Not a sha256.", 400);

  await c.env.DB.prepare(
    `INSERT INTO blocked_hashes (sha256, reason, created_at) VALUES (?, ?, ?)
     ON CONFLICT (sha256) DO UPDATE SET reason = excluded.reason`,
  ).bind(sha256, label || "blocked from the admin console", Date.now()).run();

  await logAdmin(c.env.DB, {
    actorEmail: actor.email, action: "block-hash", targetType: "hash",
    targetId: sha256, targetLabel: label || null,
  });

  return back(c, "/admin/moderation");
});

adminActions.post("/admin/moderation/unblock-hash", async (c) => {
  const actor = currentAdmin(c)!;
  const form = await c.req.formData();
  const sha256 = text(form.get("sha256"), 64).toLowerCase();

  await c.env.DB.prepare(`DELETE FROM blocked_hashes WHERE sha256 = ?`).bind(sha256).run();

  await logAdmin(c.env.DB, {
    actorEmail: actor.email, action: "unblock-hash", targetType: "hash", targetId: sha256,
  });

  return back(c, "/admin/moderation");
});

/**
 * Block whoever uploaded this document.
 *
 * `uploader_hash` is a daily-salted hash of the IP, so this expires on its own
 * when the salt rotates — it cannot become a permanent ban on an address, and
 * it never reveals one. That is a privacy property worth keeping: the block is
 * deliberately blunt and deliberately temporary.
 */
adminActions.post("/admin/documents/:id/block-uploader", async (c) => {
  const actor = currentAdmin(c)!;
  const id = c.req.param("id");
  const form = await c.req.formData();
  const reason = text(form.get("reason")) || "repeat abuse";

  const doc = await c.env.DB.prepare(
    `SELECT title, uploader_hash FROM documents WHERE id = ?`,
  ).bind(id).first<{ title: string; uploader_hash: string | null }>();

  if (!doc?.uploader_hash) {
    return c.text("This document has no uploader hash — it predates that column.", 400);
  }

  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  await c.env.DB.prepare(
    `INSERT INTO blocked_uploaders (uploader_hash, reason, expires_at, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (uploader_hash) DO UPDATE
       SET reason = excluded.reason, expires_at = excluded.expires_at`,
  ).bind(doc.uploader_hash, reason, expires, Date.now()).run();

  await logAdmin(c.env.DB, {
    actorEmail: actor.email, action: "block-uploader", targetType: "uploader",
    targetId: doc.uploader_hash, targetLabel: doc.title, detail: { reason, expires },
  });

  return back(c, `/admin/documents/${id}`);
});

adminActions.post("/admin/moderation/unblock-uploader", async (c) => {
  const actor = currentAdmin(c)!;
  const form = await c.req.formData();
  const hash = text(form.get("hash"), 128);

  await c.env.DB.prepare(`DELETE FROM blocked_uploaders WHERE uploader_hash = ?`).bind(hash).run();

  await logAdmin(c.env.DB, {
    actorEmail: actor.email, action: "unblock-uploader", targetType: "uploader", targetId: hash,
  });

  return back(c, "/admin/moderation");
});

/* -------------------------------------------------------------------------- */
/*  System                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Run the retention sweep on demand.
 *
 * The same function the cron calls, so this is a rehearsal of the real thing
 * rather than a second implementation that could drift from it. Awaited rather
 * than handed to waitUntil: the whole point of pressing the button is to see
 * the result, and a sweep that finishes after the response has gone tells you
 * nothing.
 */
adminActions.post("/admin/system/sweep", async (c) => {
  const actor = currentAdmin(c)!;
  const report = await sweep(c.env);

  await logAdmin(c.env.DB, {
    actorEmail: actor.email, action: "sweep", targetType: "document",
    targetId: null, targetLabel: "manual run", detail: report as unknown as Record<string, unknown>,
  });

  return back(c, "/admin/system");
});
