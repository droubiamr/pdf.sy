// The console's frame: <html> down to the content area.
//
// Deliberately NOT the site Layout. That one carries a marketing header, a
// footer, a beta dialog and the language switch, and reads its copy out of the
// translation files — none of which belongs in an internal tool. Sharing it
// would also mean every future change to the public chrome had to be checked
// against the admin pages, which is exactly the coupling worth avoiding.
//
// What IS shared is THEME_JS, imported from the site layout rather than copied.
// The Content-Security-Policy allows inline scripts by SHA-256 hash, so a
// second copy of that script — even a byte-identical one — would be a second
// hash to keep in the allowlist. One constant, one hash, no drift.
import type { Child, FC } from "hono/jsx";
import { THEME_JS } from "../layout";
import {
  BarChart, FileText, Link2, Moon, ScrollText, Server, Shield,
  Sun, Users, Wallet,
} from "../icons";

export type NavKey =
  | "overview" | "documents" | "engagement" | "accounts"
  | "revenue" | "moderation" | "system" | "audit";

const NAV: { key: NavKey; label: string; href: string; icon: FC<{ class?: string }> }[] = [
  { key: "overview",   label: "Overview",   href: "/admin",            icon: BarChart },
  { key: "documents",  label: "Documents",  href: "/admin/documents",  icon: FileText },
  { key: "engagement", label: "Engagement", href: "/admin/engagement", icon: Link2 },
  { key: "accounts",   label: "Accounts",   href: "/admin/accounts",   icon: Users },
  { key: "revenue",    label: "Revenue",    href: "/admin/revenue",    icon: Wallet },
  { key: "moderation", label: "Moderation", href: "/admin/moderation", icon: Shield },
  { key: "system",     label: "System",     href: "/admin/system",     icon: Server },
  { key: "audit",      label: "Audit log",  href: "/admin/audit",      icon: ScrollText },
];

type Props = {
  title: string;
  active: NavKey;
  adminEmail: string;
  /** Unresolved-work counts, rendered as a pill beside the nav item. */
  badges?: Partial<Record<NavKey, number>>;
  /** Right-hand side of the header — the range picker, usually. */
  toolbar?: Child;
  children?: Child;
};

export const AdminShell = ({ title, active, adminEmail, badges, toolbar, children }: Props) => (
  <html lang="en" dir="ltr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · pdf.sy admin</title>
      {/* Belt and braces with the header set in requireAdmin: a page that is
          somehow served from cache should still never be indexed. */}
      <meta name="robots" content="noindex, nofollow" />
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
      />
      <link rel="stylesheet" href="/assets/app.css" />
      <script dangerouslySetInnerHTML={{ __html: THEME_JS }} />
      <script type="module" src="/assets/admin.js" defer />
    </head>

    <body class="min-h-dvh bg-background text-foreground">
      <div class="flex min-h-dvh">
        <Sidebar active={active} badges={badges} adminEmail={adminEmail} />

        <div class="flex min-w-0 flex-1 flex-col">
          <header class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur lg:px-6">
            <button
              type="button"
              class="btn-icon-outline lg:hidden"
              data-sidebar-toggle
              aria-label="Menu"
              aria-expanded="false"
            >
              <span aria-hidden="true" class="text-lg leading-none">≡</span>
            </button>

            <h1 class="truncate text-sm font-medium">{title}</h1>

            <div class="ms-auto flex items-center gap-2">
              {toolbar}
              <LivePulse />
              <button type="button" class="btn-icon-ghost" data-theme-toggle aria-label="Theme">
                <Sun class="size-4 dark:hidden" />
                <Moon class="hidden size-4 dark:block" />
              </button>
            </div>
          </header>

          <main class="flex-1 px-4 pb-20 pt-6 lg:px-6">
            <div class="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>

      {/* Closes the mobile sidebar. Inert on desktop, where the sidebar is
          always open and this never becomes visible. */}
      <div
        class="fixed inset-0 z-30 hidden bg-black/40 lg:!hidden"
        data-sidebar-backdrop
        hidden
      ></div>
    </body>
  </html>
);

/**
 * "Online now", polled by admin.js.
 *
 * Server-rendered as a dash rather than a zero: on first paint the honest
 * answer is "not asked yet", and a zero that flicks to four a second later
 * reads as a number that dropped.
 */
const LivePulse = () => (
  <span
    class="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground sm:inline-flex"
    data-live
    title="Sessions active in the last two minutes"
  >
    <span class="relative flex size-2">
      <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60"></span>
      <span class="relative inline-flex size-2 rounded-full bg-primary"></span>
    </span>
    <span class="tnum" data-live-count>—</span>
    <span>live</span>
  </span>
);

const Sidebar = (
  { active, badges, adminEmail }:
  { active: NavKey; badges?: Partial<Record<NavKey, number>>; adminEmail: string },
) => (
  <aside
    class="fixed inset-y-0 start-0 z-40 hidden w-60 shrink-0 flex-col border-e border-border bg-card lg:flex lg:static"
    data-sidebar
  >
    <div class="flex h-14 items-center gap-2 border-b border-border px-4">
      <a href="/" class="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <FileText class="size-4 text-primary" />
        pdf.sy
      </a>
      <span class="badge ms-auto text-[10px] uppercase tracking-wide">Admin</span>
    </div>

    <nav class="flex-1 overflow-y-auto p-3">
      <ul class="flex flex-col gap-0.5">
        {NAV.map(({ key, label, href, icon: Icon }) => {
          const current = key === active;
          const badge = badges?.[key];
          return (
            <li>
              <a
                href={href}
                aria-current={current ? "page" : undefined}
                class={
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors " +
                  (current
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                <Icon class="size-4 shrink-0" />
                <span class="truncate">{label}</span>
                {badge ? (
                  <span class="ms-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-white tnum">
                    {badge}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>

    <div class="border-t border-border p-3">
      <p class="truncate px-2.5 text-xs text-muted-foreground" title={adminEmail}>
        {adminEmail}
      </p>
      <div class="mt-2 flex flex-col gap-0.5">
        <a
          href="/dashboard"
          class="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ← My dashboard
        </a>
        <a
          href="/"
          class="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ↗ Public site
        </a>
      </div>
    </div>
  </aside>
);
