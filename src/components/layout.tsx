import type { Child } from "hono/jsx";
import { FileText, Menu, Moon, Sun, X } from "./icons";

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

// Theme. A choice made here wins; with no choice on record the OS decides and
// keeps deciding, so someone who never touches the switch still gets dark mode
// when their machine turns dark at sunset.
//
// It runs in <head>, before first paint, so the page never flashes the wrong
// colour. The switch itself is handled by a listener on `document` rather than
// on the button: the button has not been parsed yet at this point, and a
// delegated listener does not care.
const THEME_JS = `(function(){
  var KEY = 'pdfsy-theme';
  var root = document.documentElement;
  var os = matchMedia('(prefers-color-scheme: dark)');

  function chosen(){ try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(theme){ root.classList.toggle('dark', theme === 'dark'); }

  apply(chosen() || (os.matches ? 'dark' : 'light'));

  os.addEventListener('change', function(e){
    if (!chosen()) apply(e.matches ? 'dark' : 'light');
  });

  document.addEventListener('click', function(e){
    var el = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!el) return;
    var next = root.classList.contains('dark') ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch (err) {}
  });
})();`;

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

// Below `sm` the header's links collapse behind a button. Everything visual is
// CSS — this only flips the display classes and `aria-expanded`, and the icon
// swap follows from the attribute. Closing on Escape or on a click elsewhere is
// what a menu is expected to do; neither is free from CSS alone.
const MENU_JS = `(function(){
  var btn = document.querySelector('[data-menu-button]');
  var nav = document.getElementById('site-nav');
  if (!btn || !nav) return;

  function set(open){
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    // Both, not just 'hidden': a <nav> falls back to display:block, and the
    // panel's gaps and stacking are a flex column.
    nav.classList.toggle('hidden', !open);
    nav.classList.toggle('flex', open);
  }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    set(btn.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('click', function(e){ if (!nav.contains(e.target)) set(false); });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') set(false); });
})();`;

/** Every inline script on the site. The CSP hashes this list and nothing else. */
export const INLINE_SCRIPTS: readonly string[] = [THEME_JS, BETA_JS, MENU_JS];

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

/**
 * A row of links on a wide screen; a full-width row inside the dropdown on a
 * narrow one. Centred label text reads as a button and left-aligned reads as a
 * menu, which is exactly the difference between the two cases.
 */
const navItem = "btn w-full justify-start sm:w-auto sm:justify-center";

/**
 * The links collapse below `sm`, but the theme switch and the one action this
 * site exists for do not. Both are small, and a visitor on a phone who has to
 * open a menu to share a PDF has been asked for a tap that buys nothing.
 */
const SiteHeader = ({ user }: { user: SessionUser }) => (
  <>
    <header class="relative border-b border-border">
      <div class="mx-auto flex h-16 w-full max-w-5xl items-center gap-4 px-5">
        <a href={user ? "/dashboard" : "/"} class="flex items-center gap-2 font-semibold tracking-tight">
          <FileText class="size-5 text-primary" />
          pdf.sy
        </a>

        {/* Out of flow and under the header below `sm`, an ordinary flex row
            above it. `hidden` is the closed state; `sm:flex` outranks it, so
            the desktop layout never depends on the script having run. */}
        <nav
          id="site-nav"
          class="absolute inset-x-0 top-full z-20 hidden flex-col gap-1 border-b border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg sm:static sm:ml-auto sm:flex sm:flex-row sm:items-center sm:gap-1 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
        >
          <a href="/tools" class={navItem} data-variant="ghost" data-size="sm">Tools</a>
          <a href="/pricing" class={navItem} data-variant="ghost" data-size="sm">Pricing</a>
          {user ? (
            <>
              <a href="/dashboard" class={navItem} data-variant="ghost" data-size="sm">Your links</a>
              <form method="post" action="/api/auth/logout" class="w-full sm:w-auto">
                <button type="submit" class={navItem} data-variant="ghost" data-size="sm">Sign out</button>
              </form>
            </>
          ) : (
            <a href="/login" class={navItem} data-variant="ghost" data-size="sm">Sign in</a>
          )}
        </nav>

        {/* The action first, then the two icon buttons together as a pair. */}
        <div class="ml-auto flex items-center gap-1 sm:ml-0">
          <a href="/new" class="btn" data-size="sm">Share a PDF</a>
          <ThemeToggle />
          <MenuButton />
        </div>
      </div>
    </header>

    <script dangerouslySetInnerHTML={{ __html: MENU_JS }} />
  </>
);

/**
 * The icon follows `aria-expanded` rather than a class of its own, so the
 * attribute a screen reader is told about and the one a sighted visitor sees
 * cannot drift apart — there is only the one.
 */
const MenuButton = () => (
  <button
    type="button"
    data-menu-button
    class="btn group sm:hidden"
    data-variant="ghost"
    data-size="icon-sm"
    aria-controls="site-nav"
    aria-expanded="false"
    aria-label="Menu"
  >
    <Menu class="group-aria-expanded:hidden" aria-hidden="true" />
    <X class="hidden group-aria-expanded:block" aria-hidden="true" />
  </button>
);

/**
 * One button, two icons, and only ever one of them drawn. Which one is a
 * question of what the page currently looks like, so CSS answers it — nothing
 * has to be re-rendered or kept in sync when the theme changes.
 *
 * The label is deliberately state-free. The server cannot know which theme the
 * browser will land on, so a name like "Switch to dark mode" would be a coin
 * toss in the accessibility tree until JavaScript corrected it.
 */
const ThemeToggle = () => (
  <button
    type="button"
    data-theme-toggle
    class="btn"
    data-variant="ghost"
    data-size="icon-sm"
    title="Switch theme"
    aria-label="Switch between light and dark mode"
  >
    <Sun class="hidden dark:block" aria-hidden="true" />
    <Moon class="dark:hidden" aria-hidden="true" />
  </button>
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
