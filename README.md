# pdf.sy

Send a PDF as a link, and see what happens to it.

Upload a PDF, get a short link, and find out who opened it, for how long, and
which page they stopped on. The free browser-side tools (merge, split, rotate)
exist to feed that link — they are the funnel, not the product.

## Stack

| Concern        | Choice                                                |
| -------------- | ----------------------------------------------------- |
| App + API      | Cloudflare Workers + Hono (server-rendered JSX)        |
| File storage   | R2 — no egress fees, which is why this is cheap to run |
| Database       | D1 (SQLite)                                            |
| UI components  | [Basecoat](https://basecoatui.com) — shadcn/ui without React |
| Design         | Untitled UI "Paper" palette, applied as theme variables |
| Auth           | Magic links, hand-rolled (see below)                   |
| Billing        | Stripe over REST, no SDK                               |
| Email          | Resend, with a console fallback when no key is set     |
| Viewer         | PDF.js, vendored                                       |
| Browser tools  | pdf-lib, entirely client-side                          |

No React, no client framework. The viewer is the first thing a recipient sees
and it should never wait on a bundle.

## Getting started

```bash
npm install
npm run build
npm run db:local
npm run dev
```

Then open http://localhost:8787.

## Going live

```bash
npx wrangler login       # once, opens your browser
npm run setup:cloud      # bucket, database, migrations, deploy
```

`setup:cloud` is idempotent — it creates the R2 bucket and D1 database only if
they are missing, writes the `database_id` into `wrangler.toml`, applies any
unapplied migrations, builds, and deploys. Re-run it after any migration.

Then the secrets. Each one is optional — without it that feature simply stays
off rather than breaking:

```bash
npx wrangler secret put RESEND_API_KEY        # or email lands in the Worker log
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_PRO      # price_… for the Pro plan
npx wrangler secret put STRIPE_PRICE_BUSINESS
```

Point a Stripe webhook at `https://<your-host>/api/billing/webhook` for
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated` and `customer.subscription.deleted`.

For local work, put `STRIPE_WEBHOOK_SECRET` in a gitignored `.dev.vars` file.

### Hostnames

There is no hostname in the configuration. Share links, QR codes and sign-in
links are all built from the origin the request arrived on, so the same build
works on `*.workers.dev` today and on `pdf.sy` the moment you point the domain
at it. `SITE_URL` exists only as an override for the case where the canonical
domain must differ from the serving host.

## Layout

```
src/
  index.tsx          Route registration. /:slug is a catch-all and goes last.
  db/schema.ts       Types mirroring migrations/0000_init.sql
  lib/ids.ts         Slug alphabet, manage tokens, salted IP hashing
  lib/auth.ts        Magic links, sessions, cookies
  lib/mail.ts        Resend wrapper + email templates
  lib/context.ts     The shared Hono env (bindings + resolved user)
  lib/plans.ts       Every paid feature, gated through one can()
  lib/password.ts    PBKDF2 link passwords + the unlock cookie
  lib/stripe.ts      Checkout, portal, webhook signature verification
  lib/versions.ts    Resolves which version a link actually serves
  lib/admin.ts       Who may open /admin, and the audit-log writer
  lib/admin-queries.ts  Every platform-wide read the console does
  routes/
    pages.tsx        Landing, upload, tools, stats
    api.ts           Upload, view sessions, dwell pings, notifications
    view.tsx         The viewer, the file stream, the QR endpoint
    auth.tsx         Login, magic-link verify, logout, claim
    dashboard.tsx    Your links, with view counts and the notify toggle
    links.tsx        Link settings, notify toggle, replace-the-file
    billing.tsx      Pricing, checkout, portal, Stripe webhook
    admin.tsx        The console's eight pages. Read-only, all of it.
    admin-actions.ts The console's mutations. Block, delete, resolve, sweep.
  components/        Layout and icons
  components/admin/  The console's own shell and dashboard primitives
  client/            Browser bundles: upload, viewer, tools, dashboard, admin
  styles/app.css     Tailwind + Basecoat + the Paper palette

Migrations are applied by `scripts/migrate.mjs`, which tracks what has already
run in a `schema_migrations` table. Add a numbered `.sql` file and run
`npm run db:local`; re-running is a no-op.
```

### Why auth is hand-written

The build spec named Better Auth, which expects a Drizzle or Kysely adapter —
and this project deliberately has no ORM. Magic-link-only auth is small enough
to own outright: no passwords means no password database, no reset flow and no
credential stuffing. The rule that keeps it safe is that **every token is random
and only its SHA-256 is stored**, so a database dump cannot be replayed as a
login. Links are single-use, expire in 15 minutes, and are rate-limited to five
per address per hour. Swapping in a library later only touches `src/lib/auth.ts`.

### Three rules worth keeping

**Plans are gated in exactly one place.** Every paid capability goes through
`can(owner, feature)` in `src/lib/plans.ts`. Scatter plan checks through the
codebase and repackaging becomes a rewrite.

**Gate on the owner's plan, never the viewer's.** The stats page and its settings
belong to whoever owns the document, and they can reach it through the upload
token while signed out.



**Anything that can run in the browser, runs in the browser.** Merge, split and
rotate never upload. Server CPU is the only real cost and the only real scaling
risk.

**Never hand out a raw R2 URL.** Every read goes through `/v/:slug/file`, which
is what makes revocation, expiry, download-blocking and passwords possible at
all. The password check lives on that endpoint too, not only on the viewer page —
otherwise the password protects the wrapper and the document leaks.

## Notifications

When a visitor stays longer than five seconds, the owner gets one email per view
session: *"Someone in DE opened 'Acme proposal' — 12s, reached page 3 of 3."*
Three things keep it from becoming noise: the notification is claimed with a
conditional `UPDATE` before sending, so two simultaneous pings cannot both mail;
a bounce under five seconds is silent; and every link has a `notify_on_view`
toggle on the dashboard.

## Anonymous vs signed in

Anonymous uploads still work with no account, and their links expire after
`ANON_LINK_TTL_DAYS`. Signing in claims anything created on that device — the
`manage_token` in `localStorage` is the proof — and claimed links stop expiring.
That gap is the entire signup pitch, so keep it.

## Link controls

Pro unlocks passwords (PBKDF2, with an unlock cookie derived from the stored
hash so changing the password invalidates it), expiry, blocking downloads, and
replacing the file behind a link. Revoking is free for everyone — you can always
take back something you shared.

Replacing a file adds a version and leaves `pinned_version` NULL, which means
"serve the latest". Both versions stay in R2 and the view history carries over.

## What is not built yet

Phases 1–3 are done: the tracked link, accounts, notifications, and the paywall
with link controls. Still to come: server-side compression (phase 4), then teams,
email gating, watermarks and the public API (phase 5).

## Abuse

Anonymous links expire after `ANON_LINK_TTL_DAYS`. Uploads are checked for the
PDF magic number and against a SHA-256 blocklist. Still missing before any
public launch: Turnstile on upload, per-IP rate limits, virus scanning, and a
published DMCA process with a named contact.

Reports land in `abuse_reports` and are worked from the Moderation page of the
admin console. `scripts/moderate.mjs` does the same job from a terminal and is
kept deliberately — it is the tool that still works when the Worker does not.

## Admin console

`/admin`, eight pages: Overview, Documents, Engagement, Accounts, Revenue,
Moderation, System, Audit log. English only, and server-rendered like the rest
of the site — the only client-side JavaScript is a sidebar toggle, a twenty-
second poll for the live counter, and a confirm dialog before anything
destructive.

Access is the `ADMIN_EMAILS` secret: a comma-separated allowlist of email
addresses, matched case-insensitively against the signed-in account.

```
npx wrangler secret put ADMIN_EMAILS
```

Three properties worth not breaking:

- **It is an environment variable, not a column.** No screen anywhere grants
  admin, so the only path to it is deploy access. A privilege-escalation bug in
  the app cannot make somebody an admin.
- **Unset means off.** An empty or missing `ADMIN_EMAILS` 404s the whole tree,
  which is what a fresh clone of this repo should do.
- **The refusal is a 404, not a 403.** A stranger should not learn the route
  exists. Both the pages and the actions check independently — a layout cannot
  protect a POST.

Every action that changes something writes a row to `admin_audit` before it
returns. That table is append-only: nothing in the console can edit or delete
from it.
