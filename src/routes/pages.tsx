import { Hono } from "hono";
import type { ViewSession, PageStat } from "../db/schema";
import type { Env } from "../lib/context";
import { Layout } from "../components/layout";
import { BarChart, Copy, Link2, Merge, Pencil, QrCode, Repeat, RotateCw, Scissors, Shrink, Upload } from "../components/icons";
import { formatDateTime, formatMs } from "../lib/format";
import { siteUrl } from "../lib/urls";
import { t } from "../lib/i18n";
import { loadOwnedLink } from "./links";
import { LinkSettings } from "../components/link-settings";
import { Turnstile } from "../components/turnstile";
import { can } from "../lib/plans";

export const pages = new Hono<Env>();

/* -------------------------------------------------------------------------- */
/*  Landing                                                                    */
/* -------------------------------------------------------------------------- */

pages.get("/", (c) => {
  const s = t(c);

  return c.html(
    <Layout c={c} title={s.landing.title} description={s.landing.description}>
      <section class="mx-auto w-full max-w-5xl px-5 pt-16 pb-14 sm:pt-24">
        <p class="mb-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          {s.landing.badge}
        </p>
        <h1 class="max-w-[18ch] text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          {s.landing.heroTitle}
        </h1>
        <p class="mt-5 max-w-[55ch] text-lg text-muted-foreground">{s.landing.heroBody}</p>
        {/* The toolbox leads, because that is what the headline promises and
            it is the surface people arrive searching for. Sharing is the
            second button rather than the first — the tools page carries its
            own "share this result" prompt, which is the better moment to ask. */}
        <div class="mt-8 flex flex-wrap gap-3">
          <a href="/tools" class="btn" data-size="lg">
            {s.landing.ctaTools}
          </a>
          <a href="/new" class="btn" data-variant="outline" data-size="lg">
            <Upload /> {s.landing.ctaShare}
          </a>
        </div>
      </section>

      {/* The toolbox, first. Six cards rather than four: the three that work
          today plus the three the product is heading for, each carrying the
          "Soon" badge and rendering as plain markup rather than a link. That
          is the same honesty rule compression already followed — listing an
          unbuilt tool is fine, letting somebody click through to nothing is
          not — and together they are what says "all in one place" without a
          sentence claiming it. */}
      <section class="mx-auto w-full max-w-5xl px-5 py-16">
        <h2 class="text-2xl font-semibold tracking-tight">{s.landing.toolsTitle}</h2>
        <p class="mt-2 max-w-[55ch] text-muted-foreground">{s.landing.toolsBody}</p>
        <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ToolCard href="/tools#merge" icon={<Merge class="size-5" />} name={s.landing.mergeName} body={s.landing.mergeBody} />
          <ToolCard href="/tools#split" icon={<Scissors class="size-5" />} name={s.landing.splitName} body={s.landing.splitBody} />
          <ToolCard href="/tools#rotate" icon={<RotateCw class="size-5" />} name={s.landing.rotateName} body={s.landing.rotateBody} />
          <ToolCard href="/tools#compress" icon={<Shrink class="size-5" />} name={s.landing.compressName} body={s.landing.compressBody} soon={s.landing.soon} />
          <ToolCard href="/tools#convert" icon={<Repeat class="size-5" />} name={s.landing.convertName} body={s.landing.convertBody} soon={s.landing.soon} />
          <ToolCard href="/tools#edit" icon={<Pencil class="size-5" />} name={s.landing.editName} body={s.landing.editBody} soon={s.landing.soon} />
        </div>
      </section>

      {/* Sharing, second — the differentiator rather than the whole pitch. It
          keeps the card background and full-bleed border it had as the hero's
          neighbour, which is now what marks it out as the part no other PDF
          toolbox offers. */}
      <section class="border-y border-border bg-card">
        <div class="mx-auto w-full max-w-5xl px-5 py-14">
          <h2 class="text-2xl font-semibold tracking-tight text-balance">{s.landing.shareTitle}</h2>
          <p class="mt-2 max-w-[55ch] text-muted-foreground">{s.landing.shareBody}</p>

          <div class="mt-8 grid gap-px sm:grid-cols-3">
            <Step
              icon={<Link2 class="size-5 text-primary" />}
              title={s.landing.step1Title}
              body={s.landing.step1Body}
            />
            <Step
              icon={<BarChart class="size-5 text-primary" />}
              title={s.landing.step2Title}
              body={s.landing.step2Body}
            />
            <Step
              icon={<QrCode class="size-5 text-primary" />}
              title={s.landing.step3Title}
              body={s.landing.step3Body}
            />
          </div>

          <a href="/new" class="btn mt-8" data-size="lg">
            <Upload /> {s.landing.ctaShare}
          </a>
        </div>
      </section>
    </Layout>,
  );
});

/** `ps-0`/`pe-0` rather than `pl-0`/`pr-0`, so the first and last column lose
 *  their outer padding at whichever edge the language actually starts from. */
const Step = ({ icon, title, body }: { icon: unknown; title: string; body: string }) => (
  <div class="px-0 py-4 sm:px-6 sm:py-0 sm:first:ps-0 sm:last:pe-0">
    <div class="mb-3 flex size-10 items-center justify-center rounded-lg bg-accent">{icon as never}</div>
    <h3 class="font-medium">{title}</h3>
    <p class="mt-1.5 text-sm text-muted-foreground">{body}</p>
  </div>
);

/**
 * `soon` renders the card as plain markup instead of a link — and carries the
 * badge's own text, since "Soon" needs translating like everything else.
 * Advertising a tool that is not built and letting people click through to
 * nothing is worse than not listing it, and compression is a phase away, so it
 * stays visible and honest rather than disappearing.
 */
const ToolCard = ({
  href,
  icon,
  name,
  body,
  soon,
}: { href: string; icon: unknown; name: string; body: string; soon?: string }) => {
  const inner = (
    <>
      <span class="text-muted-foreground">{icon as never}</span>
      <span class="mt-2 flex items-center gap-2 font-medium">
        {name}
        {soon && (
          <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {soon}
          </span>
        )}
      </span>
      <span class="text-sm text-muted-foreground">{body}</span>
    </>
  );

  return soon ? (
    <div class="card gap-1 rounded-lg border border-dashed border-border bg-card/50 p-4 opacity-70">
      {inner}
    </div>
  ) : (
    <a href={href} class="card gap-1 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50">
      {inner}
    </a>
  );
};

/* -------------------------------------------------------------------------- */
/*  Crawlers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The marketing and tool pages are the SEO funnel and should be crawled hard.
 * Everything that renders or serves someone's document must never be, and
 * `Disallow` is only half of it — a disallowed URL can still be listed from
 * inbound links alone, which is why those routes also send `noindex`
 * themselves. This file is the first line, not the only one.
 */
pages.get("/robots.txt", (c) =>
  c.text(
    [
      "User-agent: *",
      "Allow: /$",
      "Allow: /tools",
      "Allow: /pricing",
      "Allow: /privacy",
      "Allow: /terms",
      "",
      "# The language switch. Every one of these is a redirect to a page that is",
      "# already listed above, so there is nothing here worth a crawl budget.",
      "Disallow: /lang/",
      "",
      "# Someone's document, or the analytics for it. Never index these.",
      "Disallow: /v/",
      "Disallow: /l/",
      "Disallow: /api/",
      "Disallow: /new",
      "Disallow: /login",
      "Disallow: /auth/",
      "Disallow: /dashboard",
      "Disallow: /report",
      "",
      // Short links live at the root, so the only way to fence them off is to
      // disallow the root and re-allow each real page above.
      "Disallow: /",
      "",
      `Sitemap: ${new URL("/sitemap.xml", siteUrl(c)).toString()}`,
      "",
    ].join("\n"),
    200,
    { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
  ),
);

/**
 * Only the pages that are meant to rank. Links are deliberately absent.
 *
 * Each entry carries `hreflang` alternates for both languages. The URL is the
 * same either way — the language lives in a cookie, not the path — so this is
 * telling search engines that one URL serves both, which is what `x-default`
 * on the same address means. Without it, an Arabic result and an English
 * result for the same page look like duplicates.
 */
pages.get("/sitemap.xml", (c) => {
  const origin = siteUrl(c);
  const urls = ["/", "/tools", "/pricing", "/privacy", "/terms"];

  const entry = (path: string) => {
    const loc = new URL(path, origin).toString();
    return (
      `  <url>\n` +
      `    <loc>${loc}</loc>\n` +
      `    <xhtml:link rel="alternate" hreflang="en" href="${loc}"/>\n` +
      `    <xhtml:link rel="alternate" hreflang="ar" href="${loc}"/>\n` +
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>\n` +
      `  </url>`
    );
  };

  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
      `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
      urls.map(entry).join("\n") +
      `\n</urlset>\n`,
    200,
    { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=86400" },
  );
});

/* -------------------------------------------------------------------------- */
/*  Upload                                                                     */
/* -------------------------------------------------------------------------- */

pages.get("/new", (c) => {
  const s = t(c);

  return c.html(
    <Layout c={c} title={s.upload.title} script="/assets/upload.js">
      <section class="mx-auto w-full max-w-2xl px-5 py-16">
        <h1 class="text-3xl font-semibold tracking-tight">{s.upload.h1}</h1>
        <p class="mt-2 text-muted-foreground">{s.upload.lead}</p>

        <form id="upload-form" class="mt-8">
          <label
            id="dropzone"
            for="file"
            class="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-input bg-card px-6 py-14 text-center transition-colors hover:border-primary hover:bg-accent/40"
          >
            <span class="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Upload class="size-5" />
            </span>
            <span class="font-medium">{s.upload.choose}</span>
            <span id="hint" class="text-sm text-muted-foreground">
              {s.upload.hint(String(c.env.MAX_UPLOAD_MB ?? "25"), String(c.env.ANON_LINK_TTL_DAYS ?? "7"))}
            </span>
            <input id="file" name="file" type="file" accept="application/pdf" class="sr-only" />
          </label>

          {/* Solves on load, so the token is normally waiting before a file is
              even chosen. `interaction-only` keeps it invisible unless someone
              actually looks suspicious. */}
          <Turnstile
            id="turnstile-upload" action="upload" class="mt-4 flex justify-center"
            siteKey={c.env.TURNSTILE_SITE_KEY}
          />

          <div id="progress" class="mt-6 hidden">
            <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div id="bar" class="h-full w-0 rounded-full bg-primary transition-[width] duration-200"></div>
            </div>
            <p id="progress-label" class="mt-2 text-sm text-muted-foreground">{s.upload.uploading}</p>
          </div>

          <p id="error" class="mt-4 hidden text-sm text-destructive"></p>
        </form>

        <div id="result" class="mt-8 hidden">
          <div class="card rounded-xl border border-border bg-card p-5">
            <header class="mb-4">
              <h2 class="card-title text-lg font-semibold">{s.upload.resultTitle}</h2>
              <p class="text-sm text-muted-foreground">{s.upload.resultBody}</p>
            </header>
            <div class="flex gap-2">
              <input id="share-url" dir="ltr" class="input font-mono text-sm" readonly />
              <button type="button" id="copy" class="btn" data-variant="outline">
                <Copy /> {s.upload.copy}
              </button>
            </div>
            <div class="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
              <img id="qr" alt={s.upload.qrAlt} width="132" height="132" class="rounded-lg border border-border bg-white p-2" />
              <div class="flex flex-col gap-2 text-sm">
                <a id="open-link" class="btn" data-variant="outline" data-size="sm" target="_blank" rel="noopener">
                  {s.upload.openViewer}
                </a>
                <a id="stats-link" class="btn" data-variant="ghost" data-size="sm">
                  <BarChart /> {s.upload.seeStats}
                </a>
                <a id="qr-download" class="btn" data-variant="ghost" data-size="sm" download="pdfsy-qr.svg">
                  {s.upload.downloadQr}
                </a>
              </div>
            </div>
          </div>
          <p class="mt-4 text-sm text-muted-foreground">{s.upload.keepTab}</p>
        </div>
      </section>
    </Layout>,
  );
});

/* -------------------------------------------------------------------------- */
/*  Tools                                                                      */
/* -------------------------------------------------------------------------- */

pages.get("/tools", (c) => {
  const s = t(c);
  const tab =
    "btn rounded-b-none border-b-2 border-transparent aria-selected:border-b-primary aria-selected:text-foreground";

  return c.html(
    <Layout c={c} title={s.tools.title} description={s.tools.description} script="/assets/tools.js">
      <section class="mx-auto w-full max-w-3xl px-5 py-16">
        <h1 class="text-3xl font-semibold tracking-tight">{s.tools.h1}</h1>
        <p class="mt-2 max-w-[55ch] text-muted-foreground">{s.tools.lead}</p>

        <nav class="mt-8 flex gap-1 border-b border-border" role="tablist" id="tool-tabs">
          <button class={tab} data-variant="ghost" data-size="sm" data-tool="merge" role="tab" aria-selected="true">
            {s.tools.tabMerge}
          </button>
          <button class={tab} data-variant="ghost" data-size="sm" data-tool="split" role="tab" aria-selected="false">
            {s.tools.tabSplit}
          </button>
          <button class={tab} data-variant="ghost" data-size="sm" data-tool="rotate" role="tab" aria-selected="false">
            {s.tools.tabRotate}
          </button>
        </nav>

        <div class="mt-6" id="tool-panels">
          <ToolPanel id="merge" title={s.tools.mergeTitle} body={s.tools.mergeBody}>
            <input type="file" id="merge-files" accept="application/pdf" multiple class="input" />
            <ol id="merge-list" class="mt-3 flex flex-col gap-1 text-sm text-muted-foreground"></ol>
          </ToolPanel>

          <ToolPanel id="split" title={s.tools.splitTitle} body={s.tools.splitBody} hidden>
            <input type="file" id="split-file" accept="application/pdf" class="input" />
            <div class="mt-3 flex gap-2">
              <input id="split-from" class="input tnum" type="number" min="1" value="1" placeholder={s.tools.from} />
              <input id="split-to" class="input tnum" type="number" min="1" placeholder={s.tools.to} />
            </div>
          </ToolPanel>

          <ToolPanel id="rotate" title={s.tools.rotateTitle} body={s.tools.rotateBody} hidden>
            <input type="file" id="rotate-file" accept="application/pdf" class="input" />
            <div class="mt-3">
              <select id="rotate-angle" class="select">
                <option value="90">{s.tools.angle90}</option>
                <option value="180">{s.tools.angle180}</option>
                <option value="270">{s.tools.angle270}</option>
              </select>
            </div>
          </ToolPanel>
        </div>

        {/* The tools themselves never upload, but "Share it as a tracked link"
            posts to the same endpoint the upload page does. */}
        <Turnstile
          id="turnstile-tools" action="upload" class="mt-6 flex"
          siteKey={c.env.TURNSTILE_SITE_KEY}
        />

        <div class="mt-6 flex flex-wrap items-center gap-3">
          <button id="run" class="btn">{s.tools.run}</button>
          <a id="download" class="btn hidden" data-variant="outline" download="pdfsy-output.pdf">
            {s.tools.download}
          </a>
          <button id="share-result" class="btn hidden" data-variant="ghost">{s.tools.shareResult}</button>
        </div>
        <p id="tool-status" class="mt-3 text-sm text-muted-foreground"></p>
      </section>
    </Layout>,
  );
});

const ToolPanel = ({
  id, title, body, hidden, children,
}: { id: string; title: string; body: string; hidden?: boolean; children?: unknown }) => (
  <section id={`panel-${id}`} class={`card rounded-xl border border-border bg-card p-5 ${hidden ? "hidden" : ""}`}>
    <header class="mb-4">
      <h2 class="card-title font-semibold">{title}</h2>
      <p class="text-sm text-muted-foreground">{body}</p>
    </header>
    {children as never}
  </section>
);

/* -------------------------------------------------------------------------- */
/*  Stats                                                                      */
/* -------------------------------------------------------------------------- */

pages.get("/l/:slug/stats", async (c) => {
  const s = t(c);
  const lang = c.get("lang");
  const slug = c.req.param("slug");
  const token = c.req.query("t") ?? "";

  // Two ways in: the account that owns it, or the token handed out at upload.
  const user = c.get("user");
  const row = await loadOwnedLink(c.env.DB, slug, user?.id ?? null, token || null);

  if (!row) {
    return c.html(
      <Layout c={c} title={s.stats.title} noindex>
        <section class="mx-auto w-full max-w-lg px-5 py-24 text-center">
          <h1 class="text-2xl font-semibold tracking-tight">{s.stats.privateH1}</h1>
          <p class="mt-2 text-muted-foreground">{s.stats.privateBody}</p>
          <a href="/login" class="btn mt-6">{s.stats.signIn}</a>
        </section>
      </Layout>,
      403,
    );
  }

  const [sessions, stats] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM view_sessions WHERE slug = ? ORDER BY started_at DESC LIMIT 50`,
    ).bind(slug).all<ViewSession>(),
    c.env.DB.prepare(
      `SELECT * FROM page_stats WHERE slug = ? ORDER BY page ASC`,
    ).bind(slug).all<PageStat>(),
  ]);

  const views = sessions.results.length;
  const totalMs = sessions.results.reduce((a, v) => a + v.total_ms, 0);
  const peak = Math.max(1, ...stats.results.map((p) => p.total_ms));

  return c.html(
    <Layout c={c} title={`${row.name ?? row.title} — ${s.stats.suffix}`} noindex>
      <section class="mx-auto w-full max-w-3xl px-5 py-12">
        <a href={user ? "/dashboard" : "/new"} class="text-sm text-muted-foreground hover:text-foreground">
          {s.stats.backArrow} {user ? s.stats.backAll : s.stats.backShare}
        </a>
        <h1 class="mt-3 text-2xl font-semibold tracking-tight">{row.name ?? row.title}</h1>
        <p class="mt-1 font-mono text-sm text-muted-foreground">
          <bdi>{new URL(`/${slug}`, siteUrl(c)).toString()}</bdi>
        </p>

        <div class="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat label={s.stats.views} value={String(views)} />
          <Stat label={s.stats.totalTime} value={formatMs(totalMs, lang)} />
          <Stat
            label={s.stats.avgPerView}
            value={views ? formatMs(Math.round(totalMs / views), lang) : "—"}
          />
        </div>

        <h2 class="mt-10 font-semibold">{s.stats.perPageTitle}</h2>
        {!can({ plan: row.owner_plan }, "page_analytics") ? (
          <div class="mt-3 rounded-lg border border-dashed border-input px-5 py-8 text-center">
            <p class="text-sm text-muted-foreground">{s.stats.proGate}</p>
            <a href="/pricing" class="btn mt-4" data-size="sm">{s.stats.seePlans}</a>
          </div>
        ) : stats.results.length === 0 ? (
          <p class="mt-2 text-sm text-muted-foreground">{s.stats.noPageData}</p>
        ) : (
          <ul class="mt-3 flex flex-col gap-1.5">
            {stats.results.map((p) => (
              <li class="flex items-center gap-3 text-sm">
                <span class="w-14 shrink-0 text-muted-foreground">{s.stats.page(p.page)}</span>
                <span class="h-6 flex-1 overflow-hidden rounded bg-muted">
                  {/* The bar grows from the reading edge, so in Arabic it fills
                      from the right like the text above it. */}
                  <span
                    class="ms-0 me-auto block h-full rounded bg-primary"
                    style={`width:${Math.round((p.total_ms / peak) * 100)}%`}
                  ></span>
                </span>
                <span class="tnum w-16 shrink-0 text-end text-muted-foreground">
                  {formatMs(p.total_ms, lang)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h2 class="mt-10 font-semibold">{s.stats.recentTitle}</h2>
        <div class="mt-3 overflow-x-auto rounded-lg border border-border">
          <table class="table w-full text-sm">
            <thead>
              <tr>
                <th class="px-3 py-2 text-start font-medium">{s.stats.when}</th>
                <th class="px-3 py-2 text-start font-medium">{s.stats.where}</th>
                <th class="px-3 py-2 text-start font-medium">{s.stats.time}</th>
                <th class="px-3 py-2 text-start font-medium">{s.stats.reached}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.results.length === 0 && (
                <tr><td colspan={4} class="px-3 py-6 text-center text-muted-foreground">{s.stats.nobody}</td></tr>
              )}
              {sessions.results.map((v) => (
                <tr>
                  <td class="tnum px-3 py-2">{formatDateTime(v.started_at, lang)}</td>
                  <td class="px-3 py-2">{v.country ?? "—"}</td>
                  <td class="tnum px-3 py-2">{formatMs(v.total_ms, lang)}</td>
                  <td class="px-3 py-2">{s.stats.reachedPage(v.max_page || 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <LinkSettings
          s={s}
          link={row}
          token={token || null}
          user={{ plan: row.owner_plan }}
          refused={c.req.query("upgrade") ?? null}
          updatedVersion={c.req.query("updated") ?? null}
          error={c.req.query("error") ?? null}
        />
      </section>
    </Layout>,
  );
});

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div class="card rounded-lg border border-border bg-card p-4">
    <p class="text-sm text-muted-foreground">{label}</p>
    <p class="tnum mt-1 text-2xl font-semibold">{value}</p>
  </div>
);
