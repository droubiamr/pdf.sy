import { Hono } from "hono";
import type { Env } from "../lib/context";
import type { Link, Document } from "../db/schema";
import { can } from "../lib/plans";
import { hashPassword } from "../lib/password";
import { newId, sha256Hex } from "../lib/ids";

export const links = new Hono<Env>();

export type OwnedLink = Link & {
  title: string;
  document_id: string;
  owner_id: string | null;
  manage_token: string;
  /** The owner's plan — what gates these settings, not the viewer's. */
  owner_plan: string | null;
};

/** A link the caller may administer: by account, or by the upload token. */
export async function loadOwnedLink(
  db: D1Database, slug: string, userId: string | null, token: string | null,
): Promise<OwnedLink | null> {
  const row = await db.prepare(
    `SELECT l.*, d.title, d.owner_id, d.manage_token, u.plan AS owner_plan
       FROM links l
       JOIN documents d ON d.id = l.document_id
       LEFT JOIN users u ON u.id = d.owner_id
      WHERE l.slug = ?`,
  ).bind(slug).first<OwnedLink>();

  if (!row) return null;
  const byAccount = userId !== null && row.owner_id === userId;
  const byToken = token !== null && token === row.manage_token;
  return byAccount || byToken ? row : null;
}

/**
 * Link settings. One form, one handler, one redirect — no JSON API and no
 * client bundle, because none of this needs to happen without a page load.
 */
links.post("/l/:slug/settings", async (c) => {
  const slug = c.req.param("slug");
  const user = c.get("user");
  const form = await c.req.formData();
  const token = (form.get("t") as string | null) ?? null;

  const link = await loadOwnedLink(c.env.DB, slug, user?.id ?? null, token);
  if (!link) return c.text("Not found.", 404);

  const owner = { plan: link.owner_plan };
  const back = `/l/${slug}/stats${token ? `?t=${encodeURIComponent(token)}` : ""}`;
  const fields: string[] = [];
  const values: unknown[] = [];
  const rejected: string[] = [];

  /** Applies a change only if the plan allows it; otherwise records a refusal. */
  const gated = (feature: Parameters<typeof can>[1], column: string, value: unknown) => {
    if (!can(owner, feature)) { rejected.push(feature); return; }
    fields.push(`${column} = ?`);
    values.push(value);
  };

  const name = (form.get("name") as string | null)?.trim();
  if (name) { fields.push("name = ?"); values.push(name.slice(0, 200)); }

  // Revoking is never gated: everyone can take back a link they shared.
  if (form.get("revoked") === "1") { fields.push("revoked_at = ?"); values.push(Date.now()); }
  else if (form.get("revoked") === "0") { fields.push("revoked_at = NULL"); }

  const password = (form.get("password") as string | null) ?? "";
  if (form.get("clear_password") === "1") gated("password", "password_hash", null);
  else if (password) gated("password", "password_hash", await hashPassword(password));

  if (form.has("expires_at")) {
    const raw = (form.get("expires_at") as string).trim();
    gated("expiry", "expires_at", raw ? new Date(`${raw}T23:59:59Z`).getTime() : null);
  }

  // Only turning downloads OFF is a paid capability; turning them back on is not.
  const allowDownload = form.get("allow_download") === "1";
  if (allowDownload) { fields.push("allow_download = ?"); values.push(1); }
  else gated("block_download", "allow_download", 0);

  if (fields.length > 0) {
    values.push(slug);
    await c.env.DB.prepare(`UPDATE links SET ${fields.join(", ")} WHERE slug = ?`).bind(...values).run();
  }

  const flag = rejected.length ? `${back.includes("?") ? "&" : "?"}upgrade=${rejected[0]}` : "";
  return c.redirect(`${back}${flag}`, 303);
});

/** Mute or unmute the "someone opened it" email for one link. */
links.post("/api/links/:slug/notify", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "not_signed_in" }, 401);

  const body = await c.req.json<{ enabled?: boolean }>().catch(() => ({}) as { enabled?: boolean });
  const result = await c.env.DB.prepare(
    `UPDATE links SET notify_on_view = ?
      WHERE slug = ?
        AND document_id IN (SELECT id FROM documents WHERE owner_id = ?)`,
  ).bind(body.enabled ? 1 : 0, c.req.param("slug"), user.id).run();

  if (result.meta.changes === 0) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

/**
 * Replace the file behind a link. The slug never changes, so everyone already
 * holding it sees the new version — which is the whole point of the feature.
 */
links.post("/l/:slug/version", async (c) => {
  const slug = c.req.param("slug");
  const user = c.get("user");
  const form = await c.req.formData();
  const token = (form.get("t") as string | null) ?? null;

  const link = await loadOwnedLink(c.env.DB, slug, user?.id ?? null, token);
  if (!link) return c.text("Not found.", 404);

  const back = `/l/${slug}/stats${token ? `?t=${encodeURIComponent(token)}` : ""}`;
  if (!can({ plan: link.owner_plan }, "versioning")) return c.redirect(`${back}?upgrade=versioning`, 303);

  const file = form.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return c.redirect(`${back}?error=not_a_pdf`, 303);
  }
  const maxBytes = Number(c.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
  if (file.size > maxBytes) return c.redirect(`${back}?error=too_large`, 303);

  const bytes = await file.arrayBuffer();
  if (new TextDecoder().decode(new Uint8Array(bytes.slice(0, 5))) !== "%PDF-") {
    return c.redirect(`${back}?error=not_a_pdf`, 303);
  }

  const document = await c.env.DB.prepare(`SELECT current_version FROM documents WHERE id = ?`)
    .bind(link.document_id).first<Pick<Document, "current_version">>();
  const version = (document?.current_version ?? 1) + 1;
  const r2Key = `docs/${link.document_id}/v${version}.pdf`;

  await c.env.FILES.put(r2Key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { docId: link.document_id, version: String(version) },
  });

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO document_versions (id, document_id, version, r2_key, sha256, size_bytes, page_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    ).bind(newId(), link.document_id, version, r2Key, await sha256Hex(bytes), file.size, Date.now()),
    c.env.DB.prepare(`UPDATE documents SET current_version = ? WHERE id = ?`)
      .bind(version, link.document_id),
    // Links that follow "latest" pick this up for free; pinned ones stay put.
    c.env.DB.prepare(`UPDATE links SET pinned_version = NULL WHERE slug = ?`).bind(slug),
  ]);

  return c.redirect(`${back}${back.includes("?") ? "&" : "?"}updated=${version}`, 303);
});
