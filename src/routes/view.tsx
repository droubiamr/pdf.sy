import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { renderSVG } from "uqr";
import type { Env } from "../lib/context";
import type { Link } from "../db/schema";
import { Layout } from "../components/layout";
import { Download, FileText } from "../components/icons";
import { loadLink } from "./api";
import { siteUrl } from "../lib/urls";
import { resolveVersion } from "../lib/versions";
import { verifyPassword, unlockToken } from "../lib/password";
import { can } from "../lib/plans";

export const view = new Hono<Env>();

const unlockCookie = (slug: string) => `pdfsy_unlock_${slug}`;

/** Everything the viewer needs, including who owns it and on what plan. */
async function loadContext(db: D1Database, slug: string) {
  const link = await loadLink(db, slug);
  if (!link) return null;

  const meta = await db.prepare(
    `SELECT d.title, u.plan AS owner_plan
       FROM documents d LEFT JOIN users u ON u.id = d.owner_id
      WHERE d.id = ?`,
  ).bind(link.document_id).first<{ title: string; owner_plan: string | null }>();

  return { link, title: link.name ?? meta?.title ?? "Document", ownerPlan: meta?.owner_plan ?? null };
}

/** Has this visitor already entered the password for this link? */
async function isUnlocked(c: Context<Env>, link: Link): Promise<boolean> {
  if (!link.password_hash) return true;
  const cookie = getCookie(c, unlockCookie(link.slug));
  return cookie === (await unlockToken(link.slug, link.password_hash));
}

/* --------------------------------- QR ------------------------------------ */

view.get("/:slug/qr.svg", async (c) => {
  const slug = c.req.param("slug");
  const link = await loadLink(c.env.DB, slug);
  if (!link) return c.notFound();

  const svg = renderSVG(new URL(`/${slug}`, siteUrl(c)).toString(), { border: 1, pixelSize: 8 });
  return c.body(svg, 200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=86400",
  });
});

/* -------------------------------- unlock --------------------------------- */

view.post("/:slug/unlock", async (c) => {
  const slug = c.req.param("slug");
  const link = await loadLink(c.env.DB, slug);
  if (!link?.password_hash) return c.redirect(`/${slug}`, 303);

  const form = await c.req.formData();
  const password = String(form.get("password") ?? "");

  if (!(await verifyPassword(password, link.password_hash))) {
    return c.redirect(`/${slug}?wrong=1`, 303);
  }

  setCookie(c, unlockCookie(slug), await unlockToken(slug, link.password_hash), {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return c.redirect(`/${slug}`, 303);
});

/* --------------------------------- bytes --------------------------------- */

/**
 * Never hand out a raw R2 URL: routing every read through here is what makes
 * revocation, expiry, download-blocking and passwords possible at all.
 */
view.get("/v/:slug/file", async (c) => {
  const slug = c.req.param("slug");
  const link = await loadLink(c.env.DB, slug);
  if (!link) return c.text("This link is no longer available.", 404);

  // The gate has to be here too, not only on the viewer page — otherwise the
  // password protects the wrapper and the document leaks.
  if (!(await isUnlocked(c, link))) return c.text("This document is password protected.", 403);

  const version = await resolveVersion(c.env.DB, link);
  if (!version) return c.text("Not found.", 404);

  const object = await c.env.FILES.get(version.r2_key);
  if (!object) return c.text("Not found.", 404);

  const download = c.req.query("download") === "1";
  if (download && link.allow_download !== 1) {
    return c.text("Downloads are disabled for this link.", 403);
  }

  return new Response(object.body, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(version.size_bytes),
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(link.name ?? "document")}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

/* -------------------------------- viewer --------------------------------- */

view.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const context = await loadContext(c.env.DB, slug);

  if (!context) {
    return c.html(
      <Layout title="Link unavailable — pdf.sy" user={c.get("user")}>
        <section class="mx-auto w-full max-w-lg px-5 py-24 text-center">
          <h1 class="text-2xl font-semibold tracking-tight">This link is no longer available</h1>
          <p class="mt-2 text-muted-foreground">
            It may have expired, been revoked by its owner, or never existed.
          </p>
          <a href="/new" class="btn mt-6">Share a PDF of your own</a>
        </section>
      </Layout>,
      404,
    );
  }

  const { link, title, ownerPlan } = context;

  if (!(await isUnlocked(c, link))) {
    const wrong = c.req.query("wrong") === "1";
    return c.html(
      <Layout title={`Password required — pdf.sy`} user={c.get("user")}>
        <section class="mx-auto w-full max-w-sm px-5 py-24">
          <div class="card rounded-xl border border-border bg-card p-6">
            <header class="mb-4">
              <h1 class="card-title text-lg font-semibold">This document is protected</h1>
              <p class="mt-1 text-sm text-muted-foreground">
                Enter the password the sender gave you.
              </p>
            </header>
            <form method="post" action={`/${slug}/unlock`} class="flex flex-col gap-3">
              <input
                type="password" name="password" required autofocus
                autocomplete="current-password" placeholder="Password" class="input"
                aria-invalid={wrong ? "true" : undefined}
              />
              {wrong && <p class="text-sm text-destructive">That password is not right.</p>}
              <button type="submit" class="btn">Open document</button>
            </form>
          </div>
        </section>
      </Layout>,
      wrong ? 401 : 200,
    );
  }

  const hideBadge = can({ plan: ownerPlan }, "hide_badge");

  return c.html(
    <Layout title={`${title} — pdf.sy`} script="/assets/viewer.js" bare>
      <div class="flex min-h-dvh flex-col bg-muted/40" data-slug={slug}>
        <header class="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur">
          <FileText class="size-4 shrink-0 text-primary" />
          <span class="truncate text-sm font-medium">{title}</span>
          <span id="page-indicator" class="tnum ml-auto shrink-0 text-sm text-muted-foreground">—</span>
          {link.allow_download === 1 && (
            <a id="download" class="btn shrink-0" data-variant="outline" data-size="sm"
               href={`/v/${slug}/file?download=1`} download>
              <Download /> <span class="hidden sm:inline">Download</span>
            </a>
          )}
        </header>

        <div id="pages" class="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-3 py-6">
          <div id="viewer-loading" class="py-24 text-sm text-muted-foreground">Loading document…</div>
        </div>

        <footer class="mt-auto border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
          {!hideBadge && (
            <>
              Shared with <a href="/" class="font-medium text-foreground hover:underline">pdf.sy</a>
              <span class="px-1.5">·</span>
            </>
          )}
          <a href={`/report?slug=${slug}`} class="hover:underline">Report this file</a>
        </footer>
      </div>
    </Layout>,
  );
});
