import { Hono } from "hono";
import type { Link } from "../db/schema";
import type { Env } from "../lib/context";
import { newId, newManageToken, newSlug, sha256Hex, hashIp, RESERVED_SLUGS } from "../lib/ids";
import { send, openNotificationEmail } from "../lib/mail";
import { formatMs } from "../lib/format";
import { siteUrl } from "../lib/urls";
import { resolveVersion } from "../lib/versions";
import { inspectPdf } from "../lib/pdf";
import { activeLinkLimit } from "../lib/plans";
import {
  hit, hitByClient, tooMany, clientKey, activeLinkCount, isBlockedUploader,
} from "../lib/limits";
import { verify as verifyTurnstile, tokenFrom } from "../lib/turnstile";
import type { Bindings } from "../db/schema";

export const api = new Hono<Env>();

/** How many pages one beacon may report. A reader cannot outrun this. */
const MAX_PAGES_PER_PING = 500;

/**
 * Phase 1 uploads stream through the Worker, which is simple and fine up to the
 * platform's 100 MB body limit. Phase 2 swaps this for a presigned R2 PUT so the
 * bytes never touch us — the client contract below does not change when it does.
 *
 * The order of the checks matters and is deliberate: everything that can refuse
 * the request cheaply runs before anything expensive. Reading the body is the
 * expensive part, so the size header, the rate limits and the uploader block
 * all happen first — otherwise a refusal still costs us the full upload.
 */
api.post("/documents", async (c) => {
  const maxBytes = Number(c.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;

  // Refuse on the declared size before formData() ingests the body. Without
  // this, `file.size` is only consulted after Workers has already accepted up
  // to 100 MB, so the limit costs exactly as much to enforce as to ignore.
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > maxBytes + 1024 * 1024) {
    return c.json({ error: `That file is larger than ${c.env.MAX_UPLOAD_MB} MB.` }, 413);
  }

  const burst = await hitByClient(c, "uploadBurst");
  if (!burst.ok) return tooMany(c, burst, "Too many uploads just now. Try again shortly.", "json");

  const daily = await hitByClient(c, "upload");
  if (!daily.ok) {
    return tooMany(c, daily, "You have reached today's upload limit. Sign in for a higher one.", "json");
  }

  const uploaderHash = await clientKey(c, "uploader");
  if (await isBlockedUploader(c.env.DB, uploaderHash)) {
    return c.json({ error: "Uploads from here have been blocked." }, 403);
  }

  // A free account is capped on how many links it can hold at once. This was
  // defined in lib/plans.ts from the start but never actually consulted.
  const owner = c.get("user");
  if (owner) {
    const ceiling = activeLinkLimit(owner);
    if (ceiling !== null && (await activeLinkCount(c.env.DB, owner.id)) >= ceiling) {
      return c.json(
        {
          error: `Your plan holds ${ceiling} active links. Revoke one, or upgrade for unlimited.`,
          code: "link_limit",
        },
        402,
      );
    }
  }

  const form = await c.req.formData();
  const file = form.get("file");

  // After formData() because the token arrives in the body, but before the file
  // is read into memory, hashed, inspected and written to R2 — everything
  // costly is downstream of this line.
  if (!(await verifyTurnstile(c, tokenFrom(form), "upload"))) {
    return c.json({ error: "Could not verify your browser. Reload the page and try again." }, 403);
  }

  if (!(file instanceof File)) return c.json({ error: "No file was sent." }, 400);
  if (file.size > maxBytes) {
    return c.json({ error: `That file is larger than ${c.env.MAX_UPLOAD_MB} MB.` }, 413);
  }

  const bytes = await file.arrayBuffer();

  // Content decides, not the browser's Content-Type header — that is caller
  // input and is trivially set to anything. See lib/pdf.ts for what this does
  // and, more importantly, what it does not.
  const verdict = await inspectPdf(bytes);
  if (!verdict.ok) {
    console.warn("upload refused", verdict.code, uploaderHash);
    return c.json({ error: verdict.message, code: verdict.code }, 415);
  }
  if (verdict.warnings.length > 0) {
    console.log("upload accepted with active-content markers", verdict.warnings.join(","));
  }

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

  // Claim a free slug before writing anything. Previously the loop could fall
  // through with its fifth candidate unchecked and fail on the primary key,
  // after the bytes were already in R2.
  const slug = await claimSlug(c.env.DB);
  if (!slug) {
    console.error("could not find a free slug in 8 attempts");
    return c.json({ error: "Could not create a link just now. Please try again." }, 503);
  }

  await c.env.FILES.put(r2Key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { docId, sha256 },
  });

  // Anonymous uploads expire; an account's do not. That gap is the pitch.
  const ttlDays = Number(c.env.ANON_LINK_TTL_DAYS ?? 7);
  const expiresAt = owner || ttlDays <= 0 ? null : now + ttlDays * 86_400_000;

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO documents (id, owner_id, title, manage_token, current_version, status, created_at, uploader_hash)
         VALUES (?, ?, ?, ?, 1, 'ready', ?, ?)`,
      ).bind(docId, owner?.id ?? null, title, manageToken, now, uploaderHash),
      c.env.DB.prepare(
        `INSERT INTO document_versions (id, document_id, version, r2_key, sha256, size_bytes, page_count, created_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      ).bind(versionId, docId, r2Key, sha256, file.size, pageCount, now),
      c.env.DB.prepare(
        `INSERT INTO links (slug, document_id, name, allow_download, expires_at, created_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      ).bind(slug, docId, title, expiresAt, now),
    ]);
  } catch (error) {
    // The bytes landed but the row did not, so nothing will ever reference
    // this object again. Take it back out rather than paying to store a file
    // that no code path can reach.
    console.error("upload metadata write failed, removing orphaned object", error);
    c.executionCtx.waitUntil(c.env.FILES.delete(r2Key).catch(() => {}));
    return c.json({ error: "Could not save that upload. Please try again." }, 500);
  }

  return c.json({
    slug,
    manageToken,
    title,
    url: new URL(`/${slug}`, siteUrl(c)).toString(),
    statsUrl: new URL(`/l/${slug}/stats?t=${manageToken}`, siteUrl(c)).toString(),
    expiresAt,
  });
});

/** A slug nothing else is using, or null if we could not find one. */
async function claimSlug(db: D1Database): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = newSlug();
    if (RESERVED_SLUGS.has(slug)) continue;

    const taken = await db.prepare(`SELECT slug FROM links WHERE slug = ?`).bind(slug).first();
    if (!taken) return slug;
  }
  return null;
}

/** Opens a view session. Called once when the viewer boots. */
api.post("/v/:slug/session", async (c) => {
  const slug = c.req.param("slug");

  const verdict = await hitByClient(c, "viewSession");
  if (!verdict.ok) return tooMany(c, verdict, "Too many requests.", "json");

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
      (await resolveVersion(c.env.DB, link))?.version ?? 1,
      (c.req.raw as { cf?: { country?: string } }).cf?.country ?? null,
      await hashIp(ip, slug),
      c.req.header("sec-ch-ua-mobile") === "?1" ? "mobile" : "desktop",
      (c.req.header("referer") ?? null)?.slice(0, 500) ?? null,
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

  const verdict = await hitByClient(c, "ping");
  if (!verdict.ok) return tooMany(c, verdict, "Too many requests.", "json");

  const body = await c.req.json<{
    sessionId: string;
    maxPage?: number;
    downloaded?: boolean;
    pages?: { page: number; ms: number }[];
  }>().catch(() => null);

  if (!body?.sessionId) return c.json({ error: "bad_request" }, 400);

  const link = await loadLink(c.env.DB, slug);
  if (!link) return c.json({ error: "not_found" }, 404);

  // The session has to exist and belong to this link before a single row is
  // written. Without this the page_stats inserts below happen regardless: the
  // session UPDATE quietly matches nothing for a made-up id while every page
  // row still lands, so anyone holding a slug could forge per-page reading
  // times for a document they never opened — poisoning the exact analytics
  // people are paying for. The id is a UUID, so it cannot be guessed either.
  const session = await c.env.DB.prepare(
    `SELECT id FROM view_sessions WHERE id = ? AND slug = ?`,
  ).bind(body.sessionId, slug).first();
  if (!session) return c.json({ error: "unknown_session" }, 404);

  const version = (await resolveVersion(c.env.DB, link))?.version ?? 1;

  // Everything below is caller-supplied. The slice is the important part: each
  // entry becomes its own statement in the batch, so an unbounded array is an
  // unbounded write amplification from a single request.
  const pages = (body.pages ?? [])
    .filter((p) =>
      Number.isInteger(p.page) && p.page > 0 && p.page <= 10_000
      && Number.isFinite(p.ms) && p.ms > 0 && p.ms < 3_600_000)
    .slice(0, MAX_PAGES_PER_PING);

  const totalMs = pages.reduce((a, p) => a + p.ms, 0);
  const maxPage = Number.isInteger(body.maxPage) ? Math.min(Math.max(body.maxPage!, 0), 10_000) : 0;

  const statements = [
    c.env.DB.prepare(
      `UPDATE view_sessions
          SET last_seen_at = ?,
              total_ms = total_ms + ?,
              max_page = MAX(max_page, ?),
              downloaded = MAX(downloaded, ?)
        WHERE id = ? AND slug = ?`,
    ).bind(Date.now(), totalMs, maxPage, body.downloaded ? 1 : 0, body.sessionId, slug),
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
  // The origin is captured here: the notification runs after the response,
  // where there is no longer a request to read it from.
  c.executionCtx.waitUntil(maybeNotifyOwner(c.env, siteUrl(c), slug, body.sessionId));

  return c.body(null, 204);
});

/** Minimum dwell before an open is worth an email, so a bounce stays quiet. */
const NOTIFY_AFTER_MS = 5000;

/**
 * One email per view session, sent the first time a visitor stays long enough
 * to count as having actually read something.
 */
async function maybeNotifyOwner(env: Bindings, origin: string, slug: string, sessionId: string): Promise<void> {
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

  // Ceiling on how much mail one link can generate in a day, whoever asked for
  // it. Sessions are anonymous and free to create, so without this the "one
  // email per session" rule is only a rename of "one email per request".
  const allowance = await hit(env.DB, "notify", slug);
  if (!allowance.ok) {
    console.warn("notification ceiling reached for link", slug);
    return;
  }

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
      statsUrl: new URL(`/l/${slug}/stats`, origin).toString(),
      country: row.country,
      durationLabel: formatMs(row.total_ms),
      lastPage: row.max_page || 1,
      totalPages: row.page_count,
      viewerEmail: row.viewer_email,
    }),
  });
}

api.post("/report/:slug", async (c) => {
  const verdict = await hitByClient(c, "report");
  if (!verdict.ok) return tooMany(c, verdict, "Too many reports from here. Try again later.", "json");

  type ReportBody = { reason?: string; email?: string };
  const body: ReportBody = await c.req.json<ReportBody>().catch(() => ({}) as ReportBody);
  if (!body.reason) return c.json({ error: "A reason is required." }, 400);

  await c.env.DB.prepare(
    `INSERT INTO abuse_reports (id, slug, reason, reporter_email, status, created_at)
     VALUES (?, ?, ?, ?, 'open', ?)`,
  ).bind(newId(), c.req.param("slug"), body.reason.slice(0, 2000), body.email?.slice(0, 320) ?? null, Date.now()).run();

  return c.json({ ok: true });
});

/**
 * The one place that decides whether a slug resolves. Every route that serves
 * or renders a document goes through here, which is what makes a takedown a
 * single write rather than a hunt through the codebase.
 *
 * The document-level conditions are the point: `status` and `deleted_at` were
 * in the schema from the first migration but nothing read them, so blocking a
 * document did nothing at all and soft-deleting one only hid it from its own
 * owner's dashboard while it carried on serving to the public.
 */
export async function loadLink(db: D1Database, slug: string): Promise<Link | null> {
  const link = await db.prepare(
    `SELECT l.*
       FROM links l
       JOIN documents d ON d.id = l.document_id
      WHERE l.slug = ?
        AND d.deleted_at IS NULL
        AND d.status != 'blocked'`,
  ).bind(slug).first<Link>();

  if (!link) return null;
  if (link.revoked_at) return null;
  if (link.expires_at && link.expires_at < Date.now()) return null;
  return link;
}
