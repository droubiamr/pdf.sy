// The console's own small component set.
//
// Basecoat gives us buttons, badges, inputs and the card surface; everything
// below is the layer above that — the shapes a dashboard needs and a marketing
// site does not. All of it is server-rendered, including the charts.
//
// Charts are hand-drawn SVG rather than a library because there is no React
// here to hang one on: this app renders JSX on the server and ships almost no
// JavaScript. That is a real constraint, not a preference, and it caps what is
// reasonable — sparklines, an area chart, and bar lists are all straightforward
// path arithmetic; a zoomable brushed timeline would not be.
import type { Child } from "hono/jsx";
import type { Series } from "../../lib/admin-queries";

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Binary units, because that is what R2 and every storage bill count in.
 * Pinned to en-GB rather than the request's locale: this console is English by
 * design, and a number that changes shape with the reader's browser is a
 * number two people cannot compare over a call.
 */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export const formatNumber = (n: number): string => Number(n || 0).toLocaleString("en-GB");

export const formatMoney = (n: number): string =>
  `$${Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

/** "4m 12s". The site's own formatMs, minus the language argument. */
export function formatDuration(ms: number): string {
  if (!ms) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatWhen(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function formatAgo(ms: number | null | undefined): string {
  if (!ms) return "never";
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/* -------------------------------------------------------------------------- */
/*  Stat cards                                                                 */
/* -------------------------------------------------------------------------- */

type StatProps = {
  label: string;
  value: string | number;
  /** Percentage change against the previous window; null hides the pill. */
  delta?: number | null;
  hint?: string;
  series?: Series;
  href?: string;
};

export const Stat = ({ label, value, delta, hint, series, href }: StatProps) => {
  const body = (
    <>
      <div class="flex items-start justify-between gap-2">
        <span class="text-xs font-medium text-muted-foreground">{label}</span>
        {delta !== undefined && delta !== null && <Delta value={delta} />}
      </div>
      <div class="mt-1.5 text-2xl font-semibold tracking-tight tnum">{value}</div>
      {hint && <p class="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {series && series.length > 1 && (
        <div class="mt-3 -mb-1">
          <Sparkline series={series} />
        </div>
      )}
    </>
  );

  const classes =
    "block rounded-xl border border-border bg-card p-4 " +
    (href ? "transition-colors hover:border-input" : "");

  return href ? <a href={href} class={classes}>{body}</a> : <div class={classes}>{body}</div>;
};

/**
 * Green for up, red for down.
 *
 * Every metric that currently carries a delta is one where a rise is good news
 * — views, uploads, signups. The counts where a rise is *bad* (churn, past-due
 * accounts, the purge backlog) have no previous-window comparison to make, so
 * they render without a pill at all rather than with a misleadingly green one.
 * A metric that both trends and wants inverting will need a flag here.
 */
const Delta = ({ value }: { value: number }) => {
  const rounded = Math.round(value);
  const good = rounded > 0;
  const flat = rounded === 0;
  const tone = flat
    ? "text-muted-foreground"
    : good
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive";

  return (
    <span class={`shrink-0 text-xs font-medium tnum ${tone}`} title="vs. the previous period">
      {rounded > 0 ? "+" : ""}{rounded}%
    </span>
  );
};

/** A row of stat cards. Two up on a phone, four on a laptop. */
export const StatGrid = ({ children }: { children: Child }) => (
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
);

/* -------------------------------------------------------------------------- */
/*  Charts                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The line inside a stat card.
 *
 * `preserveAspectRatio="none"` lets one path stretch to whatever width the card
 * happens to be, which is what makes this work without measuring anything on
 * the client. The distortion that normally causes — a stroke squashed thin at
 * one end — is cancelled by `vector-effect="non-scaling-stroke"`, which draws
 * the line at its declared width in screen pixels regardless of the transform.
 */
export const Sparkline = ({ series, height = 28 }: { series: Series; height?: number }) => {
  const values = series.map((p) => p.value);
  const max = Math.max(...values, 1);
  const step = 100 / Math.max(values.length - 1, 1);
  const y = (v: number) => height - (v / max) * (height - 2) - 1;
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      class="h-7 w-full overflow-visible text-primary"
      aria-hidden="true"
    >
      <path
        d={`${line} L100,${height} L0,${height} Z`}
        fill="currentColor"
        opacity="0.10"
      />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  );
};

/**
 * The big chart. One bar per day, labelled at both ends and at the peak.
 *
 * Bars rather than a line, for one reason: with a daily bucket the gaps are
 * meaningful. A line drawn through three zero-days implies a smooth decline
 * that never happened; three missing bars say "nothing on Saturday".
 */
export const DayChart = (
  { series, label, height = 160 }: { series: Series; label: string; height?: number },
) => {
  const max = Math.max(...series.map((p) => p.value), 1);
  const peak = series.reduce((best, p) => (p.value > best.value ? p : best), series[0]);
  const dayLabel = (day: number) =>
    new Date(day * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <figure class="rounded-xl border border-border bg-card p-4">
      <figcaption class="flex items-baseline justify-between">
        <span class="text-sm font-medium">{label}</span>
        <span class="text-xs text-muted-foreground tnum">
          peak {formatNumber(peak?.value ?? 0)} · {peak ? dayLabel(peak.day) : "—"}
        </span>
      </figcaption>

      <div class="mt-4 flex items-end gap-[2px]" style={`height:${height}px`}>
        {series.map((point) => (
          <div
            class="group relative flex-1 rounded-t-[2px] bg-primary/25 transition-colors hover:bg-primary"
            style={`height:${Math.max((point.value / max) * 100, point.value ? 2 : 0.5)}%`}
            title={`${dayLabel(point.day)} — ${formatNumber(point.value)}`}
          ></div>
        ))}
      </div>

      <div class="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{series.length ? dayLabel(series[0].day) : ""}</span>
        <span>{series.length ? dayLabel(series[series.length - 1].day) : ""}</span>
      </div>
    </figure>
  );
};

/**
 * A ranked list with the bar drawn behind the label rather than beside it.
 *
 * Saves a column, and the eye reads "this row is wider" without having to
 * travel to a separate chart and back. The width is an inline style because it
 * is a percentage computed per row — the one thing Tailwind cannot express as
 * a class, and the reason the CSP allows inline *styles* (which cannot execute)
 * while forbidding inline scripts.
 */
export const BarList = (
  { rows, empty = "Nothing yet." }:
  { rows: { key: string; label?: string; value: number; note?: string }[]; empty?: string },
) => {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (rows.length === 0) {
    return <p class="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ul class="flex flex-col gap-1">
      {rows.map((row) => (
        <li class="relative isolate flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm">
          <span
            class="absolute inset-y-0 start-0 -z-10 rounded-md bg-accent"
            style={`width:${Math.max((row.value / max) * 100, 1.5)}%`}
            aria-hidden="true"
          ></span>
          <span class="min-w-0 truncate">{row.label ?? row.key}</span>
          <span class="shrink-0 text-muted-foreground tnum">
            {row.note ? <span class="me-2 text-xs">{row.note}</span> : null}
            {formatNumber(row.value)}
          </span>
        </li>
      ))}
    </ul>
  );
};

/* -------------------------------------------------------------------------- */
/*  Layout pieces                                                              */
/* -------------------------------------------------------------------------- */

export const Panel = (
  { title, note, action, children }:
  { title: string; note?: string; action?: Child; children: Child },
) => (
  <section class="rounded-xl border border-border bg-card">
    <header class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <div class="min-w-0">
        <h2 class="text-sm font-medium">{title}</h2>
        {note && <p class="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>
      {action && <div class="ms-auto">{action}</div>}
    </header>
    <div class="p-4">{children}</div>
  </section>
);

/**
 * Every table on every page scrolls sideways inside its own box.
 *
 * A dashboard table has more columns than a phone has room for, and the
 * alternative — letting the page itself scroll horizontally — breaks the
 * sidebar and the sticky header along with it.
 */
export const TableWrap = ({ children, narrow }: { children: Child; narrow?: boolean }) => (
  <div class="overflow-x-auto">
    {/* `narrow` for tables that live inside a half-width panel. Without it the
        42rem floor forces a scrollbar on a column layout that had room, and the
        last column — which is usually the button — ends up off the edge. */}
    <table class={`w-full text-sm ${narrow ? "min-w-[24rem]" : "min-w-[42rem]"}`}>{children}</table>
  </div>
);

export const Th = ({ children, align }: { children?: Child; align?: "end" }) => (
  <th
    scope="col"
    class={`whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground ${
      align === "end" ? "text-end" : "text-start"
    }`}
  >
    {children}
  </th>
);

export const Td = (
  { children, align, mono, wrap }:
  { children?: Child; align?: "end"; mono?: boolean; wrap?: boolean },
) => (
  <td
    class={
      "px-3 py-2 align-middle " +
      (align === "end" ? "text-end tnum " : "") +
      (mono ? "font-mono text-xs " : "") +
      (wrap ? "" : "whitespace-nowrap")
    }
  >
    {children}
  </td>
);

export const Empty = ({ children }: { children: Child }) => (
  <div class="rounded-xl border border-dashed border-input bg-card px-6 py-12 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

type Tone = "neutral" | "good" | "warn" | "bad";

export const Pill = ({ tone = "neutral", children }: { tone?: Tone; children: Child }) => {
  const tones: Record<Tone, string> = {
    neutral: "bg-muted text-muted-foreground",
    good: "bg-accent text-accent-foreground",
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    bad: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  };
  return (
    <span class={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
};

/** The status of a document, in one place so the four pages agree. */
export const DocStatus = (
  { status, deletedAt }: { status: string; deletedAt?: number | null },
) => {
  if (deletedAt) return <Pill tone="neutral">Deleted</Pill>;
  if (status === "blocked") return <Pill tone="bad">Blocked</Pill>;
  if (status === "processing") return <Pill tone="warn">Processing</Pill>;
  return <Pill tone="good">Ready</Pill>;
};

/**
 * The 7/30/90 switch, as three links rather than a select.
 *
 * Links mean the range is in the URL, so a view is shareable and the back
 * button works. A select would need JavaScript to do anything at all.
 */
export const RangePicker = ({ path, active }: { path: string; active: string }) => (
  <div class="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
    {["7d", "30d", "90d"].map((range) => (
      <a
        href={`${path}?range=${range}`}
        aria-current={range === active ? "true" : undefined}
        class={
          "rounded px-2.5 py-1 font-medium transition-colors " +
          (range === active
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground")
        }
      >
        {range}
      </a>
    ))}
  </div>
);
