import { Hono } from "hono";
import type { Env } from "../lib/context";
import { Layout } from "../components/layout";
import { BarChart, Link2, Upload } from "../components/icons";
import { formatMs } from "../lib/format";
import { siteUrl } from "../lib/urls";

export const dashboard = new Hono<Env>();

type Row = {
  title: string;
  created_at: number;
  slug: string;
  expires_at: number | null;
  notify_on_view: number;
  views: number;
  total_ms: number;
  last_view: number | null;
};

dashboard.get("/dashboard", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login", 303);

  const { results } = await c.env.DB.prepare(
    `SELECT d.title, d.created_at, l.slug, l.expires_at, l.notify_on_view,
            COUNT(vs.id) AS views,
            COALESCE(SUM(vs.total_ms), 0) AS total_ms,
            MAX(vs.started_at) AS last_view
       FROM documents d
       JOIN links l ON l.document_id = d.id
       LEFT JOIN view_sessions vs ON vs.slug = l.slug
      WHERE d.owner_id = ? AND d.deleted_at IS NULL
      GROUP BY l.slug
      ORDER BY d.created_at DESC
      LIMIT 200`,
  ).bind(user.id).all<Row>();

  return c.html(
    <Layout title="Your links — pdf.sy" user={user} script="/assets/dashboard.js">
      <section class="mx-auto w-full max-w-4xl px-5 py-12">
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight">Your links</h1>
            <p class="mt-1 text-sm text-muted-foreground">{user.email}</p>
          </div>
          <a href="/new" class="btn ml-auto"><Upload /> Share a PDF</a>
        </div>

        {/* Populated by dashboard.js when it finds links created before signing in. */}
        <div id="claim-banner" class="mt-6 hidden rounded-lg border border-border bg-accent/50 px-4 py-3 text-sm">
          <span id="claim-text"></span>
        </div>

        {results.length === 0 ? (
          <div class="mt-10 rounded-xl border border-dashed border-input bg-card px-6 py-16 text-center">
            <div class="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Link2 class="size-5" />
            </div>
            <h2 class="font-medium">No links yet</h2>
            <p class="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Share a PDF and this page fills up with who opened it, for how long,
              and where they stopped reading.
            </p>
            <a href="/new" class="btn mt-6">Share your first PDF</a>
          </div>
        ) : (
          <ul class="mt-8 flex flex-col gap-2">
            {results.map((row) => (
              <li class="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
                <div class="min-w-0 flex-1">
                  <a href={`/l/${row.slug}/stats`} class="font-medium hover:underline">{row.title}</a>
                  <p class="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {new URL(`/${row.slug}`, siteUrl(c)).host}/{row.slug}
                    {row.expires_at && (
                      <span class="ml-2 rounded bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">
                        expires {new Date(row.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>

                <div class="flex items-center gap-6 text-sm">
                  <span class="tnum text-right">
                    <span class="block font-medium">{row.views}</span>
                    <span class="block text-xs text-muted-foreground">views</span>
                  </span>
                  <span class="tnum text-right">
                    <span class="block font-medium">{formatMs(row.total_ms)}</span>
                    <span class="block text-xs text-muted-foreground">read time</span>
                  </span>
                  <span class="hidden text-right sm:block">
                    <span class="block font-medium">
                      {row.last_view ? new Date(row.last_view).toLocaleDateString() : "—"}
                    </span>
                    <span class="block text-xs text-muted-foreground">last opened</span>
                  </span>
                </div>

                <label class="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox" class="input size-4" data-notify={row.slug}
                    checked={row.notify_on_view === 1}
                  />
                  Email me
                </label>

                <a href={`/l/${row.slug}/stats`} class="btn" data-variant="outline" data-size="sm">
                  <BarChart /> Stats
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Layout>,
  );
});

/** Mute or unmute the "someone opened it" email for one link. */
dashboard.post("/api/links/:slug/notify", async (c) => {
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
