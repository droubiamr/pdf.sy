# How pdf.sy is put together

A map, not a tutorial. The reasoning behind each choice is in
[`decisions/`](decisions/); this is what exists and where it lives.

## The stack

Every choice was made against an obvious alternative. Knowing why the
alternative lost is more useful than knowing what won.

| Concern | Choice | Instead of, and why |
| --- | --- | --- |
| App and API | Cloudflare Workers + Hono | Not Next.js. Runs at the edge, boots per request, no Node server to pay for. |
| Templating | Server-rendered JSX via `hono/jsx` | Not React. It looks like React and is not: no hooks, no state, no hydration. |
| Files | R2 | Not S3. Zero egress fees — serving PDFs is the entire cost model. |
| Database | D1, SQLite at the edge | Not Postgres. Raw SQL, no ORM. |
| UI components | Basecoat CSS | shadcn/ui without React. Check it before hand-rolling anything. |
| Styling | Tailwind v4 | Configured in CSS, not a JS config file. |
| Auth | Hand-written magic links | Not Better Auth — it expects an ORM adapter this project does not have. |
| Billing | Stripe over plain REST | Not the Stripe SDK. Four `fetch` calls beat a dependency that assumes Node. |
| Email | Resend | Falls back to printing to the console when no key is set. |
| Viewer | pdf.js, vendored | Copied into `/vendor` rather than bundled, so upgrades are a version bump. |
| Browser tools | pdf-lib | Client-side only. The one large bundle, and it loads on `/tools` alone. |
| Build | A ~110-line node script | Not Vite or webpack. Tailwind CLI plus esbuild, called directly. |

**There is no client framework.** Everything in `src/client/` totals a few
hundred lines and ships as small ES modules. Pages are HTML from the server. If
your instinct on a new feature is "add a component with state", the instinct to
follow instead is "render it on the server and add ten lines of vanilla JS".

## Infrastructure

Everything runs on one Cloudflare account, plus two outside services.

| Resource | Name | Binding | Job |
| --- | --- | --- | --- |
| Worker | `pdf-sy` | — | The whole app and API |
| R2 bucket | `pdfsy-files` | `FILES` | The PDFs themselves |
| D1 database | `pdfsy` | `DB` | Documents, links, sessions, stats |
| Static assets | `./public` | `ASSETS` | CSS, client bundles, pdf.js |
| Cron trigger | `17 3 * * *` | `scheduled` | Nightly retention sweep |
| Turnstile | Site key in `wrangler.toml` | — | Bot check on upload and login |

Outside Cloudflare: **Stripe** for billing, **Resend** for email. That is the
entire list.

### Secrets versus vars

Anything that **authorises** something is a secret, set with
`wrangler secret put`. Anything that merely **identifies** something lives in
the committed `wrangler.toml`. Stripe price IDs are vars — they name a price,
they do not authorise a charge. The Turnstile site key is a var because it ships
in the HTML anyway.

Secrets: `TURNSTILE_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`RESEND_API_KEY`, `ADMIN_EMAILS`.

### No hostname anywhere

Share links, QR codes and sign-in links are built from the origin the request
arrived on, so the same build works on localhost, on `*.workers.dev`, and on
`pdf.sy`. Never hard-code a URL. `SITE_URL` exists only as an override for when
the canonical domain must differ from the serving host.

## How a tracked link works

```
POST /api/documents  →  R2 + D1  →  GET /:slug  →  GET /v/:slug/file
                                        ↓
                                  pdf.js canvas
                                        ↓
                              POST /v/:slug/ping  →  email
```

- **Upload** checks the PDF magic number, inspects for active content, hashes
  the bytes against a blocklist, claims a free slug, writes to R2, then writes
  three D1 rows in one batch. If the metadata write fails, the R2 object is
  deleted rather than orphaned.
- **The viewer** is chrome-free and rasterises pages to a canvas. Because pdf.js
  never executes embedded content, a malicious PDF opened *in pdf.sy* does
  nothing.
- **The beacon** batches per-page dwell times and flushes every few seconds plus
  once on `visibilitychange`, so closing the tab still reports.
- **The email** fires once per view session, only past five seconds of dwell,
  and only after a conditional `UPDATE` claims it — so two simultaneous pings
  cannot both send.

## Codebase map

The comments in these files are unusually thorough. Read them — they explain the
reasoning, not the syntax.

| Path | What it is |
| --- | --- |
| `src/index.tsx` | Route registration and global middleware. `/:slug` is a catch-all and must stay last. |
| `src/db/schema.ts` | Hand-written types mirroring the migrations, plus every env binding. |
| `src/lib/plans.ts` | Every paid feature, gated through one `can()`. Small and load-bearing. |
| `src/lib/auth.ts` | Magic links, sessions, cookies. Only hashes are stored. |
| `src/lib/limits.ts` | Every rate limit in one table. Fails open on purpose. |
| `src/lib/security.ts` | Response headers, and a strict CSP that allows inline scripts by hash. |
| `src/lib/pdf.ts` | Upload inspection. Read the "known gaps" note at the bottom first. |
| `src/lib/retention.ts` | The nightly sweep that makes the privacy policy true. |
| `src/lib/i18n.ts` | Language detection, the switch, and the client string block. |
| `src/lib/strings/` | `en.ts` defines the shape; `ar.ts` is typed against it. |
| `src/lib/admin.ts` | Who may open `/admin`, and the audit-log writer. |
| `src/routes/api.ts` | Upload, sessions, pings. Also `loadLink()`, the single gate on whether a slug resolves. |
| `src/routes/view.tsx` | The viewer, the file stream, the QR endpoint, the password unlock. |
| `src/routes/pages.tsx` | Landing, upload, tools, stats, robots.txt, sitemap. |
| `src/routes/admin.tsx` | The console's eight pages, all read-only. |
| `src/routes/admin-actions.ts` | The console's mutations. Block, delete, resolve, sweep. |
| `src/components/layout.tsx` | The shell, header, footer, and all four inline scripts. |
| `src/client/` | Browser bundles: upload, viewer, tools, dashboard, pricing, admin. |
| `scripts/build.mjs` | Fonts, Tailwind, esbuild, vendored pdf.js. The entire build. |
| `scripts/moderate.mjs` | Takedown CLI. It works when the Worker does not. |
| `migrations/` | Numbered SQL files, tracked in a `schema_migrations` table. |

## Design system

- **Palette:** Untitled UI "Paper", mapped onto Basecoat's shadcn variable names
  in `src/styles/app.css`. Primary is a sage green. Change a value there and the
  whole product changes with it — never hard-code a colour in a template.
- **Type:** Inter for Latin, IBM Plex Sans Arabic for Arabic, self-hosted so an
  Arabic page contacts no third party for its type at all.
- **Dark mode** follows the OS until someone touches the switch, then their
  choice wins. An inline script in `<head>` applies it before first paint, so
  the page never flashes the wrong colour.
- **Logical properties only**, everywhere. See
  [CONTRIBUTING.md](../CONTRIBUTING.md#the-invariants).

## Security posture

The full picture is in [SECURITY.md](../SECURITY.md). The short version: the
cheap defences sit in front of the expensive ones, because anything enforced
inside the Worker has already cost a request.

| Layer | Where |
| --- | --- |
| WAF rate limiting | Cloudflare dashboard *(not yet configured)* |
| Turnstile | Cloudflare dashboard *(secret not yet set)* |
| Request limits | `src/lib/limits.ts` |
| Upload inspection | `src/lib/pdf.ts` |
| Serving checks | `loadLink` in `src/routes/api.ts` |
| Takedown | `scripts/moderate.mjs` and the admin console |
| Retention sweep | `src/lib/retention.ts` |
