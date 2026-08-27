// /contribute — the internal documents, and the editor for them.
//
// Three routes and one table. The page renders markdown out of `internal_docs`;
// `?edit=1` swaps the rendered document for a textarea holding its source; a
// POST saves it and redirects back.
//
// The editor is a plain <form>. No client bundle, no autosave, no editor
// library — which means it works with JavaScript switched off, there is no
// browser-generated HTML to sanitise on the way in, and the strict CSP has
// nothing new to allow. The whole feature is the textarea and two buttons.
//
// Not the site Layout, and not AdminShell either. The first carries marketing
// chrome, a beta dialog and the language switch; the second is dashboard
// furniture — a sidebar and a live-counter poll — which is the wrong shape for
// something read top to bottom. What IS shared is THEME_JS, imported rather
// than copied: the CSP allows inline scripts by hash, so a second byte-
// identical copy would be a second hash to keep in the allowlist.
import { Hono } from "hono";
import type { Child } from "hono/jsx";
import type { Env } from "../lib/context";
import { requireContributor } from "../lib/admin";
import { renderMarkdown, type Heading } from "../lib/markdown";
import { THEME_JS } from "../components/layout";
import { FileText } from "../components/icons";
import { CONTRIBUTE_BODY, CONTRIBUTE_TITLE } from "./contribute-body";

export const contribute = new Hono<Env>();

contribute.use("/contribute", requireContributor);
contribute.use("/contribute/*", requireContributor);

/** The only document today. A column rather than a constant so a second one
 *  costs a row instead of a route. */
const SLUG = "contribute";

type Doc = {
  title: string;
  body: string;
  updated_at: number | null;
  updated_by: string | null;
};

/**
 * The stored document, or the version compiled into the Worker.
 *
 * The fallback is what makes a fresh clone useful: no seed row in the
 * migration, no empty page, and the first save is what creates the row. A
 * missing table falls back too — the page is worth more than the error.
 */
async function loadDoc(db: D1Database): Promise<Doc> {
  const fallback: Doc = {
    title: CONTRIBUTE_TITLE,
    body: CONTRIBUTE_BODY,
    updated_at: null,
    updated_by: null,
  };

  try {
    const row = await db
      .prepare(`SELECT title, body, updated_at, updated_by FROM internal_docs WHERE slug = ?`)
      .bind(SLUG)
      .first<Doc>();
    return row ?? fallback;
  } catch (error) {
    console.error("internal_docs read failed, serving the compiled default", error);
    return fallback;
  }
}

const formatSaved = (at: number | null, by: string | null): string | null => {
  if (!at) return null;
  const when = new Date(at).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return by ? `Last edited ${when} by ${by}` : `Last edited ${when}`;
};

/* -------------------------------------------------------------------------- */
/*  Read                                                                       */
/* -------------------------------------------------------------------------- */

contribute.get("/contribute", async (c) => {
  const doc = await loadDoc(c.env.DB);
  const editing = c.req.query("edit") === "1";
  const saved = c.req.query("saved") === "1";

  if (editing) return c.html(<Editor doc={doc} />);

  const { html, headings } = renderMarkdown(doc.body);

  return c.html(
    <Shell title={doc.title}>
      <div class="mx-auto grid w-full max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_220px] lg:py-14">
        {/* The document first in the DOM, the contents rail second, so a screen
            reader and a narrow screen both get the thing they came for before
            the navigation. `lg:order-2` puts the rail back on the right when
            there is room for it. */}
        <article class="min-w-0 max-w-[72ch]">
          {saved && (
            <p class="mb-6 rounded-lg border border-primary bg-accent px-4 py-2.5 text-sm text-accent-foreground">
              Saved.
            </p>
          )}

          <header class="mb-10">
            <p class="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-primary">
              Contributor brief
            </p>
            <h1 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {doc.title}
            </h1>
            {formatSaved(doc.updated_at, doc.updated_by) && (
              <p class="mt-3 text-sm text-muted-foreground">
                {formatSaved(doc.updated_at, doc.updated_by)}
              </p>
            )}
          </header>

          {/* The one place raw HTML is injected. It comes from lib/markdown.ts,
              which escapes every character before it parses anything, so the
              string here cannot contain markup that did not originate with the
              renderer itself. */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </article>

        <Contents headings={headings} />
      </div>
    </Shell>,
  );
});

/* -------------------------------------------------------------------------- */
/*  Write                                                                      */
/* -------------------------------------------------------------------------- */

contribute.post("/contribute", async (c) => {
  const user = c.get("user")!;
  const form = await c.req.formData();

  const title = String(form.get("title") ?? "").trim().slice(0, 200) || CONTRIBUTE_TITLE;

  // Newlines normalised to LF before storing. A <textarea> submits its value
  // with CRLF line endings — that is the HTML spec, not a browser quirk — so
  // without this the stored document grows a \r on every line and no longer
  // matches the seed constant it came from. The renderer copes with CRLF
  // either way; the point is that what lands in the database is clean.
  const body = String(form.get("body") ?? "").replace(/\r\n?/g, "\n");

  // An empty body is almost always a mis-click on a page that failed to load
  // its own content, and the cost of being wrong is somebody's document. Bounce
  // back to the editor rather than writing the deletion.
  if (!body.trim()) return c.redirect("/contribute?edit=1", 303);

  await c.env.DB.prepare(
    `INSERT INTO internal_docs (slug, title, body, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (slug) DO UPDATE SET
       title = excluded.title,
       body = excluded.body,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  )
    .bind(SLUG, title, body, Date.now(), user.email)
    .run();

  // 303 so a refresh of the resulting page is a GET and cannot re-post.
  return c.redirect("/contribute?saved=1", 303);
});

/* -------------------------------------------------------------------------- */
/*  Views                                                                      */
/* -------------------------------------------------------------------------- */

const Shell = ({ title, children }: { title: string; children: Child }) => (
  <html lang="en" dir="ltr">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · pdf.sy</title>
      {/* Belt and braces with the header set in requireContributor. */}
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
    </head>
    <body class="min-h-dvh bg-background text-foreground">
      <header class="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-5">
          <a href="/" class="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <FileText class="size-4 text-primary" />
            pdf.sy
          </a>
          <span class="badge text-[10px] uppercase tracking-wide">Internal</span>

          <div class="ms-auto flex items-center gap-2">
            <a href="/contribute?edit=1" class="btn" data-variant="outline" data-size="sm">
              Edit
            </a>
            <a
              href="/dashboard"
              class="hidden text-xs text-muted-foreground hover:text-foreground sm:inline"
            >
              ← Dashboard
            </a>
          </div>
        </div>
      </header>
      {children}
    </body>
  </html>
);

/**
 * The contents rail.
 *
 * Sticky, and entirely CSS — anchors and `scroll-mt-24` on the headings do the
 * whole job, so there is no scroll-spy script and nothing to allow in the CSP.
 * Only `##` headings are listed: a rail that mirrors every subheading stops
 * being a summary and becomes a second copy of the document.
 */
const Contents = ({ headings }: { headings: Heading[] }) => {
  const top = headings.filter((h) => h.level === 2);
  if (top.length < 3) return null;

  return (
    <nav
      aria-label="Contents"
      class="order-first hidden self-start border-s border-border lg:sticky lg:top-24 lg:order-none lg:block"
    >
      <p class="ps-4 pb-2 font-mono text-[11px] uppercase tracking-[0.09em] text-muted-foreground">
        Contents
      </p>
      <ul class="flex flex-col">
        {top.map((h) => (
          <li>
            <a
              href={`#${h.id}`}
              class="-ms-px block border-s-2 border-transparent py-1 ps-4 text-[13px] leading-snug text-muted-foreground hover:border-primary hover:text-foreground"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

/**
 * The editor.
 *
 * A textarea and two buttons. `spellcheck` is off because the document is most
 * of the way to being source code — file paths and identifiers underlined in
 * red make it harder to read, not easier.
 */
const Editor = ({ doc }: { doc: Doc }) => (
  <Shell title={`Editing ${doc.title}`}>
    <form method="post" action="/contribute" class="mx-auto w-full max-w-4xl px-5 py-10">
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <div class="min-w-0 flex-1">
          <label for="title" class="mb-1.5 block text-sm font-medium">Title</label>
          <input id="title" name="title" class="input" value={doc.title} maxlength={200} required />
        </div>
        <div class="flex gap-2">
          <a href="/contribute" class="btn" data-variant="ghost">Cancel</a>
          <button type="submit" class="btn">Save</button>
        </div>
      </div>

      <label for="body" class="mb-1.5 block text-sm font-medium">Body</label>
      <p class="mb-2 text-xs text-muted-foreground">
        Markdown. Headings, lists, tables, fenced code, links, <strong>bold</strong> and
        <code class="mx-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
          code
        </code>
        are supported. Raw HTML is shown as text rather than rendered.
      </p>

      <textarea
        id="body"
        name="body"
        spellcheck={false}
        class="input min-h-[70vh] w-full resize-y font-mono text-[13px] leading-relaxed"
      >
        {doc.body}
      </textarea>

      <div class="mt-4 flex justify-end gap-2">
        <a href="/contribute" class="btn" data-variant="ghost">Cancel</a>
        <button type="submit" class="btn">Save</button>
      </div>
    </form>
  </Shell>
);
