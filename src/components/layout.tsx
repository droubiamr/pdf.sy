import type { Child } from "hono/jsx";
import { FileText } from "./icons";

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
      <script
        // Respect the OS theme before first paint so the page never flashes white.
        dangerouslySetInnerHTML={{
          __html:
            "if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')",
        }}
      />
      {script && <script type="module" src={script} defer />}
    </head>
    <body class="min-h-dvh flex flex-col">
      {!bare && <SiteHeader user={user} />}
      <main class="flex-1">{children}</main>
      {!bare && <SiteFooter />}
    </body>
  </html>
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
