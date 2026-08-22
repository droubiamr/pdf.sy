import { Hono } from "hono";
import type { Link } from "../db/schema";
import type { Env } from "../lib/context";
import { newId, newManageToken, newSlug, sha256Hex, hashIp, RESERVED_SLUGS } from "../lib/ids";
import { send, openNotificationEmail } from "../lib/mail";
import { formatMs } from "../lib/format";
import type { Bindings } from "../db/schema";

export const api = new Hono<Env>();

/**
 * Phase 1 uploads stream through the Worker, which is simple and fine up to the
 * platform's 100 MB body limit. Phase 2 swaps this for a presigned R2 PUT so the
 * bytes never touch us — the client contract below does not change when it does.
 */
api.post("/documents", async (c) => {
  const maxBytes = Number(c.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
  const form = await c.req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) return c.json({ error: "No file was sent." }, 400);
  if (file.type !== "application/pdf") return c.json({ error: "That file is not a PDF." }, 415);
  if (file.size > maxBytes) {
    return c.json({ error: `That file is larger than ${c.env.MAX_UPLOAD_MB} MB.` }, 413);
  }

  const bytes = await file.arrayBuffer();

  // Reject anything that looks like a PDF by extension but isn't one.
  const magic = new TextDecoder().decode(new Uint8Array(bytes.slice(0, 5)));
  if (magic !== "%PDF-") return c.json({ error: "That file is not a valid PDF." }, 415);

  const sha256 = await sha256Hex(bytes);
  const blocked = await c.env.DB.prepare(`SELECT sha256 FROM blocked_hashes WHERE sha256 = ?`)
    .bind(sha256)
    .first();
  if (blocked) return c.json({ error: "This file has been blocked." }, 451);

  const now = Date.now();
  const docId = newId();
  const versionId = newId();
  const manageToken = newManageToken();
  const r2Key = `docs/${docId}/v1.pdf`;
  const title = (form.get("title") as string | null)?.trim() || file.name.replace(/\.pdf$/i, "") || "Untitled";
  const pageCount = Number(form.get("pageCount") ?? 0) || null;

  await c.env.FILES.put(r2Key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { docId, sha256 },
  });

  let slug = newSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (RESERVED_SLUGS.has(slug)) { slug = newSlug(); continue; }
    const taken = await c.env.DB.prepare(`SELECT slug FROM links WHERE slug = ?`).bind(slug).first();
    if (!taken) break;
    slug = newSlug();
  }

  // Anonymous uploads expire; an account's do not. That gap is the pitch.
  const owner = c.get("user");
  const ttlDays = Number(c.env.ANON_LINK_TTL_DAYS ?? 7);
  const expiresAt = owner || ttlDays <= 0 ? null : now + ttlDays * 86_400_000;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO documents (id, owner_id, title, manage_token, current_version, status, created_at)
       VALUES (?, ?, ?, ?, 1, 'ready', ?)`,
    ).bind(docId, owner?.id ?? null, title, manageToken, now),
    c.env.DB.prepare(
      `INSERT INTO document_versions (id, document_id, version, r2_key, sha256, size_bytes, page_count, created_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
    ).bind(versionId, docId, r2Key, sha256, file.size, pageCount, now),
    c.env.DB.prepare(
      `INSERT INTO links (slug, document_id, name, allow_download, expires_at, created_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    ).bind(slug, docId, title, expiresAt, now),
  ]);

  return c.json({
    slug,
    manageToken,
    title,
    url: new URL(`/${slug}`, c.env.SITE_URL).toString(),
    statsUrl: new URL(`/l/${slug}/stats?t=${manageToken}`, c.env.SITE_URL).toString(),
    expiresAt,
  });
});

/** Opens a view session. Called once when the viewer boots. */
api.post("/v/:slug/session", async (c) => {
  const slug = c.req.param("slug");
  const link = await loadLink(c.env.DB, slug);
  if (!link) return c.json({ error: "not_found" }, 404);

  const id = newId();
  const now = Date.now();
  const ip = c.req.header("cf-connecting-ip") ?? "0.0.0.0";

  await c.env.DB.prepare(
    `INSERT INTO view_sessions (id, slug, version, country, ip_hash, device, referrer, started_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      slug,
      link.pinned_version ?? 1,
      (c.req.raw as { cf?: { country?: string } }).cf?.country ?? null,
      await hashIp(ip, slug),
      c.req.header("sec-ch-ua-mobile") === "?1" ? "mobile" : "desktop",
      c.req.header("referer") ?? null,
      now,
      now,
    )
    .run();

  return c.json({ sessionId: id });
});

/**
 * Beacon endpoint. The viewer batches page dwell times and flushes every few
 * seconds plus once on visibilitychange, so closing the tab still reports.
 */
api.post("/v/:slug/ping", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json<{
    sessionId: string;
    maxPage?: number;
    downloaded?: boolean;
    pages?: { page: number; ms: number }[];
  }>().catch(() => null);

  if (!body?.sessionId) return c.json({ error: "bad_request" }, 400);

  const link = await loadLink(c.env.DB, slug);
  if (!link) return c.json({ error: "not_found" }, 404);

  const version = link.pinned_version ?? 1;
  const pages = (body.pages ?? []).filter((p) => p.page > 0 && p.ms > 0 && p.ms < 3_600_000);
  const totalMs = pages.reduce((a, p) => a + p.ms, 0);

  const statements = [
    c.env.DB.prepare(
      `UPDATE view_sessions
          SET last_seen_at = ?,
              total_ms = total_ms + ?,
              max_page = MAX(max_page, ?),
              downloaded = MAX(downloaded, ?)
        WHERE id = ? AND slug = ?`,
    ).bind(Date.now(), totalMs, body.maxPage ?? 0, body.downloaded ? 1 : 0, body.sessionId, slug),
    ...pages.map((p) =>
      c.env.DB.prepare(
        `INSERT INTO page_stats (slug, version, page, views, total_ms)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT (slug, version, page)
         DO UPDATE SET views = views + 1, total_ms = total_ms + excluded.total_ms`,
      ).bind(slug, version, p.page, p.ms),
    ),
  ];

  await c.env.DB.batch(statements);

  // The reader is waiting on this response; the email is not their problem.
  c.executionCtx.waitUntil(maybeNotifyOwner(c.env, slug, body.sessionId));

  return c.body(null, 204);
});

/** Minimum dwell before an open is worth an email, so a bounce stays quiet. */
const NOTIFY_AFTER_MS = 5000;

/**
 * One email per view session, sent the first time a visitor stays long enough
 * to count as having actually read something.
 */
async function maybeNotifyOwner(env: Bindings, slug: string, sessionId: string): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT vs.total_ms, vs.max_page, vs.country, vs.viewer_email, vs.notified_at,
            d.title, u.email AS owner_email, l.notify_on_view,
            (SELECT page_count FROM document_versions
              WHERE document_id = d.id AND version = vs.version) AS page_count
       FROM view_sessions vs
       JOIN links l ON l.slug = vs.slug
       JOIN documents d ON d.id = l.document_id
       JOIN users u ON u.id = d.owner_id
      WHERE vs.id = ? AND vs.slug = ?`,
  ).bind(sessionId, slug).first<{
    total_ms: number;
    max_page: number;
    country: string | null;
    viewer_email: string | null;
    notified_at: number | null;
    title: string;
    owner_email: string;
    notify_on_view: number;
    page_count: number | null;
  }>();

  if (!row) return;                                  // anonymous document, or gone
  if (row.notified_at || !row.notify_on_view) return;
  if (row.total_ms < NOTIFY_AFTER_MS) return;

  // Claim the notification first: two pings can land at once, and a duplicate
  // email is far worse than a missed one.
  const claimed = await env.DB.prepare(
    `UPDATE view_sessions SET notified_at = ? WHERE id = ? AND notified_at IS NULL`,
  ).bind(Date.now(), sessionId).run();
  if (claimed.meta.changes !== 1) return;

  await send(env, {
    to: row.owner_email,
    ...openNotificationEmail({
      title: row.title,
      statsUrl: new URL(`/l/${slug}/stats`, env.SITE_URL).toString(),
      country: row.country,
      durationLabel: formatMs(row.total_ms),
      lastPage: row.max_page || 1,
      totalPages: row.page_count,
      viewerEmail: row.viewer_email,
    }),
  });
}

api.post("/report/:slug", async (c) => {
  type ReportBody = { reason?: string; email?: string };
  const body: ReportBody = await c.req.json<ReportBody>().catch(() => ({}) as ReportBody);
  if (!body.reason) return c.json({ error: "A reason is required." }, 400);

  await c.env.DB.prepare(
    `INSERT INTO abuse_reports (id, slug, reason, reporter_email, status, created_at)
     VALUES (?, ?, ?, ?, 'open', ?)`,
  ).bind(newId(), c.req.param("slug"), body.reason.slice(0, 2000), body.email ?? null, Date.now()).run();

  return c.json({ ok: true });
});

export async function loadLink(db: D1Database, slug: string): Promise<Link | null> {
  const link = await db.prepare(`SELECT * FROM links WHERE slug = ?`).bind(slug).first<Link>();
  if (!link) return null;
  if (link.revoked_at) return null;
  if (link.expires_at && link.expires_at < Date.now()) return null;
  return link;
}
