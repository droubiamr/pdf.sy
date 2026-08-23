import { Hono } from "hono";
import type { Link, Document, ViewSession, PageStat } from "../db/schema";
import type { Env } from "../lib/context";
import { Layout } from "../components/layout";
import { BarChart, Copy, Link2, Merge, QrCode, RotateCw, Scissors, Shrink, Upload } from "../components/icons";
import { formatMs } from "../lib/format";
import { siteUrl } from "../lib/urls";
import { loadOwnedLink } from "./links";
import { LinkSettings } from "../components/link-settings";
import { can } from "../lib/plans";

export const pages = new Hono<Env>();

/* -------------------------------------------------------------------------- */
/*  Landing                                                                    */
/* -------------------------------------------------------------------------- */

pages.get("/", (c) =>
  c.html(
    <Layout
      user={c.get("user")}
      title="pdf.sy — send a PDF as a link, see what happens to it"
      description="Upload a PDF, get a short link, and find out who opened it, for how long, and which pages they actually read."
    >
      <section class="mx-auto w-full max-w-5xl px-5 pt-16 pb-14 sm:pt-24">
        <p class="mb-4 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          No account needed to try it
        </p>
        <h1 class="max-w-[18ch] text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Send a PDF as a link. See what happens to it.
        </h1>
        <p class="mt-5 max-w-[55ch] text-lg text-muted-foreground">
          Stop emailing attachments into the void. Share one short link, and know
          who opened it, how long they stayed, and which page they stopped on.
        </p>
        <p class="mt-3 max-w-[55ch] text-lg font-medium">
          And with a free account, your links never expire.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
          <a href="/new" class="btn" data-size="lg">
            <Upload /> Share a PDF
          </a>
          <a href="/tools" class="btn" data-variant="outline" data-size="lg">
            Free PDF tools
          </a>
        </div>
      </section>

      <section class="border-y border-border bg-card">
        <div class="mx-auto grid w-full max-w-5xl gap-px px-5 py-14 sm:grid-cols-3">
          <Step
            icon={<Link2 class="size-5 text-primary" />}
            title="One short link"
            body="pdf.sy/a7f3k9 opens in a fast, mobile-friendly viewer. No download prompt, no “open in Acrobat”, no Drive permission screen."
          />
          <Step
            icon={<BarChart class="size-5 text-primary" />}
            title="Page-by-page insight"
            body="See time spent on every page. When a client rereads your pricing page twice, you know before you pick up the phone."
          />
          <Step
            icon={<QrCode class="size-5 text-primary" />}
            title="Print it anywhere"
            body="Every link comes with a QR code. Put a menu, a brochure, or a price list on a sign and update the file without reprinting."
          />
        </div>
      </section>

      <section class="mx-auto w-full max-w-5xl px-5 py-16">
        <h2 class="text-2xl font-semibold tracking-tight">Free tools, no upload required</h2>
        <p class="mt-2 max-w-[55ch] text-muted-foreground">
          Merging, splitting and rotating all run inside your browser. Your file
          never leaves your device — which is faster than uploading it anyway.
        </p>
        <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ToolCard href="/tools#merge" icon={<Merge class="size-5" />} name="Merge" body="Combine PDFs in any order" />
          <ToolCard href="/tools#split" icon={<Scissors class="size-5" />} name="Split" body="Pull out a page range" />
          <ToolCard href="/tools#rotate" icon={<RotateCw class="size-5" />} name="Rotate" body="Fix sideways scans" />
          <ToolCard href="/tools#compress" icon={<Shrink class="size-5" />} name="Compress" body="Shrink for email" />
        </div>
      </section>
    </Layout>,
  ),
);

const Step = ({ icon, title, body }: { icon: unknown; title: string; body: string }) => (
  <div class="px-0 py-4 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0">
    <div class="mb-3 flex size-10 items-center justify-center rounded-lg bg-accent">{icon as never}</div>
    <h3 class="font-medium">{title}</h3>
    <p class="mt-1.5 text-sm text-muted-foreground">{body}</p>
  </div>
);

const ToolCard = ({ href, icon, name, body }: { href: string; icon: unknown; name: string; body: string }) => (
  <a href={href} class="card gap-1 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50">
    <span class="text-muted-foreground">{icon as never}</span>
    <span class="mt-2 font-medium">{name}</span>
    <span class="text-sm text-muted-foreground">{body}</span>
  </a>
);

/* -------------------------------------------------------------------------- */
/*  Upload                                                                     */
/* -------------------------------------------------------------------------- */

pages.get("/new", (c) =>
  c.html(
    <Layout title="Share a PDF — pdf.sy" user={c.get("user")} script="/assets/upload.js">
      <section class="mx-auto w-full max-w-2xl px-5 py-16">
        <h1 class="text-3xl font-semibold tracking-tight">Share a PDF</h1>
        <p class="mt-2 text-muted-foreground">
          Drop a file in. You will get a link and a QR code straight away.
        </p>
        {c.get("user") ? (
          <p class="mt-4 rounded-lg border border-border bg-accent px-4 py-3 text-sm text-accent-foreground">
            Signed in — this link is yours and will not expire.
          </p>
        ) : (
          <p class="mt-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
            Sharing without an account is a scratchpad: the link works for{" "}
            {c.env.ANON_LINK_TTL_DAYS ?? "7"} days and then stops.{" "}
            <a href="/login" class="font-medium text-foreground underline">Sign in</a>{" "}
            and it is yours permanently — free, and it keeps every link you have
            already made on this device.
          </p>
        )}

        <form id="upload-form" class="mt-8">
          <label
            id="dropzone"
            for="file"
            class="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-input bg-card px-6 py-14 text-center transition-colors hover:border-primary hover:bg-accent/40"
          >
            <span class="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Upload class="size-5" />
            </span>
            <span class="font-medium">Choose a PDF or drop it here</span>
            <span id="hint" class="text-sm text-muted-foreground">
              Up to {c.env.MAX_UPLOAD_MB ?? "25"} MB
            </span>
            <input id="file" name="file" type="file" accept="application/pdf" class="sr-only" />
          </label>

          <div id="progress" class="mt-6 hidden">
            <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div id="bar" class="h-full w-0 rounded-full bg-primary transition-[width] duration-200"></div>
            </div>
            <p id="progress-label" class="mt-2 text-sm text-muted-foreground">Uploading…</p>
          </div>

          <p id="error" class="mt-4 hidden text-sm text-destructive"></p>
        </form>

        <div id="result" class="mt-8 hidden">
          <div class="card rounded-xl border border-border bg-card p-5">
            <header class="mb-4">
              <h2 class="card-title text-lg font-semibold">Your link is live</h2>
              <p class="text-sm text-muted-foreground">Anyone with this link can open the document.</p>
            </header>
            <div class="flex gap-2">
              <input id="share-url" class="input font-mono text-sm" readonly />
              <button type="button" id="copy" class="btn" data-variant="outline">
                <Copy /> Copy
              </button>
            </div>
            <div class="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
              <img id="qr" alt="QR code for this link" width="132" height="132" class="rounded-lg border border-border bg-white p-2" />
              <div class="flex flex-col gap-2 text-sm">
                <a id="open-link" class="btn" data-variant="outline" data-size="sm" target="_blank" rel="noopener">
                  Open the viewer
                </a>
                <a id="stats-link" class="btn" data-variant="ghost" data-size="sm">
                  <BarChart /> See who opens it
                </a>
                <a id="qr-download" class="btn" data-variant="ghost" data-size="sm" download="pdfsy-qr.svg">
                  Download QR as SVG
                </a>
              </div>
            </div>
          </div>
          <p class="mt-4 text-sm text-muted-foreground">
            Keep this tab's link to your stats page — it is the only way back in until accounts arrive.
          </p>
        </div>
      </section>
    </Layout>,
  ),
);

/* -------------------------------------------------------------------------- */
/*  Tools                                                                      */
/* -------------------------------------------------------------------------- */

pages.get("/tools", (c) =>
  c.html(
    <Layout
      user={c.get("user")}
      title="Free PDF tools — merge, split, rotate, compress | pdf.sy"
      description="Merge, split, rotate and compress PDFs in your browser. Nothing is uploaded."
      script="/assets/tools.js"
    >
      <section class="mx-auto w-full max-w-3xl px-5 py-16">
        <h1 class="text-3xl font-semibold tracking-tight">PDF tools</h1>
        <p class="mt-2 max-w-[55ch] text-muted-foreground">
          Everything here runs inside your browser. Your files are never uploaded,
          which is why it is instant even for a 40&nbsp;MB scan.
        </p>

        <nav class="mt-8 flex gap-1 border-b border-border" role="tablist" id="tool-tabs">
          <button
            class="btn rounded-b-none border-b-2 border-transparent aria-selected:border-b-primary aria-selected:text-foreground"
            data-variant="ghost"
            data-size="sm"
            data-tool="merge"
            role="tab"
            aria-selected="true"
          >Merge</button>
          <button
            class="btn rounded-b-none border-b-2 border-transparent aria-selected:border-b-primary aria-selected:text-foreground"
            data-variant="ghost"
            data-size="sm"
            data-tool="split"
            role="tab"
            aria-selected="false"
          >Split</button>
          <button
            class="btn rounded-b-none border-b-2 border-transparent aria-selected:border-b-primary aria-selected:text-foreground"
            data-variant="ghost"
            data-size="sm"
            data-tool="rotate"
            role="tab"
            aria-selected="false"
          >Rotate</button>
        </nav>

        <div class="mt-6" id="tool-panels">
          <ToolPanel id="merge" title="Merge PDFs" body="Add two or more files. They are joined top to bottom in the order listed.">
            <input type="file" id="merge-files" accept="application/pdf" multiple class="input" />
            <ol id="merge-list" class="mt-3 flex flex-col gap-1 text-sm text-muted-foreground"></ol>
          </ToolPanel>

          <ToolPanel id="split" title="Split a PDF" body="Keep a page range and drop the rest. Pages are numbered from 1." hidden>
            <input type="file" id="split-file" accept="application/pdf" class="input" />
            <div class="mt-3 flex gap-2">
              <input id="split-from" class="input tnum" type="number" min="1" value="1" placeholder="From" />
              <input id="split-to" class="input tnum" type="number" min="1" placeholder="To" />
            </div>
          </ToolPanel>

          <ToolPanel id="rotate" title="Rotate pages" body="Turn every page a quarter turn at a time. Useful for scans that came in sideways." hidden>
            <input type="file" id="rotate-file" accept="application/pdf" class="input" />
            <div class="mt-3">
              <select id="rotate-angle" class="select">
                <option value="90">90° clockwise</option>
                <option value="180">180°</option>
                <option value="270">90° counter-clockwise</option>
              </select>
            </div>
          </ToolPanel>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-3">
          <button id="run" class="btn">Run</button>
          <a id="download" class="btn hidden" data-variant="outline" download="pdfsy-output.pdf">Download result</a>
          <button id="share-result" class="btn hidden" data-variant="ghost">Share it as a tracked link →</button>
        </div>
        <p id="tool-status" class="mt-3 text-sm text-muted-foreground"></p>
      </section>
    </Layout>,
  ),
);

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
  const slug = c.req.param("slug");
  const token = c.req.query("t") ?? "";

  // Two ways in: the account that owns it, or the token handed out at upload.
  const user = c.get("user");
  const row = await loadOwnedLink(c.env.DB, slug, user?.id ?? null, token || null);

  if (!row) {
    return c.html(
      <Layout title="Stats — pdf.sy" user={user}>
        <section class="mx-auto w-full max-w-lg px-5 py-24 text-center">
          <h1 class="text-2xl font-semibold tracking-tight">This stats page is private</h1>
          <p class="mt-2 text-muted-foreground">
            Sign in with the account that owns this link, or open it from the tab
            where you created it.
          </p>
          <a href="/login" class="btn mt-6">Sign in</a>
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
  const totalMs = sessions.results.reduce((a, s) => a + s.total_ms, 0);
  const peak = Math.max(1, ...stats.results.map((p) => p.total_ms));

  return c.html(
    <Layout title={`${row.name ?? row.title} — stats`} user={user}>
      <section class="mx-auto w-full max-w-3xl px-5 py-12">
        <a href={user ? "/dashboard" : "/new"} class="text-sm text-muted-foreground hover:text-foreground">
          ← {user ? "All your links" : "Share another"}
        </a>
        <h1 class="mt-3 text-2xl font-semibold tracking-tight">{row.name ?? row.title}</h1>
        <p class="mt-1 font-mono text-sm text-muted-foreground">{new URL(`/${slug}`, siteUrl(c)).toString()}</p>

        <div class="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat label="Views" value={String(views)} />
          <Stat label="Total time" value={formatMs(totalMs)} />
          <Stat label="Avg. per view" value={views ? formatMs(Math.round(totalMs / views)) : "—"} />
        </div>

        <h2 class="mt-10 font-semibold">Time spent per page</h2>
        {!can({ plan: row.owner_plan }, "page_analytics") ? (
          <div class="mt-3 rounded-lg border border-dashed border-input px-5 py-8 text-center">
            <p class="text-sm text-muted-foreground">
              Per-page reading time is a Pro feature. You can still see totals above.
            </p>
            <a href="/pricing" class="btn mt-4" data-size="sm">See plans</a>
          </div>
        ) : stats.results.length === 0 ? (
          <p class="mt-2 text-sm text-muted-foreground">No page data yet. It appears the moment someone opens the link.</p>
        ) : (
          <ul class="mt-3 flex flex-col gap-1.5">
            {stats.results.map((p) => (
              <li class="flex items-center gap-3 text-sm">
                <span class="tnum w-14 shrink-0 text-muted-foreground">Page {p.page}</span>
                <span class="h-6 flex-1 overflow-hidden rounded bg-muted">
                  <span
                    class="block h-full rounded bg-primary"
                    style={`width:${Math.round((p.total_ms / peak) * 100)}%`}
                  ></span>
                </span>
                <span class="tnum w-16 shrink-0 text-right text-muted-foreground">{formatMs(p.total_ms)}</span>
              </li>
            ))}
          </ul>
        )}

        <h2 class="mt-10 font-semibold">Recent views</h2>
        <div class="mt-3 overflow-x-auto rounded-lg border border-border">
          <table class="table w-full text-sm">
            <thead>
              <tr>
                <th class="px-3 py-2 text-left font-medium">When</th>
                <th class="px-3 py-2 text-left font-medium">Where</th>
                <th class="px-3 py-2 text-left font-medium">Time</th>
                <th class="px-3 py-2 text-left font-medium">Reached</th>
              </tr>
            </thead>
            <tbody>
              {sessions.results.length === 0 && (
                <tr><td colspan={4} class="px-3 py-6 text-center text-muted-foreground">Nobody has opened it yet.</td></tr>
              )}
              {sessions.results.map((s) => (
                <tr>
                  <td class="px-3 py-2 tnum">{new Date(s.started_at).toLocaleString()}</td>
                  <td class="px-3 py-2">{s.country ?? "—"}</td>
                  <td class="px-3 py-2 tnum">{formatMs(s.total_ms)}</td>
                  <td class="px-3 py-2 tnum">page {s.max_page || 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <LinkSettings
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

