import { Hono } from "hono";
import { renderSVG } from "uqr";
import type { DocumentVersion } from "../db/schema";
import type { Env } from "../lib/context";
import { Layout } from "../components/layout";
import { Download, FileText } from "../components/icons";
import { loadLink } from "./api";
import { siteUrl } from "../lib/urls";

export const view = new Hono<Env>();

/** QR for a link. Generated on the fly — there is nothing to store. */
view.get("/:slug/qr.svg", async (c) => {
  const slug = c.req.param("slug");
  const link = await loadLink(c.env.DB, slug);
  if (!link) return c.notFound();

  const svg = renderSVG(new URL(`/${slug}`, siteUrl(c)).toString(), {
    border: 1,
    pixelSize: 8,
  });

  return c.body(svg, 200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=86400",
  });
});

/**
 * The bytes. Never hand out a raw R2 URL: routing every read through here is
 * what makes revocation, expiry and download-blocking possible at all.
 */
view.get("/v/:slug/file", async (c) => {
  const slug = c.req.param("slug");
  const link = await loadLink(c.env.DB, slug);
  if (!link) return c.text("This link is no longer available.", 404);

  const version = await c.env.DB.prepare(
    `SELECT * FROM document_versions WHERE document_id = ? AND version = ?`,
  ).bind(link.document_id, link.pinned_version ?? 1).first<DocumentVersion>();
  if (!version) return c.text("Not found.", 404);

  const object = await c.env.FILES.get(version.r2_key);
  if (!object) return c.text("Not found.", 404);

  return new Response(object.body, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(version.size_bytes),
      "content-disposition": `inline; filename="${encodeURIComponent(link.name ?? "document")}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

/** The viewer itself. Bare layout — the document owns the screen. */
view.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const link = await loadLink(c.env.DB, slug);

  if (!link) {
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

  return c.html(
    <Layout title={`${link.name ?? "Document"} — pdf.sy`} script="/assets/viewer.js" bare>
      <div class="flex min-h-dvh flex-col bg-muted/40" data-slug={slug}>
        <header class="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur">
          <FileText class="size-4 shrink-0 text-primary" />
          <span class="truncate text-sm font-medium">{link.name ?? "Document"}</span>
          <span id="page-indicator" class="tnum ml-auto shrink-0 text-sm text-muted-foreground">—</span>
          {link.allow_download === 1 && (
            <a id="download" class="btn shrink-0" data-variant="outline" data-size="sm" href={`/v/${slug}/file`} download>
              <Download /> <span class="hidden sm:inline">Download</span>
            </a>
          )}
        </header>

        <div id="pages" class="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-3 py-6">
          <div id="viewer-loading" class="py-24 text-sm text-muted-foreground">Loading document…</div>
        </div>

        <footer class="mt-auto border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
          Shared with <a href="/" class="font-medium text-foreground hover:underline">pdf.sy</a>
          <span class="px-1.5">·</span>
          <a href={`/report?slug=${slug}`} class="hover:underline">Report this file</a>
        </footer>
      </div>
    </Layout>,
  );
});
