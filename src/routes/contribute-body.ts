// The contributor brief, as markdown.
//
// This is a *fallback*, not the source of truth. Once anybody saves the page,
// the row in `internal_docs` wins and this constant is never read again — it
// exists so a fresh clone, or a database that has not been migrated yet, still
// shows the document instead of an empty page.
//
// Which means: editing this file does NOT change what a deployed site shows,
// once that site has been edited even once. Edit the page itself for that. The
// one time to come back here is when the seed is genuinely wrong for somebody
// cloning the repo for the first time.

export const CONTRIBUTE_TITLE = "Joining pdf.sy";

export const CONTRIBUTE_BODY = `## The vision

**Today, pdf.sy is one thing: send a PDF as a link, and see what happens to it.**
You upload a PDF, get a short link, and find out who opened it, for how long,
and which page they stopped on. No attachment, no download prompt, no
"open in Acrobat". That is the product people pay for, and it is the hardest
part to copy.

**Where this is going is bigger: a full PDF platform, in the mould of
iLovePDF.** Merge, split, rotate, compress, convert, sign, OCR — the complete
toolbox someone reaches for when they have a PDF problem, with tracked sharing
as the one thing none of the incumbents offer.

The order is deliberate. Sharing comes first because it is what people pay for
and what makes the product defensible. The tools come next because they are
where the traffic is: "free PDF merge" is a search term with enormous volume,
and every visitor it brings is one click away from a tracked link. So the tools
are not a throwaway funnel — they are phase one of the real product surface,
and they should be built to be kept.

What does not change as that toolbox grows is the cost rule below. It matters
*more* on a full platform, not less: compress, convert and OCR are exactly the
operations where server CPU costs explode if you let them.

## Where it stands

Honest status. It is live, it works, and it is not launched.

| Capability | State | Notes |
| --- | --- | --- |
| Tracked links, viewer, per-page dwell | Shipped | Phase 1 |
| Accounts, dashboard, open notifications | Shipped | Phase 2 |
| Stripe paywall, link controls, versioning | Shipped | Phase 3, live-mode prices |
| Arabic and RTL | Shipped | Typed dictionaries |
| Admin console, eight pages | Shipped | Read-only plus moderation |
| Browser tools: merge, split, rotate | Shipped | The start of the toolbox |
| Turnstile bot protection | Code only | Secret not set in production |
| WAF rate-limiting rules | Not done | Dashboard config, cannot be coded |
| Compression | Phase 4 | Advertised as "soon" on the site |
| Teams, watermarks, custom domain, API | Phase 5 | Sold on the Pro card, not built |
| Automated tests | None | See "How we work" |

## The stack

Every choice here was made against an obvious alternative. Knowing why the
alternative lost is more useful than knowing what won.

| Concern | Choice | Instead of, and why |
| --- | --- | --- |
| App and API | Cloudflare Workers + Hono | Not Next.js. Runs at the edge, boots per request, no Node server to pay for. |
| Templating | Server-rendered JSX via \`hono/jsx\` | Not React. It looks like React and is not: no hooks, no state, no hydration. |
| Files | R2 | Not S3. Zero egress fees — serving PDFs is the entire cost model. |
| Database | D1, SQLite at the edge | Not Postgres. Raw SQL, no ORM. |
| UI components | Basecoat CSS | shadcn/ui without React. Use it before hand-rolling anything. |
| Styling | Tailwind v4 | Configured in CSS, not a JS config file. |
| Auth | Hand-written magic links | Not Better Auth — it needs an ORM adapter this project does not have. |
| Billing | Stripe over plain REST | Not the Stripe SDK. Four fetch calls beat a dependency that assumes Node. |
| Email | Resend | Falls back to printing to the console when no key is set. |
| Viewer | pdf.js, vendored | Copied into /vendor rather than bundled, so upgrades are a version bump. |
| Browser tools | pdf-lib | Client-side only. The one big bundle, and it loads on /tools alone. |
| Build | A 108-line node script | Not Vite or webpack. Tailwind CLI plus esbuild, called directly. |

**The thing that trips people up:** there is no client framework. The files in
\`src/client/\` total under 400 lines and ship as tiny ES modules. Pages are HTML
from the server. If your instinct on a new feature is "add a component with
state", the instinct to follow instead is "render it on the server and add ten
lines of vanilla JS".

## Infrastructure

Everything runs on one Cloudflare account, plus two outside services.

| Resource | Name | Binding | Job |
| --- | --- | --- | --- |
| Worker | \`pdf-sy\` | — | The whole app and API |
| R2 bucket | \`pdfsy-files\` | \`FILES\` | The PDFs themselves |
| D1 database | \`pdfsy\` | \`DB\` | Documents, links, sessions, stats |
| Static assets | \`./public\` | \`ASSETS\` | CSS, client bundles, pdf.js |
| Cron trigger | \`17 3 * * *\` | \`scheduled\` | Nightly retention sweep |
| Turnstile | Site key in wrangler.toml | — | Bot check on upload and login |

Outside Cloudflare: **Stripe** for billing and **Resend** for email. That is the
entire list.

### Secrets versus vars

The rule: anything that **authorises** something is a secret, set with
\`wrangler secret put\`. Anything that merely **identifies** something lives in
the committed \`wrangler.toml\`. So Stripe price IDs are vars — they name a
price, they do not authorise a charge. The Turnstile site key is a var because
it ships in the HTML anyway.

Secrets: \`TURNSTILE_SECRET\`, \`STRIPE_SECRET_KEY\`, \`STRIPE_WEBHOOK_SECRET\`,
\`RESEND_API_KEY\`, \`ADMIN_EMAILS\`, \`CONTRIBUTOR_EMAILS\`.

### Every secret is optional

A missing key switches its feature off rather than breaking the site. No Resend
key means email prints to your terminal. No Stripe key means checkout redirects
back with a notice. No \`ADMIN_EMAILS\` means /admin returns 404 to everyone. You
can clone this repo and run the whole product with no Cloudflare account.

### There is no hostname anywhere

Share links, QR codes and sign-in links are all built from the origin the
request arrived on, so the same build works on localhost, on workers.dev, and on
pdf.sy. Never hard-code a URL.

## How a tracked link works

The mechanism in one line. Every paid feature hangs off some point on it.

\`POST /api/documents\` → R2 and D1 → \`GET /:slug\` → \`GET /v/:slug/file\` →
pdf.js canvas → \`POST /v/:slug/ping\` → email

- **Upload** checks the PDF magic number, inspects for active content, hashes the bytes against a blocklist, claims a free slug, writes to R2, then writes three D1 rows in one batch.
- **The viewer** is chrome-free and rasterises pages to a canvas. Because pdf.js never executes embedded content, a malicious PDF opened in pdf.sy does nothing.
- **The beacon** batches per-page dwell times and flushes every few seconds plus once on visibilitychange, so closing the tab still reports.
- **The email** fires once per view session, only past five seconds of dwell, and only after a conditional UPDATE claims it — so two simultaneous pings cannot both send.

## Codebase map

The comments in these files are unusually thorough. Read them — they explain the
reasoning, not the syntax.

| Path | What it is |
| --- | --- |
| \`src/index.tsx\` | Route registration and global middleware. \`/:slug\` is a catch-all and must stay last. |
| \`src/db/schema.ts\` | Hand-written types mirroring the migrations, plus every env binding. |
| \`src/lib/plans.ts\` | Every paid feature, gated through one \`can()\`. The most important file here. |
| \`src/lib/auth.ts\` | Magic links, sessions, cookies. Only hashes are stored. |
| \`src/lib/limits.ts\` | Every rate limit in one table. Fails open on purpose. |
| \`src/lib/security.ts\` | Response headers and a strict CSP that allows inline scripts by hash. |
| \`src/lib/pdf.ts\` | Upload inspection. Read the "known gaps" note at the bottom first. |
| \`src/lib/retention.ts\` | The nightly sweep that makes the privacy policy true. |
| \`src/lib/markdown.ts\` | The renderer behind this page. Escapes first, then parses. |
| \`src/lib/i18n.ts\` | Language detection, the switch, and the client string block. |
| \`src/lib/strings/\` | \`en.ts\` defines the shape; \`ar.ts\` is typed against it. |
| \`src/routes/api.ts\` | Upload, sessions, pings. Also \`loadLink()\`, the single gate on whether a slug resolves. |
| \`src/routes/view.tsx\` | The viewer, the file stream, the QR endpoint, the password unlock. |
| \`src/routes/pages.tsx\` | Landing, upload, tools, stats, robots.txt, sitemap. |
| \`src/routes/admin.tsx\` | The console's eight pages. The one file that has outgrown itself. |
| \`src/components/layout.tsx\` | The shell, header, footer, and all four inline scripts. |
| \`src/client/\` | Six browser bundles: upload, viewer, tools, dashboard, pricing, admin. |
| \`scripts/build.mjs\` | Fonts, Tailwind, esbuild, vendored pdf.js. The entire build. |
| \`scripts/moderate.mjs\` | Takedown CLI. It works when the Worker does not. |
| \`migrations/\` | Numbered SQL files. Add one, run \`npm run db:local\`. Re-running is a no-op. |

## Design system

- **Palette:** Untitled UI "Paper", mapped onto Basecoat's shadcn variable names in \`src/styles/app.css\`. Primary is a sage green. Change a value there and the whole product changes with it — never hard-code a colour in a template.
- **Type:** Inter for Latin, IBM Plex Sans Arabic for Arabic, self-hosted so an Arabic page contacts no third party at all.
- **Components:** Basecoat first, always. Variants are data attributes, not classes.
- **Dark mode** follows the OS until someone touches the switch, then their choice wins. Handled by an inline script in the head so the page never flashes the wrong colour.
- **Logical properties only.** \`ms-auto\`, not \`ml-auto\`. This is the single easiest way to break the Arabic site without noticing.

## Six invariants

Break any of these and something either leaks, costs money, or becomes a
rewrite later.

### Never hand out a raw R2 URL

Every byte goes through \`/v/:slug/file\`. That route is what makes revocation,
expiry, download-blocking and passwords possible at all. The password check
lives there too, not only on the viewer page — otherwise the password protects
the wrapper and the document leaks.

### Plans are gated in exactly one place

Every paid capability goes through \`can(owner, feature)\`. Scatter plan checks
through the codebase and repackaging the product becomes a rewrite instead of a
one-line edit.

### Gate on the owner's plan, never the viewer's

The stats page and its settings belong to whoever owns the document, and they
can reach it through the upload token while signed out entirely.

### Anything that can run in the browser, runs in the browser

Merge, split and rotate never upload. Server CPU is the only real cost and the
only real scaling risk. As the toolbox grows toward the full platform, this is
the rule that decides whether it stays cheap.

### One slug gate, and it is loadLink()

Every route that serves or renders a document goes through it. That is what
makes a takedown a single database write rather than a hunt through the
codebase for every place a file can escape.

### Store hashes, never the thing itself

Session tokens, magic links and IP addresses are all stored as hashes only. A
database dump cannot be replayed as a login, and the promise that raw IPs are
never stored stays literally true — including inside the rate limiter, which
gets no exemption.

## Skills you need

### Bring these

- **TypeScript** — strict mode is on, and \`tsc --noEmit\` is currently the only automated gate on the project.
- **SQL** — real, hand-written SQLite. No ORM will write your queries or migrations for you.
- **HTML and CSS properly** — semantics, forms, ARIA, and the cascade. This codebase leans on the platform hard.
- **Tailwind v4** — configured in CSS rather than a JS file.
- **HTTP** — cookies, caching, status codes, redirects. A surprising amount of the design lives in header choices.

### Learn these here, half a day each

- **Hono** — if you know Express, you know Hono. Routing, middleware, \`c.req\`, \`c.env\`, \`c.get()\`. That is most of it.
- **Cloudflare Workers** — the real shift is what is absent: no filesystem, no process, no long-lived memory, and requests interleave inside one isolate. Module-level mutable state is a bug, not an optimisation.
- **D1 and R2** — D1 is SQLite with prepare/bind/first/run/batch. R2 is get/put/delete. Both are smaller than their docs suggest.
- **Basecoat** — read its docs once before writing any UI, so you know what already exists.

### The genuinely unusual parts

- **JSX that is not React.** Same syntax, no runtime. A component is a function returning an HTML string. Expect to catch yourself.
- **The CSP allows inline scripts by hash.** Edit one of the four inline scripts in layout.tsx and its hash moves automatically — but add a fifth without registering it in \`INLINE_SCRIPTS\` and the browser silently refuses to run it.
- **Bilingual RTL.** Every user-facing string goes in both dictionaries; Arabic is typed against English so you cannot forget one.
- **pdf.js.** Only if you touch the viewer. Otherwise ignore it.

## Day one

Clone to running product. No Cloudflare account needed for any of this.

1. \`git clone https://github.com/droubiamr/pdf.sy.git\` and \`npm install\`.
2. \`npm run build\`, then \`npm run db:local\`, then \`npm run dev\`. The site is on localhost:8787.
3. Sign in without an inbox: with no Resend key, magic-link emails print to your terminal. Go to /login, enter any address, and copy the link out of the Worker log.
4. Optional: put \`CONTRIBUTOR_EMAILS=you@example.com\` in a gitignored \`.dev.vars\` to reach this page locally.
5. Run \`npm run typecheck\` before you push. It passes clean on main today. Keep it that way.

\`npm run dev\` rebuilds first, so it is the only command you normally need.
Migrations track what has already run, so re-running is a no-op.

## How we work

**Git identity.** Commit under your own name and email. Do not add AI
attribution trailers or "generated with" lines to commits or PR bodies.

**Branches.** \`main\` is the only branch and it deploys to production. Work on a
branch, open a PR, get it looked at. There is no CI, so review is the only gate
that exists.

**Commit messages.** The earlier history is written in the imperative and says
*why*: "Build every URL from the request origin". Aim for that.

**Comments carry the reasoning.** This is the codebase's most distinctive habit
and it is worth matching. Comments explain the decision and the rejected
alternative, not the syntax. If you make a non-obvious call, write down why —
including what you did not do.

**Testing.** There are none. \`tsc\` is the entire safety net. This is the
project's biggest structural weakness and a genuinely good place to make a mark.

## Good first contributions

- **Set up Vitest with the Workers pool** and write the first dozen tests. Start with the pure functions: plans.ts, safeRedirect in i18n.ts, the inspection in pdf.ts, the window arithmetic in limits.ts. Then a GitHub Actions workflow that runs typecheck and tests on every PR.
- **Add Turnstile to the abuse report form.** The one public surface still unprotected, and the right way to drop the per-IP report limit that today silently discards the sixth genuine reporter from one office.
- **Move the manage token out of the query string.** It travels as \`?t=…\`, which keeps it in browser history and access logs. A cookie is the real fix.
- **Make Stripe webhooks idempotent.** Replaying a captured event inside the five-minute signature window re-applies a plan change.
- **Split \`src/routes/admin.tsx\`.** Eight pages in one file. A page-per-file split is mechanical and low-risk.
- **Phase 4: compression.** The next real step toward the full platform, and it is already advertised on the site with a "Soon" badge.

## Known gaps

Found while reviewing the project. Mostly documentation drifting behind the
code.

| Where | What |
| --- | --- |
| \`README.md\` | The "Going live" section names \`STRIPE_PRICE_PRO\` and \`STRIPE_PRICE_BUSINESS\`. Those do not exist — the code reads four: LITE and PRO, monthly and yearly. Following it verbatim gives a broken checkout. |
| \`SECURITY.md\` | Lists "No admin UI" as still open. The console shipped since. |
| \`migrations/0001\` | Comment says plans are free/pro/business. The code says free/lite/pro. |
| \`package.json\` | \`alpinejs\` is declared and imported nowhere. Safe to remove. |
| Production | \`TURNSTILE_SECRET\` is unset and the WAF rules are not configured, so bot protection is currently decorative. |
| Repo | No CI, no tests, no CONTRIBUTING.md, no licence file. |
`;
