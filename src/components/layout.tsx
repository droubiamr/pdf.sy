import type { Child } from "hono/jsx";
import { FileText } from "./icons";

/** Public launch. One constant, so the banner and the dialog cannot disagree. */
const LAUNCH_DATE = "2026-09-09";
const LAUNCH_LABEL = "9 September 2026";

/* -------------------------------------------------------------------------- */
/*  Inline scripts                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Both inline blocks live here as constants because the Content-Security-Policy
 * allows them by SHA-256 hash. `lib/security.ts` hashes exactly these strings,
 * so the script that runs and the script that was measured are the same bytes
 * by construction rather than by anyone remembering to keep two copies in step.
 *
 * Editing either string changes its hash, and the policy follows automatically.
 * Adding a third inline script means adding it to INLINE_SCRIPTS below, or the
 * browser will refuse to run it.
 */

// Respect the OS theme before first paint so the page never flashes white.
const THEME_JS =
  "if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')";

// Shown once per browser. A notice that reappears on every page load is not
// informative, it is just in the way.
const BETA_JS = `(function(){
  var KEY = 'pdfsy-beta-seen-${LAUNCH_DATE}';
  var d = document.getElementById('beta-dialog');
  if (!d) return;

  var days = Math.ceil((Date.parse('${LAUNCH_DATE}T00:00:00Z') - Date.now()) / 86400000);
  if (days > 0) {
    document.querySelectorAll('[data-beta-countdown]').forEach(function(el){
      el.textContent = ' — ' + days + (days === 1 ? ' day' : ' days') + ' away';
    });
  }

  var seen;
  try { seen = localStorage.getItem(KEY); } catch (e) { seen = '1'; }
  if (!seen && typeof d.showModal === 'function') d.showModal();

  function remember(){ try { localStorage.setItem(KEY, '1'); } catch (e) {} }

  d.addEventListener('close', remember);
  document.querySelectorAll('[data-beta-close]').forEach(function(el){
    el.addEventListener('click', function(){ remember(); d.close(); });
  });
  document.querySelectorAll('[data-beta-open]').forEach(function(el){
    el.addEventListener('click', function(){ if (d.showModal) d.showModal(); });
  });
})();`;

/** Every inline script on the site. The CSP hashes this list and nothing else. */
export const INLINE_SCRIPTS: readonly string[] = [THEME_JS, BETA_JS];

type SessionUser = { email: string } | null | undefined;

type Props = {
  title: string;
  description?: string;
  children?: Child;
  /** The viewer and tool pages load their own bundle. */
  script?: string;
  /** Viewer pages drop the site chrome so the document owns the screen. */
  bare?: boolean;
  /**
   * Keep the page out of search results. Every page that renders someone's
   * uploaded document sets this: a shared link is private by intent even
   * though it is unauthenticated, and a contract turning up in Google would
   * be the single worst thing this product could do to a customer.
   */
  noindex?: boolean;
  /** Resolved by middleware; undefined on pages that never look. */
  user?: SessionUser;
};

export const Layout = ({ title, description, children, script, bare, noindex, user }: Props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {description && <meta name="description" content={description} />}
      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
      />
      <link rel="stylesheet" href="/assets/app.css" />
      <script dangerouslySetInnerHTML={{ __html: THEME_JS }} />
      {script && <script type="module" src={script} defer />}
    </head>
    <body class="min-h-dvh flex flex-col">
      {/* Deliberately not on `bare` pages: someone opening a document they were
          sent is a guest, and interrupting them to explain our release schedule
          would be about us rather than about them. */}
      {!bare && <BetaBanner />}
      {!bare && <SiteHeader user={user} />}
      <main class="flex-1">{children}</main>
      {!bare && <SiteFooter />}
      {!bare && <BetaDialog />}
    </body>
  </html>
);

/* -------------------------------------------------------------------------- */
/*  Beta notice                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A strip that always shows, plus a dialog on the first visit only.
 *
 * The dialog is the native <dialog> element with Basecoat's `.dialog` class
 * doing the styling, so the backdrop, transitions and Escape-to-close are all
 * the browser's own behaviour rather than something to maintain.
 */
const BetaBanner = () => (
  <div class="border-b border-accent-foreground/15 bg-accent text-accent-foreground">
    <div class="mx-auto flex w-full max-w-5xl items-center gap-3 px-5 py-2 text-sm">
      <span class="rounded-full bg-accent-foreground/10 px-2 py-0.5 text-xs font-semibold tracking-wide uppercase">
        Beta
      </span>
      <p class="min-w-0">
        <span class="font-medium">pdf.sy is still being built.</span>{" "}
        <span class="hidden sm:inline">Full launch {LAUNCH_LABEL}.</span>
      </p>
      <button
        type="button"
        data-beta-open
        class="ml-auto shrink-0 text-xs font-medium underline underline-offset-4 hover:opacity-80"
      >
        What works today?
      </button>
    </div>
  </div>
);

const BetaDialog = () => (
  <>
    <dialog class="dialog w-full max-w-md" id="beta-dialog" aria-labelledby="beta-title">
      <article class="rounded-xl border border-border bg-card p-6 shadow-lg">
        <header class="mb-3 flex flex-col gap-1">
          <span class="badge w-fit rounded-full bg-accent px-2 py-0.5 text-xs font-semibold tracking-wide text-accent-foreground uppercase">
            Beta
          </span>
          <h2 id="beta-title" class="mt-1 text-xl font-semibold tracking-tight">
            You are early
          </h2>
          <p class="text-sm text-muted-foreground">
            pdf.sy launches properly on{" "}
            <strong class="font-medium text-foreground">{LAUNCH_LABEL}</strong>
            <span data-beta-countdown />.
          </p>
        </header>

        <section class="flex flex-col gap-3 text-sm">
          <p class="text-muted-foreground">
            Everything here is real and working, but it is being changed daily.
            Please do not rely on it for anything that matters yet.
          </p>
          <ul class="flex flex-col gap-1.5 text-muted-foreground">
            <li class="flex gap-2">
              <span aria-hidden="true" class="text-primary">✓</span>
              Share a PDF and get a tracked link
            </li>
            <li class="flex gap-2">
              <span aria-hidden="true" class="text-primary">✓</span>
              See who opened it and which pages they read
            </li>
            <li class="flex gap-2">
              <span aria-hidden="true" class="text-primary">✓</span>
              Free tools that never upload your file
            </li>
            <li class="flex gap-2">
              <span aria-hidden="true" class="text-muted-foreground/60">•</span>
              Accounts and paid plans are still being wired up
            </li>
          </ul>
          <p class="text-muted-foreground">
            Links made without an account are deleted after seven days, so keep
            your own copy of anything you upload.
          </p>
        </section>

        <footer class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-beta-close class="btn" data-variant="outline">
            Got it
          </button>
          <a href="/new" class="btn" data-beta-close>
            Try it anyway
          </a>
        </footer>
      </article>
    </dialog>

    <script dangerouslySetInnerHTML={{ __html: BETA_JS }} />
  </>
);

const SiteHeader = ({ user }: { user: SessionUser }) => (
  <header class="border-b border-border">
    <div class="mx-auto flex h-16 w-full max-w-5xl items-center gap-6 px-5">
      <a href={user ? "/dashboard" : "/"} class="flex items-center gap-2 font-semibold tracking-tight">
        <FileText class="size-5 text-primary" />
        pdf.sy
      </a>
      <nav class="ml-auto flex items-center gap-1 text-sm">
        <a href="/tools" class="btn" data-variant="ghost" data-size="sm">Tools</a>
        <a href="/pricing" class="btn" data-variant="ghost" data-size="sm">Pricing</a>
        {user ? (
          <>
            <a href="/dashboard" class="btn" data-variant="ghost" data-size="sm">Your links</a>
            <form method="post" action="/api/auth/logout">
              <button type="submit" class="btn" data-variant="ghost" data-size="sm">Sign out</button>
            </form>
          </>
        ) : (
          <a href="/login" class="btn" data-variant="ghost" data-size="sm">Sign in</a>
        )}
        <a href="/new" class="btn" data-size="sm">Share a PDF</a>
      </nav>
    </div>
  </header>
);

const SiteFooter = () => (
  <footer class="border-t border-border">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-2 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
      <p>pdf.sy — send a PDF as a link, and see what happens to it.</p>
      <nav class="flex gap-4 sm:ml-auto">
        <a href="/privacy" class="hover:text-foreground">Privacy</a>
        <a href="/terms" class="hover:text-foreground">Terms</a>
        <a href="/report" class="hover:text-foreground">Report a file</a>
      </nav>
    </div>
  </footer>
);
