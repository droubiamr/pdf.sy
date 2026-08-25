import { Hono } from "hono";
import type { Env } from "../lib/context";
import { Layout } from "../components/layout";
import { BarChart, Link2, Upload } from "../components/icons";
import { formatDate, formatMs } from "../lib/format";
import { siteUrl } from "../lib/urls";
import { t } from "../lib/i18n";

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

  const s = t(c);
  const lang = c.get("lang");

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
    <Layout c={c} title={s.dashboard.title} script="/assets/dashboard.js" noindex>
      <section class="mx-auto w-full max-w-4xl px-5 py-12">
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight">{s.dashboard.h1}</h1>
            <p class="mt-1 text-sm text-muted-foreground"><bdi>{user.email}</bdi></p>
          </div>
          <a href="/new" class="btn ms-auto"><Upload /> {s.dashboard.share}</a>
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
            <h2 class="font-medium">{s.dashboard.emptyH2}</h2>
            <p class="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{s.dashboard.emptyBody}</p>
            <a href="/new" class="btn mt-6">{s.dashboard.emptyCta}</a>
          </div>
        ) : (
          <ul class="mt-8 flex flex-col gap-2">
            {results.map((row) => (
              <li class="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
                <div class="min-w-0 flex-1">
                  <a href={`/l/${row.slug}/stats`} class="font-medium hover:underline">{row.title}</a>
                  <p class="mt-0.5 truncate text-xs text-muted-foreground">
                    <bdi class="font-mono">
                      {new URL(`/${row.slug}`, siteUrl(c)).host}/{row.slug}
                    </bdi>
                    {row.expires_at && (
                      <span class="ms-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {s.dashboard.expires(formatDate(row.expires_at, lang))}
                      </span>
                    )}
                  </p>
                </div>

                <div class="flex items-center gap-6 text-sm">
                  <span class="tnum text-end">
                    <span class="block font-medium">{row.views}</span>
                    <span class="block text-xs text-muted-foreground">{s.dashboard.views}</span>
                  </span>
                  <span class="tnum text-end">
                    <span class="block font-medium">{formatMs(row.total_ms, lang)}</span>
                    <span class="block text-xs text-muted-foreground">{s.dashboard.readTime}</span>
                  </span>
                  <span class="hidden text-end sm:block">
                    <span class="block font-medium">
                      {row.last_view ? formatDate(row.last_view, lang) : "—"}
                    </span>
                    <span class="block text-xs text-muted-foreground">{s.dashboard.lastOpened}</span>
                  </span>
                </div>

                <label class="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox" class="input size-4" data-notify={row.slug}
                    checked={row.notify_on_view === 1}
                  />
                  {s.dashboard.emailMe}
                </label>

                <a href={`/l/${row.slug}/stats`} class="btn" data-variant="outline" data-size="sm">
                  <BarChart /> {s.dashboard.stats}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Layout>,
  );
});

