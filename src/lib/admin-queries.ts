// Every read the console does, in one file.
//
// Kept separate from the routes for one reason: these are the only queries in
// the codebase that scan across *everybody*. The app itself always asks about
// one slug, one document, or one owner, and is indexed for that. A question
// like "views last week, platform-wide" has a completely different shape, and
// mixing the two would make it impossible to see at a glance which queries need
// which index. Migration 0004 adds the indexes these rely on.
//
// Correlated sub-selects appear a few times below (a per-row COUNT of links, of
// views). At pdf.sy's size that is the right trade — one readable statement
// beats four joins and a GROUP BY — but it is the first thing to rewrite if a
// list page ever feels slow, not a mystery to rediscover then.
import { PRICING } from "./plans";

type PaidPlan = "lite" | "pro";

const DAY = 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/*  Time windows                                                               */
/* -------------------------------------------------------------------------- */

export type Range = "7d" | "30d" | "90d";
export const RANGES: readonly Range[] = ["7d", "30d", "90d"];
export const isRange = (value: unknown): value is Range =>
  RANGES.includes(value as Range);

export type Window = { since: number; until: number; days: number };

/**
 * The window asked for, plus the same-length window immediately before it.
 *
 * Every "+12%" on the overview is this pair. Comparing against a *fixed*
 * previous period (last calendar month, say) is the more common choice and the
 * wrong one here: on a seven-day view it would compare a week against a month.
 */
export function windows(range: Range, now = Date.now()): { current: Window; previous: Window } {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const span = days * DAY;
  return {
    current: { since: now - span, until: now, days },
    previous: { since: now - span * 2, until: now - span, days },
  };
}

/** null when the previous window was empty — "+∞%" is not a useful figure. */
export function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

/* -------------------------------------------------------------------------- */
/*  Overview                                                                   */
/* -------------------------------------------------------------------------- */

export type Totals = {
  views: number;
  viewers: number;
  readMs: number;
  downloads: number;
  uploads: number;
  links: number;
  signups: number;
};

/**
 * Unique viewers are counted by `ip_hash`, which is a daily-salted hash — the
 * same person on two different days counts twice, and that is deliberate: the
 * salt rotating is what stops the column being a tracking identifier. So this
 * figure is honest as "unique viewers per day, summed", not as "people".
 */
export async function totals(db: D1Database, w: Window): Promise<Totals> {
  const [sessions, uploads, links, signups] = await db.batch<Record<string, number>>([
    db.prepare(
      `SELECT COUNT(*) AS views,
              COUNT(DISTINCT ip_hash) AS viewers,
              COALESCE(SUM(total_ms), 0) AS read_ms,
              COALESCE(SUM(downloaded), 0) AS downloads
         FROM view_sessions
        WHERE started_at >= ? AND started_at < ?`,
    ).bind(w.since, w.until),
    db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE created_at >= ? AND created_at < ?`)
      .bind(w.since, w.until),
    db.prepare(`SELECT COUNT(*) AS n FROM links WHERE created_at >= ? AND created_at < ?`)
      .bind(w.since, w.until),
    db.prepare(`SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?`)
      .bind(w.since, w.until),
  ]);

  const s = sessions.results[0] ?? {};
  return {
    views: Number(s.views ?? 0),
    viewers: Number(s.viewers ?? 0),
    readMs: Number(s.read_ms ?? 0),
    downloads: Number(s.downloads ?? 0),
    uploads: Number(uploads.results[0]?.n ?? 0),
    links: Number(links.results[0]?.n ?? 0),
    signups: Number(signups.results[0]?.n ?? 0),
  };
}

export type Series = { day: number; value: number }[];

/**
 * One point per day, gaps filled with zero.
 *
 * The fill matters more than it looks: SQLite returns no row for a day with no
 * views, and a chart drawn straight from those rows silently closes the gap,
 * turning a dead weekend into a smooth line. Every quiet day has to be present
 * and equal to zero for the shape to be true.
 */
export async function dailySeries(
  db: D1Database,
  table: "view_sessions" | "documents" | "links" | "users",
  column: "started_at" | "created_at",
  w: Window,
): Promise<Series> {
  const { results } = await db.prepare(
    `SELECT ${column} / ${DAY} AS day, COUNT(*) AS n
       FROM ${table}
      WHERE ${column} >= ? AND ${column} < ?
      GROUP BY day
      ORDER BY day`,
  ).bind(w.since, w.until).all<{ day: number; n: number }>();

  const counts = new Map(results.map((row) => [Number(row.day), Number(row.n)]));
  const firstDay = Math.floor(w.since / DAY);
  return Array.from({ length: w.days }, (_, i) => ({
    day: firstDay + i,
    value: counts.get(firstDay + i) ?? 0,
  }));
}

/** Sessions touched in the last two minutes. The console's heartbeat. */
export async function liveNow(db: D1Database, now = Date.now()): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM view_sessions WHERE last_seen_at >= ?`,
  ).bind(now - 2 * 60 * 1000).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export type FeedRow = {
  slug: string;
  title: string;
  country: string | null;
  device: string | null;
  started_at: number;
  total_ms: number;
  max_page: number;
  downloaded: number;
};

/** The most recent opens, newest first. Polled by the live feed. */
export async function recentViews(db: D1Database, limit = 12): Promise<FeedRow[]> {
  const { results } = await db.prepare(
    `SELECT vs.slug, vs.country, vs.device, vs.started_at, vs.total_ms,
            vs.max_page, vs.downloaded, d.title
       FROM view_sessions vs
       JOIN links l ON l.slug = vs.slug
       JOIN documents d ON d.id = l.document_id
      ORDER BY vs.started_at DESC
      LIMIT ?`,
  ).bind(limit).all<FeedRow>();
  return results;
}

/* -------------------------------------------------------------------------- */
/*  Documents and links                                                        */
/* -------------------------------------------------------------------------- */

export type DocumentRow = {
  id: string;
  title: string;
  status: string;
  blocked_reason: string | null;
  created_at: number;
  deleted_at: number | null;
  owner_id: string | null;
  owner_email: string | null;
  links: number;
  bytes: number;
  pages: number | null;
  views: number;
  last_view: number | null;
};

export type DocumentFilter = {
  q?: string;
  status?: "ready" | "blocked" | "deleted" | "processing";
  /** Everything owned by one account, for the account page. */
  owner?: string;
  limit?: number;
  offset?: number;
};

/**
 * The document list.
 *
 * Search covers title, owner email, and exact slug, because those are the three
 * things you actually have when something needs looking up: a name someone
 * emailed you, an account that complained, or a URL from an abuse report.
 */
export async function documentList(
  db: D1Database, filter: DocumentFilter = {},
): Promise<DocumentRow[]> {
  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;
  const where: string[] = [];
  const binds: unknown[] = [];

  if (filter.status === "deleted") {
    where.push("d.deleted_at IS NOT NULL");
  } else if (filter.status) {
    where.push("d.deleted_at IS NULL AND d.status = ?");
    binds.push(filter.status);
  }

  if (filter.owner) {
    where.push("d.owner_id = ?");
    binds.push(filter.owner);
  }

  if (filter.q) {
    const like = `%${filter.q}%`;
    where.push(
      `(d.title LIKE ? OR u.email LIKE ?
        OR EXISTS (SELECT 1 FROM links l WHERE l.document_id = d.id AND l.slug = ?))`,
    );
    binds.push(like, like, filter.q);
  }

  const { results } = await db.prepare(
    `SELECT d.id, d.title, d.status, d.blocked_reason, d.created_at, d.deleted_at,
            d.owner_id, u.email AS owner_email,
            (SELECT COUNT(*) FROM links l WHERE l.document_id = d.id) AS links,
            (SELECT COALESCE(SUM(size_bytes), 0) FROM document_versions v
              WHERE v.document_id = d.id) AS bytes,
            (SELECT MAX(page_count) FROM document_versions v
              WHERE v.document_id = d.id) AS pages,
            (SELECT COUNT(*) FROM view_sessions vs
               JOIN links l ON l.slug = vs.slug
              WHERE l.document_id = d.id) AS views,
            (SELECT MAX(vs.started_at) FROM view_sessions vs
               JOIN links l ON l.slug = vs.slug
              WHERE l.document_id = d.id) AS last_view
       FROM documents d
       LEFT JOIN users u ON u.id = d.owner_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?`,
  ).bind(...binds, limit, offset).all<DocumentRow>();

  return results;
}

export type DocumentCounts = {
  total: number;
  ready: number;
  blocked: number;
  deleted: number;
  anonymous: number;
  bytes: number;
};

export async function documentCounts(db: D1Database): Promise<DocumentCounts> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status = 'ready'   THEN 1 ELSE 0 END), 0) AS ready,
            COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked,
            COALESCE(SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS deleted,
            COALESCE(SUM(CASE WHEN owner_id IS NULL THEN 1 ELSE 0 END), 0) AS anonymous
       FROM documents`,
  ).first<DocumentCounts>();

  const size = await db.prepare(
    `SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM document_versions`,
  ).first<{ bytes: number }>();

  return { ...(row ?? {} as DocumentCounts), bytes: Number(size?.bytes ?? 0) };
}

export type VersionRow = {
  version: number; label: string | null; size_bytes: number;
  page_count: number | null; sha256: string; r2_key: string; created_at: number;
};

export type LinkRow = {
  slug: string; name: string | null; pinned_version: number | null;
  password_hash: string | null; allow_download: number;
  expires_at: number | null; revoked_at: number | null; created_at: number;
  views: number; viewers: number; read_ms: number; downloads: number;
  last_view: number | null;
};

export type DocumentDetail = {
  doc: DocumentRow;
  versions: VersionRow[];
  links: LinkRow[];
  pages: { page: number; views: number; total_ms: number }[];
};

export async function documentDetail(
  db: D1Database, id: string,
): Promise<DocumentDetail | null> {
  const row = await db.prepare(
    `SELECT d.id, d.title, d.status, d.blocked_reason, d.created_at, d.deleted_at,
            d.owner_id, u.email AS owner_email,
            (SELECT COUNT(*) FROM links l WHERE l.document_id = d.id) AS links,
            (SELECT COALESCE(SUM(size_bytes), 0) FROM document_versions v
              WHERE v.document_id = d.id) AS bytes,
            (SELECT MAX(page_count) FROM document_versions v
              WHERE v.document_id = d.id) AS pages,
            0 AS views, NULL AS last_view
       FROM documents d
       LEFT JOIN users u ON u.id = d.owner_id
      WHERE d.id = ?`,
  ).bind(id).first<DocumentRow>();

  if (!row) return null;

  const [versions, links, pages] = await db.batch<Record<string, unknown>>([
    db.prepare(
      `SELECT version, label, size_bytes, page_count, sha256, r2_key, created_at
         FROM document_versions WHERE document_id = ? ORDER BY version DESC`,
    ).bind(id),
    db.prepare(
      `SELECT l.slug, l.name, l.pinned_version, l.password_hash, l.allow_download,
              l.expires_at, l.revoked_at, l.created_at,
              COUNT(vs.id) AS views,
              COUNT(DISTINCT vs.ip_hash) AS viewers,
              COALESCE(SUM(vs.total_ms), 0) AS read_ms,
              COALESCE(SUM(vs.downloaded), 0) AS downloads,
              MAX(vs.started_at) AS last_view
         FROM links l
         LEFT JOIN view_sessions vs ON vs.slug = l.slug
        WHERE l.document_id = ?
        GROUP BY l.slug
        ORDER BY l.created_at DESC`,
    ).bind(id),
    // Page stats are keyed by slug, so a document with several links has its
    // attention spread across them. Summing is the only sensible roll-up: the
    // question here is "which page loses people", not "which link".
    db.prepare(
      `SELECT ps.page, SUM(ps.views) AS views, SUM(ps.total_ms) AS total_ms
         FROM page_stats ps
         JOIN links l ON l.slug = ps.slug
        WHERE l.document_id = ?
        GROUP BY ps.page
        ORDER BY ps.page`,
    ).bind(id),
  ]);

  const views = (links.results as LinkRow[]).reduce((sum, l) => sum + Number(l.views), 0);
  const lastView = (links.results as LinkRow[])
    .reduce<number | null>((max, l) => (l.last_view && (!max || l.last_view > max) ? l.last_view : max), null);

  return {
    doc: { ...row, views, last_view: lastView },
    versions: versions.results as VersionRow[],
    links: links.results as LinkRow[],
    pages: pages.results as { page: number; views: number; total_ms: number }[],
  };
}

/* -------------------------------------------------------------------------- */
/*  Engagement                                                                 */
/* -------------------------------------------------------------------------- */

export type Breakdown = { key: string; views: number; read_ms: number }[];

/**
 * Views grouped by one column of `view_sessions`.
 *
 * The column name is interpolated rather than bound because SQLite cannot bind
 * an identifier — only a value. That is a SQL-injection shape, so the parameter
 * is a closed union and the switch below is the guard: a string from a query
 * parameter can never reach this, only one of these four literals.
 */
export async function breakdown(
  db: D1Database,
  by: "country" | "device" | "referrer",
  w: Window,
  limit = 10,
): Promise<Breakdown> {
  const column = by === "country" ? "country" : by === "device" ? "device" : "referrer";

  const { results } = await db.prepare(
    `SELECT COALESCE(NULLIF(${column}, ''), '—') AS key,
            COUNT(*) AS views,
            COALESCE(SUM(total_ms), 0) AS read_ms
       FROM view_sessions
      WHERE started_at >= ? AND started_at < ?
      GROUP BY key
      ORDER BY views DESC
      LIMIT ?`,
  ).bind(w.since, w.until, limit * 4).all<{ key: string; views: number; read_ms: number }>();

  // Referrers arrive as full URLs. Rolling them up to a hostname in SQL would
  // mean nested instr()/substr() that nobody can read; doing it here is three
  // lines and the grouping is the same. Everything else passes straight through.
  if (by !== "referrer") return results.slice(0, limit);

  const merged = new Map<string, { key: string; views: number; read_ms: number }>();
  for (const row of results) {
    let key = row.key;
    if (key !== "—") {
      try { key = new URL(key).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
    }
    const existing = merged.get(key);
    if (existing) {
      existing.views += Number(row.views);
      existing.read_ms += Number(row.read_ms);
    } else {
      merged.set(key, { key, views: Number(row.views), read_ms: Number(row.read_ms) });
    }
  }
  return [...merged.values()].sort((a, b) => b.views - a.views).slice(0, limit);
}

export type Depth = { bucket: string; sessions: number }[];

/**
 * How far into a document people actually get.
 *
 * This is the number linkat.sy could never produce and pdf.sy can: `max_page`
 * against the version's real `page_count`. "Opened it" and "read all fourteen
 * pages" are the same row in most analytics; here they are different buckets.
 *
 * Sessions on a version whose page count was never determined are excluded
 * rather than counted as zero — an unknown denominator is not a shallow read.
 */
export async function readDepth(db: D1Database, w: Window): Promise<Depth> {
  const { results } = await db.prepare(
    `SELECT CASE
              WHEN vs.max_page >= v.page_count            THEN 'Finished'
              WHEN vs.max_page * 4 >= v.page_count * 3    THEN 'Most of it'
              WHEN vs.max_page * 2 >= v.page_count        THEN 'Half'
              WHEN vs.max_page > 1                        THEN 'A few pages'
              ELSE 'First page only'
            END AS bucket,
            COUNT(*) AS sessions
       FROM view_sessions vs
       JOIN links l ON l.slug = vs.slug
       JOIN document_versions v
         ON v.document_id = l.document_id AND v.version = vs.version
      WHERE vs.started_at >= ? AND vs.started_at < ?
        AND v.page_count IS NOT NULL AND v.page_count > 0
      GROUP BY bucket`,
  ).bind(w.since, w.until).all<{ bucket: string; sessions: number }>();

  // Fixed order, and every bucket present. A funnel with a missing step reads
  // as if nobody ever landed there rather than as a gap in the data.
  const order = ["First page only", "A few pages", "Half", "Most of it", "Finished"];
  const found = new Map(results.map((r) => [r.bucket, Number(r.sessions)]));
  return order.map((bucket) => ({ bucket, sessions: found.get(bucket) ?? 0 }));
}

export type TopLink = {
  slug: string; title: string; name: string | null;
  views: number; viewers: number; read_ms: number; downloads: number;
};

export async function topLinks(db: D1Database, w: Window, limit = 10): Promise<TopLink[]> {
  const { results } = await db.prepare(
    `SELECT vs.slug, d.title, l.name,
            COUNT(*) AS views,
            COUNT(DISTINCT vs.ip_hash) AS viewers,
            COALESCE(SUM(vs.total_ms), 0) AS read_ms,
            COALESCE(SUM(vs.downloaded), 0) AS downloads
       FROM view_sessions vs
       JOIN links l ON l.slug = vs.slug
       JOIN documents d ON d.id = l.document_id
      WHERE vs.started_at >= ? AND vs.started_at < ?
      GROUP BY vs.slug
      ORDER BY views DESC
      LIMIT ?`,
  ).bind(w.since, w.until, limit).all<TopLink>();
  return results;
}

/** Views by hour of day (UTC), 0–23. Tells you when the audience is awake. */
export async function viewsByHour(db: D1Database, w: Window): Promise<Series> {
  const { results } = await db.prepare(
    `SELECT CAST(strftime('%H', started_at / 1000, 'unixepoch') AS INTEGER) AS hour,
            COUNT(*) AS n
       FROM view_sessions
      WHERE started_at >= ? AND started_at < ?
      GROUP BY hour`,
  ).bind(w.since, w.until).all<{ hour: number; n: number }>();

  const counts = new Map(results.map((r) => [Number(r.hour), Number(r.n)]));
  return Array.from({ length: 24 }, (_, hour) => ({ day: hour, value: counts.get(hour) ?? 0 }));
}

/* -------------------------------------------------------------------------- */
/*  Accounts                                                                   */
/* -------------------------------------------------------------------------- */

export type UserRow = {
  id: string; email: string; name: string | null; plan: string;
  plan_status: string | null; plan_renews_at: number | null;
  stripe_customer_id: string | null;
  created_at: number; last_seen_at: number | null;
  documents: number; links: number; views: number; bytes: number;
};

export async function userList(
  db: D1Database, filter: { q?: string; plan?: string; limit?: number; offset?: number } = {},
): Promise<UserRow[]> {
  const limit = Math.min(filter.limit ?? 50, 200);
  const where: string[] = [];
  const binds: unknown[] = [];

  if (filter.q) { where.push("u.email LIKE ?"); binds.push(`%${filter.q}%`); }
  if (filter.plan === "paid") where.push("u.plan IN ('lite', 'pro')");
  else if (filter.plan) { where.push("u.plan = ?"); binds.push(filter.plan); }

  const { results } = await db.prepare(
    `SELECT u.id, u.email, u.name, u.plan, u.plan_status, u.plan_renews_at,
            u.stripe_customer_id, u.created_at, u.last_seen_at,
            (SELECT COUNT(*) FROM documents d
              WHERE d.owner_id = u.id AND d.deleted_at IS NULL) AS documents,
            (SELECT COUNT(*) FROM links l JOIN documents d ON d.id = l.document_id
              WHERE d.owner_id = u.id AND d.deleted_at IS NULL) AS links,
            (SELECT COUNT(*) FROM view_sessions vs
               JOIN links l ON l.slug = vs.slug
               JOIN documents d ON d.id = l.document_id
              WHERE d.owner_id = u.id) AS views,
            (SELECT COALESCE(SUM(v.size_bytes), 0) FROM document_versions v
               JOIN documents d ON d.id = v.document_id
              WHERE d.owner_id = u.id AND d.deleted_at IS NULL) AS bytes
       FROM users u
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`,
  ).bind(...binds, limit, filter.offset ?? 0).all<UserRow>();

  return results;
}

export type UserCounts = {
  total: number; paid: number; lite: number; pro: number;
  active_30d: number; new_30d: number; never_uploaded: number;
};

export async function userCounts(db: D1Database, now = Date.now()): Promise<UserCounts> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN plan IN ('lite','pro') THEN 1 ELSE 0 END), 0) AS paid,
            COALESCE(SUM(CASE WHEN plan = 'lite' THEN 1 ELSE 0 END), 0) AS lite,
            COALESCE(SUM(CASE WHEN plan = 'pro'  THEN 1 ELSE 0 END), 0) AS pro,
            COALESCE(SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END), 0) AS active_30d,
            COALESCE(SUM(CASE WHEN created_at   >= ? THEN 1 ELSE 0 END), 0) AS new_30d,
            COALESCE(SUM(CASE WHEN NOT EXISTS
              (SELECT 1 FROM documents d WHERE d.owner_id = users.id) THEN 1 ELSE 0 END), 0)
              AS never_uploaded
       FROM users`,
  ).bind(now - 30 * DAY, now - 30 * DAY).first<UserCounts>();

  return row ?? { total: 0, paid: 0, lite: 0, pro: 0, active_30d: 0, new_30d: 0, never_uploaded: 0 };
}

/* -------------------------------------------------------------------------- */
/*  Revenue                                                                    */
/* -------------------------------------------------------------------------- */

export type Revenue = {
  mrr: number;
  lite: number;
  pro: number;
  active: number;
  trialing: number;
  pastDue: number;
  canceled: number;
  renewing30d: number;
  newPaid30d: number | null;
  churned30d: number | null;
  conversion: number;
};

/**
 * What the billing state of the platform is right now.
 *
 * Two honest limitations, both visible in the return type:
 *
 * 1. MRR is at *list price*. The `users` table records which plan someone is
 *    on but not whether they pay monthly or yearly, and Stripe is the only
 *    place that knows. A yearly Pro customer really contributes $8/mo and is
 *    counted here as $12. So this is an upper bound, not a bank statement —
 *    the page says so on the card rather than hiding it in a comment.
 *
 * 2. `newPaid30d` and `churned30d` are null until `plan_changed_at` has been
 *    populated for long enough to mean something. Migration 0004 adds the
 *    column; every row that existed before it is NULL, and inventing a date
 *    for those would make the first month's numbers quietly wrong.
 */
export async function revenue(db: D1Database, now = Date.now()): Promise<Revenue> {
  const since = now - 30 * DAY;

  const row = await db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN plan = 'lite' THEN 1 ELSE 0 END), 0) AS lite,
            COALESCE(SUM(CASE WHEN plan = 'pro'  THEN 1 ELSE 0 END), 0) AS pro,
            COALESCE(SUM(CASE WHEN plan_status = 'active'   THEN 1 ELSE 0 END), 0) AS active,
            COALESCE(SUM(CASE WHEN plan_status = 'trialing' THEN 1 ELSE 0 END), 0) AS trialing,
            COALESCE(SUM(CASE WHEN plan_status = 'past_due' THEN 1 ELSE 0 END), 0) AS past_due,
            COALESCE(SUM(CASE WHEN plan_status = 'canceled' THEN 1 ELSE 0 END), 0) AS canceled,
            COALESCE(SUM(CASE WHEN plan_renews_at BETWEEN ? AND ? THEN 1 ELSE 0 END), 0) AS renewing,
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN plan_changed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS tracked,
            COALESCE(SUM(CASE WHEN plan_changed_at >= ? AND plan IN ('lite','pro')
                              THEN 1 ELSE 0 END), 0) AS new_paid,
            COALESCE(SUM(CASE WHEN plan_changed_at >= ? AND plan = 'free'
                              THEN 1 ELSE 0 END), 0) AS churned
       FROM users`,
  ).bind(now, now + 30 * DAY, since, since).first<Record<string, number>>();

  const lite = Number(row?.lite ?? 0);
  const pro = Number(row?.pro ?? 0);
  const total = Number(row?.total ?? 0);
  const tracked = Number(row?.tracked ?? 0);

  return {
    mrr: lite * listPrice("lite") + pro * listPrice("pro"),
    lite, pro,
    active: Number(row?.active ?? 0),
    trialing: Number(row?.trialing ?? 0),
    pastDue: Number(row?.past_due ?? 0),
    canceled: Number(row?.canceled ?? 0),
    renewing30d: Number(row?.renewing ?? 0),
    newPaid30d: tracked ? Number(row?.new_paid ?? 0) : null,
    churned30d: tracked ? Number(row?.churned ?? 0) : null,
    conversion: total ? ((lite + pro) / total) * 100 : 0,
  };
}

/**
 * The monthly list price as a number, read out of the same object the pricing
 * page renders. Parsing "$12" is slightly ugly, and it is still better than a
 * second copy of the prices sitting here that nobody would remember to update
 * when the page changes.
 */
function listPrice(plan: PaidPlan): number {
  return Number(PRICING[plan].monthly.amount.replace(/[^0-9.]/g, "")) || 0;
}

/** Everyone paying, newest first — the list you actually look at. */
export async function payingUsers(db: D1Database): Promise<UserRow[]> {
  return userList(db, { plan: "paid", limit: 100 });
}

/* -------------------------------------------------------------------------- */
/*  Moderation                                                                 */
/* -------------------------------------------------------------------------- */

export type ReportRow = {
  id: string; slug: string; reason: string; reporter_email: string | null;
  status: string; created_at: number;
  title: string | null; document_id: string | null; doc_status: string | null;
  deleted_at: number | null; views: number;
};

/**
 * The queue.
 *
 * LEFT JOIN, not JOIN: a report whose link has since been swept away still
 * needs to appear. Losing sight of a complaint because the thing complained
 * about expired is the one failure mode a moderation queue must not have.
 */
export async function reports(
  db: D1Database, status: "open" | "resolved" | "all" = "open", limit = 100,
): Promise<ReportRow[]> {
  const where = status === "all" ? "" : "WHERE r.status = ?";
  const binds = status === "all" ? [limit] : [status, limit];

  const { results } = await db.prepare(
    `SELECT r.id, r.slug, r.reason, r.reporter_email, r.status, r.created_at,
            d.title, d.id AS document_id, d.status AS doc_status, d.deleted_at,
            (SELECT COUNT(*) FROM view_sessions vs WHERE vs.slug = r.slug) AS views
       FROM abuse_reports r
       LEFT JOIN links l ON l.slug = r.slug
       LEFT JOIN documents d ON d.id = l.document_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT ?`,
  ).bind(...binds).all<ReportRow>();

  return results;
}

export type ModerationCounts = {
  open: number; resolved: number; blockedDocs: number;
  blockedHashes: number; blockedUploaders: number;
};

export async function moderationCounts(db: D1Database): Promise<ModerationCounts> {
  const [reportRow, docs, hashes, uploaders] = await db.batch<Record<string, number>>([
    db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END), 0) AS open,
              COALESCE(SUM(CASE WHEN status != 'open' THEN 1 ELSE 0 END), 0) AS resolved
         FROM abuse_reports`,
    ),
    db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE status = 'blocked'`),
    db.prepare(`SELECT COUNT(*) AS n FROM blocked_hashes`),
    db.prepare(`SELECT COUNT(*) AS n FROM blocked_uploaders`),
  ]);

  return {
    open: Number(reportRow.results[0]?.open ?? 0),
    resolved: Number(reportRow.results[0]?.resolved ?? 0),
    blockedDocs: Number(docs.results[0]?.n ?? 0),
    blockedHashes: Number(hashes.results[0]?.n ?? 0),
    blockedUploaders: Number(uploaders.results[0]?.n ?? 0),
  };
}

export type BlockedHash = { sha256: string; reason: string | null; created_at: number };
export type BlockedUploader = {
  uploader_hash: string; reason: string | null;
  expires_at: number | null; created_at: number;
};

export async function blocklists(db: D1Database): Promise<{
  hashes: BlockedHash[]; uploaders: BlockedUploader[]; documents: DocumentRow[];
}> {
  const [hashes, uploaders] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT sha256, reason, created_at FROM blocked_hashes ORDER BY created_at DESC LIMIT 100`),
    db.prepare(`SELECT uploader_hash, reason, expires_at, created_at FROM blocked_uploaders ORDER BY created_at DESC LIMIT 100`),
  ]);

  return {
    hashes: hashes.results as BlockedHash[],
    uploaders: uploaders.results as BlockedUploader[],
    documents: await documentList(db, { status: "blocked", limit: 50 }),
  };
}

/* -------------------------------------------------------------------------- */
/*  System                                                                     */
/* -------------------------------------------------------------------------- */

export type SweepRun = {
  id: string; ran_at: number; duration_ms: number;
  documents: number; objects: number; sessions: number;
  magic_links: number; limits: number; error: string | null;
};

export async function sweepRuns(db: D1Database, limit = 14): Promise<SweepRun[]> {
  const { results } = await db.prepare(
    `SELECT * FROM sweep_runs ORDER BY ran_at DESC LIMIT ?`,
  ).bind(limit).all<SweepRun>();
  return results;
}

export type SystemHealth = {
  storageBytes: number;
  objects: number;
  rows: Record<string, number>;
  purgeBacklog: number;
  staleSessions: number;
  expiredLimits: number;
  liveLimits: number;
};

/**
 * The numbers that answer "is anything quietly rotting".
 *
 * `purgeBacklog` deliberately re-implements the predicate from lib/retention.ts
 * rather than importing it, because it has to answer a different question:
 * retention asks "which hundred do I delete tonight" (LIMIT 100), this asks
 * "how many are owed deletion in total". A backlog that keeps climbing past 100
 * means the nightly batch size is now too small — which is invisible from the
 * sweep's own report, since every run would look like a full, healthy 100.
 */
export async function systemHealth(db: D1Database, now = Date.now()): Promise<SystemHealth> {
  const graceCutoff = now - DAY;

  const [storage, backlog, limits, docs, links_, sessions, users_, reports_] =
    await db.batch<Record<string, number>>([
      db.prepare(`SELECT COUNT(*) AS objects, COALESCE(SUM(size_bytes), 0) AS bytes FROM document_versions`),
      db.prepare(
        `SELECT COUNT(*) AS n
           FROM documents d
          WHERE d.deleted_at IS NOT NULL
             OR NOT EXISTS (
                  SELECT 1 FROM links l
                   WHERE l.document_id = d.id
                     AND (l.expires_at IS NULL OR l.expires_at > ?)
                )`,
      ).bind(graceCutoff),
      db.prepare(
        `SELECT COALESCE(SUM(CASE WHEN expires_at <  ? THEN 1 ELSE 0 END), 0) AS expired,
                COALESCE(SUM(CASE WHEN expires_at >= ? THEN 1 ELSE 0 END), 0) AS live
           FROM rate_limits`,
      ).bind(now, now),
      db.prepare(`SELECT COUNT(*) AS n FROM documents`),
      db.prepare(`SELECT COUNT(*) AS n FROM links`),
      db.prepare(`SELECT COUNT(*) AS n FROM view_sessions`),
      db.prepare(`SELECT COUNT(*) AS n FROM users`),
      db.prepare(`SELECT COUNT(*) AS n FROM abuse_reports`),
    ]);

  const staleSessions = await db.prepare(
    `SELECT COUNT(*) AS n FROM auth_sessions WHERE expires_at < ?`,
  ).bind(now).first<{ n: number }>();

  return {
    storageBytes: Number(storage.results[0]?.bytes ?? 0),
    objects: Number(storage.results[0]?.objects ?? 0),
    rows: {
      documents: Number(docs.results[0]?.n ?? 0),
      links: Number(links_.results[0]?.n ?? 0),
      view_sessions: Number(sessions.results[0]?.n ?? 0),
      users: Number(users_.results[0]?.n ?? 0),
      abuse_reports: Number(reports_.results[0]?.n ?? 0),
    },
    purgeBacklog: Number(backlog.results[0]?.n ?? 0),
    staleSessions: Number(staleSessions?.n ?? 0),
    expiredLimits: Number(limits.results[0]?.expired ?? 0),
    liveLimits: Number(limits.results[0]?.live ?? 0),
  };
}

/* -------------------------------------------------------------------------- */
/*  Audit                                                                      */
/* -------------------------------------------------------------------------- */

export type AuditRow = {
  id: string; actor_email: string; action: string; target_type: string;
  target_id: string | null; target_label: string | null;
  detail: string | null; created_at: number;
};

export async function auditLog(
  db: D1Database, filter: { action?: string; limit?: number; offset?: number } = {},
): Promise<AuditRow[]> {
  const limit = Math.min(filter.limit ?? 100, 500);
  const where = filter.action ? "WHERE action = ?" : "";
  const binds = filter.action ? [filter.action, limit, filter.offset ?? 0] : [limit, filter.offset ?? 0];

  const { results } = await db.prepare(
    `SELECT * FROM admin_audit ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).bind(...binds).all<AuditRow>();

  return results;
}

/** Distinct actions actually present, for the filter row. */
export async function auditActions(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare(
    `SELECT DISTINCT action FROM admin_audit ORDER BY action`,
  ).all<{ action: string }>();
  return results.map((r) => r.action);
}
