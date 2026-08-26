import type { Context } from "hono";
import type { Child } from "hono/jsx";
import { FileText, Menu, Moon, Sun, X } from "./icons";
import type { Env } from "../lib/context";
import { isAdminEmail } from "../lib/admin";
import type { Strings } from "../lib/strings/en";
import { clientJson, dirOf, switchHref, t, type Lang } from "../lib/i18n";

/** Keys the "you have seen the beta notice" flag. Bump it to show it again. */
const LAUNCH_DATE = "2026-09-09";

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
export const THEME_JS = `(function(){
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
  /**
   * The request itself.
   *
   * The layout needs three things off it — the language, the signed-in user,
   * and the current path for the language switch — and all three were already
   * being threaded through by hand. Taking the context instead means a new
   * page physically cannot forget one of them.
   */
  c: Context<Env>;
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
};

export const Layout = ({ c, title, description, children, script, bare, noindex }: Props) => {
  const lang = c.get("lang");
  const user = c.get("user");
  const s = t(c);
  const url = new URL(c.req.url);

  return (
    <html lang={lang} dir={dirOf(lang)}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {noindex && <meta name="robots" content="noindex, nofollow" />}
        {description && <meta name="description" content={description} />}
        <meta property="og:title" content={title} />
        {description && <meta property="og:description" content={description} />}
        <meta property="og:locale" content={lang === "ar" ? "ar_SY" : "en_GB"} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />

        {/* Only a Latin page needs Google's copy of Inter. IBM Plex Sans Arabic
            is served from our own origin and carries both scripts, so an Arabic
            page contacts no third party for its type at all. */}
        {lang !== "ar" && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
            <link
              rel="stylesheet"
              href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
            />
          </>
        )}

        {/* The one weight the first paint of an Arabic page cannot do without.
            Without this the browser only discovers the font after parsing the
            stylesheet, and the heading arrives in a fallback face first. */}
        {lang === "ar" && (
          <link
            rel="preload"
            as="font"
            type="font/woff2"
            crossorigin=""
            href="/assets/fonts/plex-arabic-400.woff2"
          />
        )}

        <link rel="stylesheet" href="/assets/app.css" />
        <script dangerouslySetInnerHTML={{ __html: THEME_JS }} />
        {script && <script type="module" src={script} defer />}
      </head>
      <body class="min-h-dvh flex flex-col">
        {!bare && (
          <SiteHeader
            s={s} user={user} lang={lang} path={url.pathname + url.search}
            isAdmin={isAdminEmail(c.env, user?.email)}
          />
        )}
        <main class="flex-1">{children}</main>
        {!bare && <SiteFooter s={s} />}
        {!bare && <BetaDialog s={s} />}

        {/* Strings for whichever bundle this page asked for. A data block, not
            a script — see clientJson() in lib/i18n.ts for why the strict CSP
            has nothing to say about it. */}
        {script && (
          <script
            type="application/json"
            id="i18n"
            dangerouslySetInnerHTML={{ __html: clientJson(lang) }}
          />
        )}
      </body>
    </html>
  );
};

/* -------------------------------------------------------------------------- */
/*  Beta notice                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Opened by the Beta badge in the header, and once by itself on a first visit.
 *
 * The native <dialog> element with Basecoat's `.dialog` class doing the
 * styling, so the backdrop, transitions and Escape-to-close are all the
 * browser's own behaviour rather than something to maintain.
 */
const BetaDialog = ({ s }: { s: Strings }) => (
  <>
    <dialog class="dialog w-full max-w-md" id="beta-dialog" aria-labelledby="beta-title">
      <article class="rounded-xl border border-border bg-card p-6 shadow-lg">
        <header class="mb-3 flex flex-col gap-1">
          <span class="badge bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100">
            {s.beta.badge}
          </span>
          <h2 id="beta-title" class="mt-1 text-xl font-semibold tracking-tight">
            {s.beta.title}
          </h2>
          <p class="text-sm text-muted-foreground">
            {s.beta.leadPlain}{" "}
            <strong class="font-medium text-foreground">{s.beta.leadStrong}</strong>
          </p>
        </header>

        <section class="flex flex-col gap-3 text-sm">
          <p class="text-muted-foreground">{s.beta.body}</p>
          <ul class="flex flex-col gap-1.5 text-muted-foreground">
            <li class="flex gap-2">
              <span aria-hidden="true" class="text-primary">✓</span>
              {s.beta.item1}
            </li>
            <li class="flex gap-2">
              <span aria-hidden="true" class="text-primary">✓</span>
              {s.beta.item2}
            </li>
            <li class="flex gap-2">
              <span aria-hidden="true" class="text-primary">✓</span>
              {s.beta.item3}
            </li>
            <li class="flex gap-2">
              <span aria-hidden="true" class="text-muted-foreground/60">•</span>
              {s.beta.item4}
            </li>
          </ul>
          <p class="text-muted-foreground">{s.beta.expiry}</p>
        </section>

        <footer class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-beta-close class="btn" data-variant="outline">
            {s.beta.gotIt}
          </button>
          <a href="/new" class="btn" data-beta-close>
            {s.beta.tryIt}
          </a>
        </footer>
      </article>
    </dialog>

    <script dangerouslySetInnerHTML={{ __html: BETA_JS }} />
  </>
);

/**
 * A row of links on a wide screen; a full-width row inside the dropdown on a
 * narrow one. Centred label text reads as a button and start-aligned reads as
 * a menu, which is exactly the difference between the two cases.
 *
 * `justify-start` is logical, so the menu aligns to the left in English and to
 * the right in Arabic without a second class.
 */
const navItem = "btn w-full justify-start sm:w-auto sm:justify-center";

/**
 * The links collapse below `sm`, but the two switches and the one action this
 * site exists for do not. All are small, and a visitor on a phone who has to
 * open a menu to share a PDF has been asked for a tap that buys nothing.
 *
 * Every margin that pushes something to one end is logical — `ms-auto`, not
 * `ml-auto` — so the whole header mirrors itself under `dir="rtl"` with no
 * Arabic-specific rule anywhere.
 */
const SiteHeader = ({
  s, user, lang, path, isAdmin,
}: { s: Strings; user: SessionUser; lang: Lang; path: string; isAdmin: boolean }) => (
  <>
    <header class="relative border-b border-border">
      <div class="mx-auto flex h-16 w-full max-w-5xl items-center gap-4 px-5">
        <div class="flex items-center gap-2">
          <a href={user ? "/dashboard" : "/"} class="flex items-center gap-2 font-semibold tracking-tight">
            <FileText class="size-5 text-primary" />
            pdf.sy
          </a>

          {/* `.badge` and `[data-tooltip]` are both Basecoat's. The `before:`
              overrides are the tooltip's: it clips to the badge's own overflow
              and sizes itself against the badge's width, neither of which
              suits a sentence this long. */}
          <button
            type="button"
            data-beta-open
            aria-label={s.beta.tipLabel}
            data-tooltip={s.beta.tip}
            data-side="bottom"
            data-align="start"
            class="badge cursor-pointer overflow-visible bg-sky-100 text-sky-900 before:w-64 before:font-normal before:whitespace-normal hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-100 dark:hover:bg-sky-900"
          >
            {s.beta.badge}
          </button>
        </div>

        {/* Out of flow and under the header below `sm`, an ordinary flex row
            above it. `hidden` is the closed state; `sm:flex` outranks it, so
            the desktop layout never depends on the script having run. */}
        <nav
          id="site-nav"
          class="absolute inset-x-0 top-full z-20 hidden flex-col gap-1 border-b border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg sm:static sm:ms-auto sm:flex sm:flex-row sm:items-center sm:gap-1 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
        >
          <a href="/tools" class={navItem} data-variant="ghost" data-size="sm">{s.nav.tools}</a>
          <a href="/pricing" class={navItem} data-variant="ghost" data-size="sm">{s.nav.pricing}</a>
          {user ? (
            <>
              {/* Drawn only for an address on the ADMIN_EMAILS allowlist, so
                  nobody else is told the console exists. It is a shortcut, not
                  the lock: /admin re-checks independently and 404s regardless
                  of whether this link was ever rendered. */}
              {isAdmin && (
                <a
                  href="/admin"
                  class={`${navItem} text-primary`}
                  data-variant="ghost" data-size="sm"
                >
                  {s.nav.admin}
                </a>
              )}
              <a href="/dashboard" class={navItem} data-variant="ghost" data-size="sm">{s.nav.yourLinks}</a>
              <form method="post" action="/api/auth/logout" class="w-full sm:w-auto">
                <button type="submit" class={navItem} data-variant="ghost" data-size="sm">{s.nav.signOut}</button>
              </form>
            </>
          ) : (
            <a href="/login" class={navItem} data-variant="ghost" data-size="sm">{s.nav.signIn}</a>
          )}
        </nav>

        {/* The action first, then the switches and the menu as one group. */}
        <div class="ms-auto flex items-center gap-1 sm:ms-0">
          <a href="/new" class="btn" data-size="sm">{s.nav.share}</a>
          <LanguageToggle s={s} lang={lang} path={path} />
          <ThemeToggle s={s} />
          <MenuButton s={s} />
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
const MenuButton = ({ s }: { s: Strings }) => (
  <button
    type="button"
    data-menu-button
    class="btn group sm:hidden"
    data-variant="ghost"
    data-size="icon-sm"
    aria-controls="site-nav"
    aria-expanded="false"
    aria-label={s.nav.menu}
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
const ThemeToggle = ({ s }: { s: Strings }) => (
  <button
    type="button"
    data-theme-toggle
    class="btn"
    data-variant="ghost"
    data-size="icon-sm"
    title={s.nav.themeTitle}
    aria-label={s.nav.themeLabel}
  >
    <Sun class="hidden dark:block" aria-hidden="true" />
    <Moon class="dark:hidden" aria-hidden="true" />
  </button>
);

/**
 * The language switch, sitting immediately before the theme switch so the two
 * read as a pair of preferences rather than two unrelated controls.
 *
 * A link, not a button: the choice is a real navigation with a real URL, so it
 * works with JavaScript disabled, survives a middle-click into a new tab, and
 * needs no client code at all. The label always names the language you would
 * be moving *to* — showing the current one is the classic version of this
 * control that nobody can read.
 *
 * Same `btn` / `ghost` / `icon-sm` combination as the theme switch next to it,
 * with nothing layered on top — two controls that sit together should be the
 * same control at different jobs, and Basecoat's icon-sm is a 2rem square that
 * a two-letter label fits inside without any help.
 *
 * `lang` and `dir` on the element itself matter more than they look: without
 * them a screen reader in an Arabic page announces "EN" with Arabic phonetics,
 * and the browser may shape the Latin letters against the surrounding RTL run.
 */
const LanguageToggle = ({
  s, lang, path,
}: { s: Strings; lang: Lang; path: string }) => {
  const other: Lang = lang === "ar" ? "en" : "ar";

  return (
    <a
      href={switchHref(path, other)}
      class="btn"
      data-variant="ghost"
      data-size="icon-sm"
      lang={other}
      dir={dirOf(other)}
      title={s.meta.otherLangName}
      aria-label={s.meta.switchLabel}
    >
      {s.meta.otherLangShort}
    </a>
  );
};

const SiteFooter = ({ s }: { s: Strings }) => (
  <footer class="border-t border-border">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-2 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
      <p>{s.footer.tagline}</p>
      <nav class="flex gap-4 sm:ms-auto">
        <a href="/privacy" class="hover:text-foreground">{s.footer.privacy}</a>
        <a href="/terms" class="hover:text-foreground">{s.footer.terms}</a>
        <a href="/report" class="hover:text-foreground">{s.footer.report}</a>
      </nav>
    </div>
  </footer>
);
