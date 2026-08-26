// The admin console.
//
// Eight pages, all server-rendered, all read-only. Everything that *changes*
// something lives in routes/admin-actions.ts — the split is deliberate: it
// means this file can be read without wondering whether any of it has side
// effects, and the file that does have side effects is short enough to audit in
// one sitting.
//
// The whole tree is behind `requireAdmin`, applied once below. See lib/admin.ts
// for why access is an env var rather than a database column, and why the
// refusal is a 404.
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../lib/context";
import { currentAdmin, requireAdmin } from "../lib/admin";
import * as q from "../lib/admin-queries";
import { AdminShell, type NavKey } from "../components/admin/shell";
import {
  BarList, DayChart, DocStatus, Empty, Panel, Pill, RangePicker, Stat, StatGrid,
  TableWrap, Td, Th, formatAgo, formatBytes, formatDuration, formatMoney,
  formatNumber, formatWhen,
} from "../components/admin/ui";
import { Search } from "../components/icons";
import { siteUrl } from "../lib/urls";

export const admin = new Hono<Env>();

admin.use("/admin", requireAdmin);
admin.use("/admin/*", requireAdmin);

/* -------------------------------------------------------------------------- */
/*  Shared page setup                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What every page needs before it can render its own content: who is looking,
 * and what is waiting for them. The moderation badge is the only count in the
 * sidebar because it is the only one that means "somebody is waiting on you" —
 * a number of users or documents is information, not a task.
 */
async function frame(c: Context<Env>) {
  const admin = currentAdmin(c)!;
  const open = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM abuse_reports WHERE status = 'open'`,
  ).first<{ n: number }>();

  return {
    adminEmail: admin.email,
    badges: { moderation: Number(open?.n ?? 0) || undefined } as Partial<Record<NavKey, number>>,
  };
}

/** `?range=` if it is one of ours, 30 days if it is anything else. */
const rangeOf = (c: { req: { query: (k: string) => string | undefined } }): q.Range => {
  const value = c.req.query("range");
  return q.isRange(value) ? value : "30d";
};

/* -------------------------------------------------------------------------- */
/*  Overview                                                                   */
/* -------------------------------------------------------------------------- */

admin.get("/admin", async (c) => {
  const range = rangeOf(c);
  const { current, previous } = q.windows(range);
  const { adminEmail, badges } = await frame(c);

  const [now_, then, viewSeries, uploadSeries, top, depth, feed] = await Promise.all([
    q.totals(c.env.DB, current),
    q.totals(c.env.DB, previous),
    q.dailySeries(c.env.DB, "view_sessions", "started_at", current),
    q.dailySeries(c.env.DB, "documents", "created_at", current),
    q.topLinks(c.env.DB, current, 8),
    q.readDepth(c.env.DB, current),
    q.recentViews(c.env.DB, 10),
  ]);

  const avgRead = now_.views ? now_.readMs / now_.views : 0;
  const prevAvgRead = then.views ? then.readMs / then.views : 0;
  const depthTotal = depth.reduce((sum, d) => sum + d.sessions, 0);
  const finished = depth.find((d) => d.bucket === "Finished")?.sessions ?? 0;

  return c.html(
    <AdminShell
      title="Overview"
      active="overview"
      adminEmail={adminEmail}
      badges={badges}
      toolbar={<RangePicker path="/admin" active={range} />}
    >
      <StatGrid>
        <Stat
          label="Views" value={formatNumber(now_.views)}
          delta={q.change(now_.views, then.views)} series={viewSeries}
        />
        <Stat
          label="Viewers" value={formatNumber(now_.viewers)}
          delta={q.change(now_.viewers, then.viewers)}
          hint="Unique per day, summed"
        />
        <Stat
          label="Avg. read time" value={formatDuration(avgRead)}
          delta={q.change(avgRead, prevAvgRead)}
        />
        <Stat
          label="Read to the end"
          value={depthTotal ? `${Math.round((finished / depthTotal) * 100)}%` : "—"}
          hint={`of ${formatNumber(depthTotal)} sessions`}
        />
      </StatGrid>

      <div class="mt-3">
        <StatGrid>
          <Stat
            label="Uploads" value={formatNumber(now_.uploads)}
            delta={q.change(now_.uploads, then.uploads)} series={uploadSeries}
            href="/admin/documents"
          />
          <Stat
            label="Links created" value={formatNumber(now_.links)}
            delta={q.change(now_.links, then.links)}
          />
          <Stat
            label="Signups" value={formatNumber(now_.signups)}
            delta={q.change(now_.signups, then.signups)} href="/admin/accounts"
          />
          <Stat
            label="Downloads" value={formatNumber(now_.downloads)}
            delta={q.change(now_.downloads, then.downloads)}
          />
        </StatGrid>
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <DayChart series={viewSeries} label={`Views · last ${current.days} days`} />
        </div>

        <Panel title="How far people read" note={`${formatNumber(depthTotal)} sessions on documents with a known page count`}>
          <BarList
            rows={depth.map((d) => ({
              key: d.bucket,
              value: d.sessions,
              note: depthTotal ? `${Math.round((d.sessions / depthTotal) * 100)}%` : undefined,
            }))}
            empty="No sessions with page counts yet."
          />
        </Panel>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Busiest links"
          action={<a href="/admin/engagement" class="text-xs text-muted-foreground hover:underline">Engagement →</a>}
        >
          {top.length === 0 ? (
            <p class="py-6 text-center text-sm text-muted-foreground">No views in this window.</p>
          ) : (
            <TableWrap narrow>
              <thead>
                <tr class="border-b border-border">
                  <Th>Document</Th><Th align="end">Views</Th>
                  <Th align="end">Viewers</Th><Th align="end">Read</Th>
                </tr>
              </thead>
              <tbody>
                {top.map((row) => (
                  <tr class="border-b border-border/60 last:border-0">
                    <Td wrap>
                      <a href={`/${row.slug}`} class="font-medium hover:underline" target="_blank" rel="noreferrer">
                        {row.title}
                      </a>
                      <span class="ms-2 font-mono text-xs text-muted-foreground">/{row.slug}</span>
                    </Td>
                    <Td align="end">{formatNumber(row.views)}</Td>
                    <Td align="end">{formatNumber(row.viewers)}</Td>
                    <Td align="end">{formatDuration(row.read_ms)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Panel>

        <Panel title="Latest opens" note="Refreshes every 20 seconds">
          <ul class="flex flex-col divide-y divide-border/60" data-feed>
            {feed.length === 0 ? (
              <li class="py-6 text-center text-sm text-muted-foreground">Nothing yet.</li>
            ) : feed.map((row) => (
              <li class="flex items-center gap-3 py-2 text-sm">
                <span class="min-w-0 flex-1 truncate">{row.title}</span>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {row.country ?? "—"} · {row.device ?? "—"}
                </span>
                <span class="w-16 shrink-0 text-end text-xs text-muted-foreground tnum">
                  {formatAgo(row.started_at)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AdminShell>,
  );
});

/* -------------------------------------------------------------------------- */
/*  Documents                                                                  */
/* -------------------------------------------------------------------------- */

const DOC_FILTERS = [
  { key: "", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "blocked", label: "Blocked" },
  { key: "processing", label: "Processing" },
  { key: "deleted", label: "Deleted" },
] as const;

admin.get("/admin/documents", async (c) => {
  const { adminEmail, badges } = await frame(c);
  const search = (c.req.query("q") ?? "").trim().slice(0, 100);
  const status = c.req.query("status") as q.DocumentFilter["status"] | undefined;
  const page = Math.max(Number(c.req.query("page") ?? 0) || 0, 0);
  const perPage = 50;

  const [rows, counts] = await Promise.all([
    q.documentList(c.env.DB, {
      q: search || undefined,
      status: DOC_FILTERS.some((f) => f.key === status) ? status : undefined,
      limit: perPage,
      offset: page * perPage,
    }),
    q.documentCounts(c.env.DB),
  ]);

  const qs = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    for (const [k, v] of Object.entries(overrides)) v ? params.set(k, v) : params.delete(k);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return c.html(
    <AdminShell title="Documents" active="documents" adminEmail={adminEmail} badges={badges}>
      <StatGrid>
        <Stat label="Documents" value={formatNumber(counts.total)} />
        <Stat label="Stored" value={formatBytes(counts.bytes)} hint="Sum of every version" />
        <Stat label="Anonymous" value={formatNumber(counts.anonymous)} hint="No account attached" />
        <Stat label="Blocked" value={formatNumber(counts.blocked)} href="/admin/moderation" />
      </StatGrid>

      <div class="mt-6 flex flex-wrap items-center gap-2">
        {/* A GET form, so the search lands in the URL and the page is a link
            you can send someone. No JavaScript involved at all. */}
        <form method="get" action="/admin/documents" class="flex items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <label class="relative">
            <span class="sr-only">Search documents</span>
            <Search class="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search" name="q" value={search} autocomplete="off"
              placeholder="Title, owner email, or slug"
              class="input h-9 w-64 ps-8 text-sm"
            />
          </label>
          <button type="submit" class="btn" data-size="sm" data-variant="outline">Search</button>
        </form>

        <div class="ms-auto inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
          {DOC_FILTERS.map((filter) => {
            const active = (status ?? "") === filter.key;
            const href = `/admin/documents${qs({ status: filter.key, page: "" })}`;
            return (
              <a
                href={href}
                aria-current={active ? "true" : undefined}
                class={
                  "rounded px-2.5 py-1 font-medium transition-colors " +
                  (active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                {filter.label}
              </a>
            );
          })}
        </div>
      </div>

      <div class="mt-3 rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <Empty>
            {search ? <>Nothing matches “{search}”.</> : <>No documents in this view.</>}
          </Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr class="border-b border-border">
                <Th>Document</Th><Th>Owner</Th><Th>Status</Th>
                <Th align="end">Links</Th><Th align="end">Views</Th>
                <Th align="end">Size</Th><Th align="end">Pages</Th>
                <Th align="end">Last opened</Th><Th align="end">Uploaded</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr class="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <Td wrap>
                    <a href={`/admin/documents/${row.id}`} class="font-medium hover:underline">
                      {row.title}
                    </a>
                  </Td>
                  <Td>
                    {row.owner_email ? (
                      <a href={`/admin/accounts/${row.owner_id}`} class="text-muted-foreground hover:underline">
                        {row.owner_email}
                      </a>
                    ) : (
                      <span class="text-muted-foreground">anonymous</span>
                    )}
                  </Td>
                  <Td><DocStatus status={row.status} deletedAt={row.deleted_at} /></Td>
                  <Td align="end">{formatNumber(row.links)}</Td>
                  <Td align="end">{formatNumber(row.views)}</Td>
                  <Td align="end">{formatBytes(row.bytes)}</Td>
                  <Td align="end">{row.pages ?? "—"}</Td>
                  <Td align="end"><span class="text-muted-foreground">{formatAgo(row.last_view)}</span></Td>
                  <Td align="end"><span class="text-muted-foreground">{formatWhen(row.created_at)}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      <nav class="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {rows.length ? `${page * perPage + 1}–${page * perPage + rows.length}` : "0"} of{" "}
          {formatNumber(counts.total)}
        </span>
        <span class="flex gap-2">
          {page > 0 && (
            <a class="btn" data-size="sm" data-variant="outline"
               href={`/admin/documents${qs({ page: String(page - 1) })}`}>← Previous</a>
          )}
          {rows.length === perPage && (
            <a class="btn" data-size="sm" data-variant="outline"
               href={`/admin/documents${qs({ page: String(page + 1) })}`}>Next →</a>
          )}
        </span>
      </nav>
    </AdminShell>,
  );
});

/* -------------------------------------------------------------------------- */
/*  One document                                                               */
/* -------------------------------------------------------------------------- */

admin.get("/admin/documents/:id", async (c) => {
  const { adminEmail, badges } = await frame(c);
  const detail = await q.documentDetail(c.env.DB, c.req.param("id"));
  if (!detail) return c.notFound();

  const { doc, versions, links, pages } = detail;
  const origin = siteUrl(c);
  const maxPageViews = Math.max(...pages.map((p) => p.views), 1);

  return c.html(
    <AdminShell title={doc.title} active="documents" adminEmail={adminEmail} badges={badges}>
      <a href="/admin/documents" class="text-xs text-muted-foreground hover:underline">← Documents</a>

      <div class="mt-2 flex flex-wrap items-start gap-3">
        <div class="min-w-0">
          <h2 class="text-xl font-semibold tracking-tight">{doc.title}</h2>
          <p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <DocStatus status={doc.status} deletedAt={doc.deleted_at} />
            <span>{doc.owner_email ?? "anonymous"}</span>
            <span>·</span>
            <span>uploaded {formatWhen(doc.created_at)}</span>
          </p>
          {doc.blocked_reason && (
            <p class="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              <strong class="font-medium">Blocked:</strong> {doc.blocked_reason}
            </p>
          )}
        </div>

        <div class="ms-auto flex gap-2">
          {doc.status === "blocked" ? (
            <form method="post" action={`/admin/documents/${doc.id}/unblock`}>
              <button class="btn" data-variant="outline" data-size="sm">Unblock</button>
            </form>
          ) : (
            <form method="post" action={`/admin/documents/${doc.id}/block`} class="flex gap-2">
              <input
                name="reason" placeholder="Reason" required maxlength={200}
                class="input h-8 w-44 text-sm"
              />
              <button class="btn" data-variant="outline" data-size="sm">Block</button>
            </form>
          )}
          {!doc.deleted_at && (
            <form
              method="post" action={`/admin/documents/${doc.id}/delete`}
              data-confirm="Soft-delete this document? The link stops working immediately and the file is purged on the next nightly sweep."
            >
              <button class="btn bg-destructive text-white hover:bg-destructive/90" data-size="sm">
                Delete
              </button>
            </form>
          )}
        </div>
      </div>

      <div class="mt-6">
        <StatGrid>
          <Stat label="Views" value={formatNumber(doc.views)} />
          <Stat label="Links" value={formatNumber(links.length)} />
          <Stat label="Versions" value={formatNumber(versions.length)} />
          <Stat label="Stored" value={formatBytes(doc.bytes)} />
        </StatGrid>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Links">
          <TableWrap narrow>
            <thead>
              <tr class="border-b border-border">
                <Th>Slug</Th><Th>State</Th><Th align="end">Views</Th>
                <Th align="end">Read</Th><Th align="end">Created</Th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr class="border-b border-border/60 last:border-0">
                  <Td>
                    <a href={`${origin}/${link.slug}`} target="_blank" rel="noreferrer"
                       class="font-mono text-xs hover:underline">/{link.slug}</a>
                    {link.name && <span class="ms-2 text-xs text-muted-foreground">{link.name}</span>}
                  </Td>
                  <Td>
                    <span class="flex flex-wrap gap-1">
                      {link.revoked_at ? <Pill tone="bad">Revoked</Pill> : null}
                      {link.expires_at && link.expires_at < Date.now() ? <Pill tone="warn">Expired</Pill> : null}
                      {link.password_hash ? <Pill>Password</Pill> : null}
                      {!link.allow_download ? <Pill>No download</Pill> : null}
                      {!link.revoked_at && (!link.expires_at || link.expires_at > Date.now())
                        ? <Pill tone="good">Live</Pill> : null}
                    </span>
                  </Td>
                  <Td align="end">{formatNumber(link.views)}</Td>
                  <Td align="end">{formatDuration(link.read_ms)}</Td>
                  <Td align="end"><span class="text-muted-foreground">{formatWhen(link.created_at)}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Panel>

        <Panel title="Attention by page" note="Summed across every link on this document">
          {pages.length === 0 ? (
            <p class="py-6 text-center text-sm text-muted-foreground">No page data yet.</p>
          ) : (
            <ul class="flex flex-col gap-1">
              {pages.map((p) => (
                <li class="flex items-center gap-3 text-sm">
                  <span class="w-10 shrink-0 text-xs text-muted-foreground tnum">p{p.page}</span>
                  <span class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      class="block h-full rounded-full bg-primary"
                      style={`width:${Math.max((p.views / maxPageViews) * 100, 2)}%`}
                    ></span>
                  </span>
                  <span class="w-14 shrink-0 text-end text-xs text-muted-foreground tnum">
                    {formatDuration(p.total_ms / Math.max(p.views, 1))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div class="mt-4">
        <Panel title="Versions" note="The sha256 is what a hash block acts on">
          <TableWrap>
            <thead>
              <tr class="border-b border-border">
                <Th>Version</Th><Th>Label</Th><Th align="end">Pages</Th>
                <Th align="end">Size</Th><Th>sha256</Th><Th align="end">Created</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr class="border-b border-border/60 last:border-0">
                  <Td>v{v.version}</Td>
                  <Td>{v.label ?? <span class="text-muted-foreground">—</span>}</Td>
                  <Td align="end">{v.page_count ?? "—"}</Td>
                  <Td align="end">{formatBytes(v.size_bytes)}</Td>
                  <Td mono><span class="text-muted-foreground">{v.sha256.slice(0, 16)}…</span></Td>
                  <Td align="end"><span class="text-muted-foreground">{formatWhen(v.created_at)}</span></Td>
                  <Td align="end">
                    <form
                      method="post" action="/admin/moderation/block-hash"
                      data-confirm="Block this file hash? Any future upload of these exact bytes is refused."
                    >
                      <input type="hidden" name="sha256" value={v.sha256} />
                      <input type="hidden" name="label" value={doc.title} />
                      <button class="btn" data-variant="ghost" data-size="sm">Block hash</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Panel>
      </div>
    </AdminShell>,
  );
});

/* -------------------------------------------------------------------------- */
/*  Engagement                                                                 */
/* -------------------------------------------------------------------------- */

admin.get("/admin/engagement", async (c) => {
  const range = rangeOf(c);
  const { current, previous } = q.windows(range);
  const { adminEmail, badges } = await frame(c);

  const [now_, then, countries, devices, referrers, depth, hours, top] = await Promise.all([
    q.totals(c.env.DB, current),
    q.totals(c.env.DB, previous),
    q.breakdown(c.env.DB, "country", current),
    q.breakdown(c.env.DB, "device", current),
    q.breakdown(c.env.DB, "referrer", current),
    q.readDepth(c.env.DB, current),
    q.viewsByHour(c.env.DB, current),
    q.topLinks(c.env.DB, current, 15),
  ]);

  const depthTotal = depth.reduce((sum, d) => sum + d.sessions, 0);
  const busiestHour = hours.reduce((best, h) => (h.value > best.value ? h : best), hours[0]);

  return c.html(
    <AdminShell
      title="Engagement" active="engagement" adminEmail={adminEmail} badges={badges}
      toolbar={<RangePicker path="/admin/engagement" active={range} />}
    >
      <StatGrid>
        <Stat label="Views" value={formatNumber(now_.views)} delta={q.change(now_.views, then.views)} />
        <Stat label="Viewers" value={formatNumber(now_.viewers)} delta={q.change(now_.viewers, then.viewers)} />
        <Stat
          label="Total read time" value={formatDuration(now_.readMs)}
          delta={q.change(now_.readMs, then.readMs)}
        />
        <Stat
          label="Download rate"
          value={now_.views ? `${Math.round((now_.downloads / now_.views) * 100)}%` : "—"}
          hint={`${formatNumber(now_.downloads)} downloads`}
        />
      </StatGrid>

      <div class="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Read depth"
          note="Sessions bucketed by how far into the document they got"
        >
          <BarList
            rows={depth.map((d) => ({
              key: d.bucket, value: d.sessions,
              note: depthTotal ? `${Math.round((d.sessions / depthTotal) * 100)}%` : undefined,
            }))}
            empty="No sessions with a known page count."
          />
        </Panel>

        <Panel title="Countries">
          <BarList rows={countries.map((r) => ({ key: r.key, value: r.views }))} />
        </Panel>

        <Panel title="Devices">
          <BarList rows={devices.map((r) => ({ key: r.key, value: r.views }))} />
        </Panel>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <Panel
            title="When people read"
            note={`Views by hour, UTC. Busiest: ${String(busiestHour?.day ?? 0).padStart(2, "0")}:00`}
          >
            <div class="flex items-end gap-1" style="height:120px">
              {hours.map((h) => {
                const max = Math.max(...hours.map((x) => x.value), 1);
                return (
                  <div class="flex flex-1 flex-col items-center gap-1">
                    <div
                      class="w-full rounded-t-[2px] bg-primary/30"
                      style={`height:${Math.max((h.value / max) * 100, h.value ? 3 : 1)}%`}
                      title={`${String(h.day).padStart(2, "0")}:00 — ${formatNumber(h.value)} views`}
                    ></div>
                    {h.day % 6 === 0 && (
                      <span class="text-[10px] text-muted-foreground tnum">{h.day}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <Panel title="Referrers" note="Rolled up to the hostname">
          <BarList rows={referrers.map((r) => ({ key: r.key, value: r.views }))} />
        </Panel>
      </div>

      <div class="mt-4">
        <Panel title="Busiest links" note={`Top 15 in the last ${current.days} days`}>
          {top.length === 0 ? (
            <p class="py-6 text-center text-sm text-muted-foreground">No views in this window.</p>
          ) : (
            <TableWrap>
              <thead>
                <tr class="border-b border-border">
                  <Th>Document</Th><Th>Link</Th><Th align="end">Views</Th>
                  <Th align="end">Viewers</Th><Th align="end">Read time</Th>
                  <Th align="end">Avg. session</Th><Th align="end">Downloads</Th>
                </tr>
              </thead>
              <tbody>
                {top.map((row) => (
                  <tr class="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <Td wrap>{row.title}</Td>
                    <Td>
                      <a href={`/${row.slug}`} target="_blank" rel="noreferrer"
                         class="font-mono text-xs text-muted-foreground hover:underline">
                        /{row.slug}
                      </a>
                      {row.name && <span class="ms-2 text-xs text-muted-foreground">{row.name}</span>}
                    </Td>
                    <Td align="end">{formatNumber(row.views)}</Td>
                    <Td align="end">{formatNumber(row.viewers)}</Td>
                    <Td align="end">{formatDuration(row.read_ms)}</Td>
                    <Td align="end">{formatDuration(row.read_ms / Math.max(row.views, 1))}</Td>
                    <Td align="end">{formatNumber(row.downloads)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Panel>
      </div>
    </AdminShell>,
  );
});

/* -------------------------------------------------------------------------- */
/*  Accounts                                                                   */
/* -------------------------------------------------------------------------- */

admin.get("/admin/accounts", async (c) => {
  const { adminEmail, badges } = await frame(c);
  const search = (c.req.query("q") ?? "").trim().slice(0, 100);
  const plan = c.req.query("plan") ?? "";

  const [rows, counts] = await Promise.all([
    q.userList(c.env.DB, { q: search || undefined, plan: plan || undefined, limit: 100 }),
    q.userCounts(c.env.DB),
  ]);

  return c.html(
    <AdminShell title="Accounts" active="accounts" adminEmail={adminEmail} badges={badges}>
      <StatGrid>
        <Stat label="Accounts" value={formatNumber(counts.total)} />
        <Stat label="New (30d)" value={formatNumber(counts.new_30d)} />
        <Stat
          label="Paying" value={formatNumber(counts.paid)}
          hint={counts.total ? `${((counts.paid / counts.total) * 100).toFixed(1)}% of accounts` : undefined}
          href="/admin/revenue"
        />
        <Stat
          label="Never uploaded" value={formatNumber(counts.never_uploaded)}
          hint="Signed up, did nothing"
        />
      </StatGrid>

      <div class="mt-6 flex flex-wrap items-center gap-2">
        <form method="get" action="/admin/accounts" class="flex items-center gap-2">
          <label class="relative">
            <span class="sr-only">Search accounts</span>
            <Search class="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search" name="q" value={search} autocomplete="off" placeholder="Email"
              class="input h-9 w-64 ps-8 text-sm"
            />
          </label>
          <button type="submit" class="btn" data-size="sm" data-variant="outline">Search</button>
        </form>

        <div class="ms-auto inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
          {[
            { key: "", label: "All" }, { key: "free", label: "Free" },
            { key: "paid", label: "Paying" }, { key: "lite", label: "Lite" },
            { key: "pro", label: "Pro" },
          ].map((f) => (
            <a
              href={`/admin/accounts${f.key ? `?plan=${f.key}` : ""}`}
              aria-current={plan === f.key ? "true" : undefined}
              class={
                "rounded px-2.5 py-1 font-medium transition-colors " +
                (plan === f.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              {f.label}
            </a>
          ))}
        </div>
      </div>

      <div class="mt-3 rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <Empty>No accounts match.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr class="border-b border-border">
                <Th>Email</Th><Th>Plan</Th><Th align="end">Documents</Th>
                <Th align="end">Links</Th><Th align="end">Views</Th>
                <Th align="end">Storage</Th><Th align="end">Last seen</Th><Th align="end">Joined</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr class="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <Td wrap>
                    <a href={`/admin/accounts/${row.id}`} class="font-medium hover:underline">{row.email}</a>
                  </Td>
                  <Td><PlanPill plan={row.plan} status={row.plan_status} /></Td>
                  <Td align="end">{formatNumber(row.documents)}</Td>
                  <Td align="end">{formatNumber(row.links)}</Td>
                  <Td align="end">{formatNumber(row.views)}</Td>
                  <Td align="end">{formatBytes(row.bytes)}</Td>
                  <Td align="end"><span class="text-muted-foreground">{formatAgo(row.last_seen_at)}</span></Td>
                  <Td align="end"><span class="text-muted-foreground">{formatWhen(row.created_at)}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>
    </AdminShell>,
  );
});

/**
 * Plan and billing state in one pill.
 *
 * They are two columns and one fact: "pro" with a past_due status is a Pro
 * customer whose card just bounced, and showing only the plan would hide the
 * half that needs acting on.
 */
const PlanPill = ({ plan, status }: { plan: string; status: string | null }) => {
  if (plan === "free") return <Pill>Free</Pill>;
  const label = plan === "lite" ? "Lite" : "Pro";
  if (status === "past_due") return <Pill tone="bad">{label} · past due</Pill>;
  if (status === "canceled") return <Pill tone="warn">{label} · canceling</Pill>;
  if (status === "trialing") return <Pill tone="warn">{label} · trial</Pill>;
  return <Pill tone="good">{label}</Pill>;
};

admin.get("/admin/accounts/:id", async (c) => {
  const { adminEmail, badges } = await frame(c);
  const id = c.req.param("id");

  // Spelled out rather than reusing userList(): that helper searches and pages
  // over everyone, and filtering a list of 100 down to the one row wanted here
  // would be both slower and quietly wrong the moment there are more than 100.
  const [user, docs] = await Promise.all([
    c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.plan, u.plan_status, u.plan_renews_at,
              u.stripe_customer_id, u.created_at, u.last_seen_at,
              (SELECT COUNT(*) FROM documents d WHERE d.owner_id = u.id AND d.deleted_at IS NULL) AS documents,
              (SELECT COUNT(*) FROM links l JOIN documents d ON d.id = l.document_id
                WHERE d.owner_id = u.id AND d.deleted_at IS NULL) AS links,
              (SELECT COUNT(*) FROM view_sessions vs JOIN links l ON l.slug = vs.slug
                 JOIN documents d ON d.id = l.document_id WHERE d.owner_id = u.id) AS views,
              (SELECT COALESCE(SUM(v.size_bytes), 0) FROM document_versions v
                 JOIN documents d ON d.id = v.document_id
                WHERE d.owner_id = u.id AND d.deleted_at IS NULL) AS bytes
         FROM users u WHERE u.id = ?`,
    ).bind(id).first<q.UserRow>(),
    q.documentList(c.env.DB, { owner: id, limit: 50 }),
  ]);

  if (!user) return c.notFound();

  return c.html(
    <AdminShell title={user.email} active="accounts" adminEmail={adminEmail} badges={badges}>
      <a href="/admin/accounts" class="text-xs text-muted-foreground hover:underline">← Accounts</a>

      <div class="mt-2 flex flex-wrap items-center gap-3">
        <div>
          <h2 class="text-xl font-semibold tracking-tight">{user.email}</h2>
          <p class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <PlanPill plan={user.plan} status={user.plan_status} />
            <span>joined {formatWhen(user.created_at)}</span>
            <span>·</span>
            <span>last seen {formatAgo(user.last_seen_at)}</span>
          </p>
        </div>
        {user.stripe_customer_id && (
          <a
            class="btn ms-auto" data-variant="outline" data-size="sm"
            href={`https://dashboard.stripe.com/customers/${user.stripe_customer_id}`}
            target="_blank" rel="noreferrer"
          >
            Stripe customer ↗
          </a>
        )}
      </div>

      <div class="mt-6">
        <StatGrid>
          <Stat label="Documents" value={formatNumber(user.documents)} />
          <Stat label="Links" value={formatNumber(user.links)} />
          <Stat label="Views received" value={formatNumber(user.views)} />
          <Stat label="Storage" value={formatBytes(user.bytes)} />
        </StatGrid>
      </div>

      {user.plan_renews_at && (
        <p class="mt-3 text-xs text-muted-foreground">
          Next renewal {formatWhen(user.plan_renews_at)}.
        </p>
      )}

      <div class="mt-4">
        <Panel title="Documents" note="Most recent first">
          {docs.length === 0 ? (
            <p class="py-6 text-center text-sm text-muted-foreground">Nothing uploaded.</p>
          ) : (
            <TableWrap>
              <thead>
                <tr class="border-b border-border">
                  <Th>Title</Th><Th>Status</Th><Th align="end">Links</Th>
                  <Th align="end">Views</Th><Th align="end">Size</Th><Th align="end">Uploaded</Th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr class="border-b border-border/60 last:border-0">
                    <Td wrap>
                      <a href={`/admin/documents/${d.id}`} class="hover:underline">{d.title}</a>
                    </Td>
                    <Td><DocStatus status={d.status} deletedAt={d.deleted_at} /></Td>
                    <Td align="end">{formatNumber(d.links)}</Td>
                    <Td align="end">{formatNumber(d.views)}</Td>
                    <Td align="end">{formatBytes(d.bytes)}</Td>
                    <Td align="end"><span class="text-muted-foreground">{formatWhen(d.created_at)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Panel>
      </div>
    </AdminShell>,
  );
});

/* -------------------------------------------------------------------------- */
/*  Revenue                                                                    */
/* -------------------------------------------------------------------------- */

admin.get("/admin/revenue", async (c) => {
  const { adminEmail, badges } = await frame(c);
  const [rev, paying, counts] = await Promise.all([
    q.revenue(c.env.DB),
    q.payingUsers(c.env.DB),
    q.userCounts(c.env.DB),
  ]);

  return c.html(
    <AdminShell title="Revenue" active="revenue" adminEmail={adminEmail} badges={badges}>
      <StatGrid>
        <Stat
          label="MRR" value={formatMoney(rev.mrr)}
          hint="At list price — see the note below"
        />
        <Stat
          label="Paying accounts" value={formatNumber(rev.lite + rev.pro)}
          hint={`${formatNumber(rev.lite)} Lite · ${formatNumber(rev.pro)} Pro`}
        />
        <Stat
          label="Conversion" value={`${rev.conversion.toFixed(1)}%`}
          hint={`of ${formatNumber(counts.total)} accounts`}
        />
        <Stat
          label="At risk" value={formatNumber(rev.pastDue + rev.canceled)}
          hint={`${formatNumber(rev.pastDue)} past due · ${formatNumber(rev.canceled)} canceling`}
        />
      </StatGrid>

      <div class="mt-3">
        <StatGrid>
          <Stat label="Renewing (30d)" value={formatNumber(rev.renewing30d)} />
          <Stat label="On trial" value={formatNumber(rev.trialing)} />
          <Stat
            label="New paid (30d)"
            value={rev.newPaid30d === null ? "—" : formatNumber(rev.newPaid30d)}
            hint={rev.newPaid30d === null ? "History starts after this deploy" : undefined}
          />
          <Stat
            label="Churned (30d)"
            value={rev.churned30d === null ? "—" : formatNumber(rev.churned30d)}
           
            hint={rev.churned30d === null ? "History starts after this deploy" : undefined}
          />
        </StatGrid>
      </div>

      {/* Said on the page, not buried in a comment. A number nobody has told
          you the shape of is a number somebody will eventually quote in a
          board deck. */}
      <p class="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <strong class="font-medium text-foreground">About these figures.</strong>{" "}
        MRR is calculated at monthly list price ({formatMoney(3)} Lite, {formatMoney(12)} Pro).
        The <code class="font-mono">users</code> table records which plan someone is on but not
        whether they pay monthly or yearly — only Stripe knows that — so a yearly customer is
        counted at the monthly rate and the real figure is lower. Treat this as an upper bound and
        Stripe as the source of truth.
        {rev.newPaid30d === null && (
          <> New-and-churned counts stay blank until <code class="font-mono">plan_changed_at</code>{" "}
          has been recording for thirty days.</>
        )}
      </p>

      <div class="mt-4">
        <Panel title="Paying accounts" note="Newest first">
          {paying.length === 0 ? (
            <Empty>Nobody is paying yet.</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr class="border-b border-border">
                  <Th>Email</Th><Th>Plan</Th><Th align="end">Documents</Th>
                  <Th align="end">Views</Th><Th align="end">Renews</Th>
                  <Th align="end">Joined</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {paying.map((row) => (
                  <tr class="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <Td wrap>
                      <a href={`/admin/accounts/${row.id}`} class="font-medium hover:underline">{row.email}</a>
                    </Td>
                    <Td><PlanPill plan={row.plan} status={row.plan_status} /></Td>
                    <Td align="end">{formatNumber(row.documents)}</Td>
                    <Td align="end">{formatNumber(row.views)}</Td>
                    <Td align="end"><span class="text-muted-foreground">{formatWhen(row.plan_renews_at)}</span></Td>
                    <Td align="end"><span class="text-muted-foreground">{formatWhen(row.created_at)}</span></Td>
                    <Td align="end">
                      {row.stripe_customer_id && (
                        <a
                          class="text-xs text-muted-foreground hover:underline"
                          href={`https://dashboard.stripe.com/customers/${row.stripe_customer_id}`}
                          target="_blank" rel="noreferrer"
                        >
                          Stripe ↗
                        </a>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Panel>
      </div>
    </AdminShell>,
  );
});

/* -------------------------------------------------------------------------- */
/*  Moderation                                                                 */
/* -------------------------------------------------------------------------- */

admin.get("/admin/moderation", async (c) => {
  const { adminEmail, badges } = await frame(c);
  const status = (c.req.query("status") as "open" | "resolved" | "all") ?? "open";

  const [queue, counts, lists] = await Promise.all([
    q.reports(c.env.DB, ["open", "resolved", "all"].includes(status) ? status : "open"),
    q.moderationCounts(c.env.DB),
    q.blocklists(c.env.DB),
  ]);

  return c.html(
    <AdminShell title="Moderation" active="moderation" adminEmail={adminEmail} badges={badges}>
      <StatGrid>
        <Stat label="Open reports" value={formatNumber(counts.open)} />
        <Stat label="Blocked documents" value={formatNumber(counts.blockedDocs)} />
        <Stat label="Blocked hashes" value={formatNumber(counts.blockedHashes)} hint="Exact file bytes" />
        <Stat label="Blocked uploaders" value={formatNumber(counts.blockedUploaders)} hint="Daily-salted hash" />
      </StatGrid>

      <div class="mt-6 flex items-center gap-2">
        <h2 class="text-sm font-medium">Report queue</h2>
        <div class="ms-auto inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
          {[
            { key: "open", label: "Open" },
            { key: "resolved", label: "Resolved" },
            { key: "all", label: "All" },
          ].map((f) => (
            <a
              href={`/admin/moderation?status=${f.key}`}
              aria-current={status === f.key ? "true" : undefined}
              class={
                "rounded px-2.5 py-1 font-medium transition-colors " +
                (status === f.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              {f.label}
            </a>
          ))}
        </div>
      </div>

      <div class="mt-3 flex flex-col gap-3">
        {queue.length === 0 ? (
          <Empty>
            {status === "open" ? "Nothing waiting. " : "Nothing here. "}
            <span class="text-muted-foreground">Reports arrive from the form on every viewer page.</span>
          </Empty>
        ) : queue.map((report) => (
          <article class="rounded-xl border border-border bg-card p-4">
            <header class="flex flex-wrap items-start gap-3">
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-2 text-sm">
                  {report.status === "open" ? <Pill tone="bad">Open</Pill> : <Pill tone="good">Resolved</Pill>}
                  {report.document_id ? (
                    <a href={`/admin/documents/${report.document_id}`} class="font-medium hover:underline">
                      {report.title}
                    </a>
                  ) : (
                    <span class="text-muted-foreground">document already gone</span>
                  )}
                  <a href={`/${report.slug}`} target="_blank" rel="noreferrer"
                     class="font-mono text-xs text-muted-foreground hover:underline">
                    /{report.slug}
                  </a>
                  {report.doc_status && <DocStatus status={report.doc_status} deletedAt={report.deleted_at} />}
                </p>
                <p class="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
                  {report.reason}
                </p>
                <p class="mt-2 text-xs text-muted-foreground">
                  {formatWhen(report.created_at)} ·{" "}
                  {report.reporter_email
                    ? <>reported by <bdi>{report.reporter_email}</bdi></>
                    : "no reply address given"}
                  {" · "}{formatNumber(report.views)} views on this link
                </p>
              </div>

              <div class="ms-auto flex flex-wrap gap-2">
                {report.document_id && report.doc_status !== "blocked" && !report.deleted_at && (
                  <form method="post" action={`/admin/documents/${report.document_id}/block`} class="flex gap-2">
                    <input type="hidden" name="report" value={report.id} />
                    <input type="hidden" name="reason" value="abuse report" />
                    <button class="btn" data-variant="outline" data-size="sm">Block</button>
                  </form>
                )}
                {report.document_id && !report.deleted_at && (
                  <form
                    method="post" action={`/admin/documents/${report.document_id}/delete`}
                    data-confirm="Delete this document? The link dies now and the file is purged on the next nightly sweep."
                  >
                    <input type="hidden" name="report" value={report.id} />
                    <button class="btn bg-destructive text-white hover:bg-destructive/90" data-size="sm">
                      Delete
                    </button>
                  </form>
                )}
                {report.status === "open" && (
                  <form method="post" action={`/admin/reports/${report.id}/resolve`}>
                    <button class="btn" data-variant="ghost" data-size="sm">Dismiss</button>
                  </form>
                )}
              </div>
            </header>
          </article>
        ))}
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Blocked documents"
          note="Still visible to their owner, refused to everyone else"
        >
          {lists.documents.length === 0 ? (
            <p class="py-6 text-center text-sm text-muted-foreground">None.</p>
          ) : (
            <TableWrap narrow>
              <thead>
                <tr class="border-b border-border">
                  <Th>Document</Th><Th>Reason</Th><Th align="end">When</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {lists.documents.map((d) => (
                  <tr class="border-b border-border/60 last:border-0">
                    <Td wrap>
                      <a href={`/admin/documents/${d.id}`} class="hover:underline">{d.title}</a>
                    </Td>
                    <Td wrap><span class="text-muted-foreground">{d.blocked_reason ?? "—"}</span></Td>
                    <Td align="end"><span class="text-muted-foreground">{formatWhen(d.created_at)}</span></Td>
                    <Td align="end">
                      <form method="post" action={`/admin/documents/${d.id}/unblock`}>
                        <button class="btn" data-variant="ghost" data-size="sm">Unblock</button>
                      </form>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Panel>

        <Panel
          title="Blocklists"
          note="A hash blocks one exact file; an uploader block survives re-saving it"
        >
          <h3 class="text-xs font-medium text-muted-foreground">File hashes</h3>
          {lists.hashes.length === 0 ? (
            <p class="py-3 text-sm text-muted-foreground">None.</p>
          ) : (
            <ul class="mt-2 flex flex-col gap-1">
              {lists.hashes.map((h) => (
                <li class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                  <code class="font-mono text-xs text-muted-foreground">{h.sha256.slice(0, 20)}…</code>
                  <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{h.reason ?? "—"}</span>
                  <form method="post" action="/admin/moderation/unblock-hash">
                    <input type="hidden" name="sha256" value={h.sha256} />
                    <button class="btn" data-variant="ghost" data-size="sm">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <h3 class="mt-5 text-xs font-medium text-muted-foreground">Uploaders</h3>
          {lists.uploaders.length === 0 ? (
            <p class="py-3 text-sm text-muted-foreground">None.</p>
          ) : (
            <ul class="mt-2 flex flex-col gap-1">
              {lists.uploaders.map((u) => (
                <li class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                  <code class="font-mono text-xs text-muted-foreground">{u.uploader_hash.slice(0, 20)}…</code>
                  <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {u.reason ?? "—"}
                    {u.expires_at ? ` · until ${formatWhen(u.expires_at)}` : " · no expiry"}
                  </span>
                  <form method="post" action="/admin/moderation/unblock-uploader">
                    <input type="hidden" name="hash" value={u.uploader_hash} />
                    <button class="btn" data-variant="ghost" data-size="sm">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminShell>,
  );
});

/* -------------------------------------------------------------------------- */
/*  System                                                                     */
/* -------------------------------------------------------------------------- */

admin.get("/admin/system", async (c) => {
  const { adminEmail, badges } = await frame(c);
  const [health, runs] = await Promise.all([
    q.systemHealth(c.env.DB),
    q.sweepRuns(c.env.DB, 14),
  ]);

  const last = runs[0];
  // Three states, not two. "Never run" is a different problem from "ran and
  // failed", and both are different from "ran two days ago" — the cron fires
  // daily, so anything past ~26 hours means it is not firing at all.
  const sweepState: { tone: "good" | "warn" | "bad"; label: string } = !last
    ? { tone: "warn", label: "Never run" }
    : last.error
      ? { tone: "bad", label: "Last run failed" }
      : Date.now() - last.ran_at > 26 * 60 * 60 * 1000
        ? { tone: "bad", label: "Overdue" }
        : { tone: "good", label: "Healthy" };

  const config: { name: string; set: boolean; note: string }[] = [
    { name: "TURNSTILE_SECRET", set: Boolean(c.env.TURNSTILE_SECRET),
      note: "Unset: the widget renders but verifies nothing." },
    { name: "TURNSTILE_SITE_KEY", set: Boolean(c.env.TURNSTILE_SITE_KEY),
      note: "Unset: no widget at all." },
    { name: "RESEND_API_KEY", set: Boolean(c.env.RESEND_API_KEY),
      note: "Unset: mail is logged to the console, not sent — sign-in is broken in production." },
    { name: "STRIPE_SECRET_KEY", set: Boolean(c.env.STRIPE_SECRET_KEY),
      note: "Unset: checkout redirects back to /pricing with an error." },
    { name: "STRIPE_WEBHOOK_SECRET", set: Boolean(c.env.STRIPE_WEBHOOK_SECRET),
      note: "Unset: payments succeed but nobody's plan is ever upgraded." },
    { name: "ADMIN_EMAILS", set: Boolean(c.env.ADMIN_EMAILS?.trim()),
      note: "Unset: this console would not be reachable — so it is set." },
  ];

  return c.html(
    <AdminShell title="System" active="system" adminEmail={adminEmail} badges={badges}>
      <StatGrid>
        <Stat
          label="Stored in R2" value={formatBytes(health.storageBytes)}
          hint={`${formatNumber(health.objects)} objects`}
        />
        <Stat
          label="Purge backlog" value={formatNumber(health.purgeBacklog)}
          hint="Documents owed deletion"
        />
        <Stat label="Retention sweep" value={sweepState.label}
              hint={last ? formatAgo(last.ran_at) : "no runs recorded"} />
        <Stat
          label="Rate-limit rows" value={formatNumber(health.liveLimits)}
          hint={`${formatNumber(health.expiredLimits)} expired, awaiting sweep`}
        />
      </StatGrid>

      {health.purgeBacklog > 100 && (
        <p class="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <strong class="font-medium">The backlog is larger than one night's batch.</strong>{" "}
          The sweep deletes up to 100 documents per run, so a backlog of{" "}
          {formatNumber(health.purgeBacklog)} takes {Math.ceil(health.purgeBacklog / 100)} nights to
          clear and will never shrink if uploads outpace it. Raise <code class="font-mono">BATCH</code>{" "}
          in <code class="font-mono">src/lib/retention.ts</code>.
        </p>
      )}

      <div class="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Retention sweep"
          note="Runs at 03:17 UTC. Each row is one night."
          action={
            <form method="post" action="/admin/system/sweep"
                  data-confirm="Run the retention sweep now? This permanently deletes expired files from R2.">
              <button class="btn" data-variant="outline" data-size="sm">Run now</button>
            </form>
          }
        >
          <p class="mb-3 flex items-center gap-2 text-sm">
            <Pill tone={sweepState.tone}>{sweepState.label}</Pill>
            {last && (
              <span class="text-muted-foreground">
                {formatWhen(last.ran_at)} · {last.duration_ms}ms
              </span>
            )}
          </p>

          {runs.length === 0 ? (
            <p class="py-4 text-sm text-muted-foreground">
              No runs recorded yet. The table was created by migration 0004, so this stays empty
              until the next cron fires — or until you press “Run now”.
            </p>
          ) : (
            <TableWrap narrow>
              <thead>
                <tr class="border-b border-border">
                  <Th>When</Th><Th align="end">Documents</Th><Th align="end">Objects</Th>
                  <Th align="end">Sessions</Th><Th align="end">Limits</Th><Th>Result</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr class="border-b border-border/60 last:border-0">
                    <Td><span class="text-muted-foreground">{formatWhen(run.ran_at)}</span></Td>
                    <Td align="end">{formatNumber(run.documents)}</Td>
                    <Td align="end">{formatNumber(run.objects)}</Td>
                    <Td align="end">{formatNumber(run.sessions)}</Td>
                    <Td align="end">{formatNumber(run.limits)}</Td>
                    <Td wrap>
                      {run.error
                        ? <span class="text-destructive">{run.error}</span>
                        : <Pill tone="good">ok</Pill>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Panel>

        <div class="flex flex-col gap-4">
          <Panel title="Configuration" note="Secrets are checked for presence, never read">
            <ul class="flex flex-col gap-1">
              {config.map((item) => (
                <li class="flex items-start gap-3 rounded-md px-2 py-1.5 text-sm">
                  <span class="w-44 shrink-0 font-mono text-xs">{item.name}</span>
                  {item.set ? <Pill tone="good">set</Pill> : <Pill tone="bad">missing</Pill>}
                  {!item.set && (
                    <span class="min-w-0 flex-1 text-xs text-muted-foreground">{item.note}</span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Table sizes" note="Row counts, not bytes — D1 does not expose file size">
            <BarList
              rows={Object.entries(health.rows).map(([key, value]) => ({ key, value }))}
            />
            {health.staleSessions > 0 && (
              <p class="mt-3 text-xs text-muted-foreground">
                {formatNumber(health.staleSessions)} expired auth sessions are still in the table.
                The sweep clears them.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </AdminShell>,
  );
});

/* -------------------------------------------------------------------------- */
/*  Audit log                                                                  */
/* -------------------------------------------------------------------------- */

admin.get("/admin/audit", async (c) => {
  const { adminEmail, badges } = await frame(c);
  const action = c.req.query("action") ?? "";
  const page = Math.max(Number(c.req.query("page") ?? 0) || 0, 0);
  const perPage = 100;

  const [rows, actions] = await Promise.all([
    q.auditLog(c.env.DB, { action: action || undefined, limit: perPage, offset: page * perPage }),
    q.auditActions(c.env.DB),
  ]);

  return c.html(
    <AdminShell title="Audit log" active="audit" adminEmail={adminEmail} badges={badges}>
      <div class="flex flex-wrap items-center gap-2">
        <div>
          <h2 class="text-sm font-medium">Every privileged action</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Append-only. Nothing in this console can edit or delete a row here.
          </p>
        </div>

        {actions.length > 0 && (
          <div class="ms-auto inline-flex flex-wrap rounded-md border border-border bg-card p-0.5 text-xs">
            <a
              href="/admin/audit"
              aria-current={action === "" ? "true" : undefined}
              class={
                "rounded px-2.5 py-1 font-medium transition-colors " +
                (action === "" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              All
            </a>
            {actions.map((name) => (
              <a
                href={`/admin/audit?action=${encodeURIComponent(name)}`}
                aria-current={action === name ? "true" : undefined}
                class={
                  "rounded px-2.5 py-1 font-medium transition-colors " +
                  (action === name ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                {name}
              </a>
            ))}
          </div>
        )}
      </div>

      <div class="mt-3 rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <Empty>Nothing logged yet.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr class="border-b border-border">
                <Th>When</Th><Th>Who</Th><Th>Action</Th>
                <Th>Target</Th><Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr class="border-b border-border/60 last:border-0">
                  <Td><span class="text-muted-foreground">{formatWhen(row.created_at)}</span></Td>
                  <Td><bdi>{row.actor_email}</bdi></Td>
                  <Td><Pill tone={row.action.includes("delete") ? "bad" : "neutral"}>{row.action}</Pill></Td>
                  <Td wrap>
                    <span class="text-xs text-muted-foreground">{row.target_type}</span>{" "}
                    {row.target_type === "document" && row.target_id ? (
                      <a href={`/admin/documents/${row.target_id}`} class="hover:underline">
                        {row.target_label ?? row.target_id}
                      </a>
                    ) : (
                      row.target_label ?? row.target_id ?? "—"
                    )}
                  </Td>
                  <Td wrap>
                    <code class="font-mono text-xs text-muted-foreground">{row.detail ?? "—"}</code>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      <nav class="mt-3 flex justify-end gap-2 text-xs">
        {page > 0 && (
          <a class="btn" data-size="sm" data-variant="outline"
             href={`/admin/audit?page=${page - 1}${action ? `&action=${encodeURIComponent(action)}` : ""}`}>
            ← Newer
          </a>
        )}
        {rows.length === perPage && (
          <a class="btn" data-size="sm" data-variant="outline"
             href={`/admin/audit?page=${page + 1}${action ? `&action=${encodeURIComponent(action)}` : ""}`}>
            Older →
          </a>
        )}
      </nav>
    </AdminShell>,
  );
});

/* -------------------------------------------------------------------------- */
/*  Live endpoint                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The one piece of JSON in the console, polled by admin.js.
 *
 * It sits under /admin rather than /api so that `requireAdmin` above already
 * covers it — a live feed of who is reading what is exactly the sort of thing
 * that must not be reachable by anyone else.
 */
admin.get("/admin/live", async (c) => {
  const [count, feed] = await Promise.all([
    q.liveNow(c.env.DB),
    q.recentViews(c.env.DB, 10),
  ]);

  return c.json({
    live: count,
    feed: feed.map((row) => ({
      title: row.title,
      slug: row.slug,
      where: [row.country, row.device].filter(Boolean).join(" · ") || "—",
      ago: formatAgo(row.started_at),
    })),
  });
});
