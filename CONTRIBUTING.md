# Contributing to pdf.sy

Read this once before your first commit. It covers how to run the project, the
rules that hold it together, and where the work is.

Background reading lives in [`docs/`](docs/): [what we are
building](docs/vision.md), [how it is put together](docs/architecture.md), and
[why it is that way](docs/decisions/).

## Getting it running

No Cloudflare account needed for any of this.

```bash
git clone https://github.com/droubiamr/pdf.sy.git
cd pdf.sy
npm install
npm run build      # fonts, CSS, client bundles, vendored pdf.js
npm run db:local   # applies the migrations to a local SQLite file
npm run dev        # http://localhost:8787
```

`npm run dev` rebuilds first, so it is the only command you normally need.
Migrations track what has already run, so re-running is a no-op.

**Signing in without an inbox.** With no `RESEND_API_KEY`, magic-link emails
print to your terminal instead of sending. Go to `/login`, enter any address,
and copy the link out of the Worker log.

**Every secret is optional.** A missing key switches its feature off rather than
breaking the site — no Stripe key means checkout redirects back with a notice,
no `ADMIN_EMAILS` means `/admin` returns 404. That is deliberate, so a fresh
clone runs with nothing configured.

## Before you push

```bash
npm run typecheck
```

This runs `tsc` twice — once for the Worker, once for the browser bundles, which
have their own config. It passes clean on `main`. Keep it that way.

There are no automated tests yet. `tsc` and code review are the entire safety
net, which is why review is not optional. Adding a test setup is the single most
valuable thing anyone could do here — see [Good first
contributions](#good-first-contributions).

## The invariants

Break one of these and something leaks, costs money, or becomes a rewrite later.
Each has a decision record behind it if you want the reasoning.

**Never hand out a raw R2 URL.** Every byte goes through `/v/:slug/file`. That
route is what makes revocation, expiry, download-blocking and passwords possible
at all. The password check lives there too, not only on the viewer page —
otherwise the password protects the wrapper and the document leaks.

**Plans are gated in exactly one place.** Every paid capability goes through
`can(owner, feature)` in `src/lib/plans.ts`. Scatter plan checks through the
codebase and repackaging the product becomes a rewrite instead of a one-line
edit.

**Gate on the owner's plan, never the viewer's.** The stats page and its
settings belong to whoever owns the document, and they can reach it through the
upload token while signed out entirely.

**Anything that can run in the browser, runs in the browser.** See
[ADR 0005](docs/decisions/0005-browser-side-tools.md). Server CPU is the only
real cost and the only real scaling risk. This gets *more* important as the
toolbox grows, not less.

**One slug gate, and it is `loadLink()`.** Every route that serves or renders a
document goes through it. That is what makes a takedown a single database write
rather than a hunt through the codebase for every place a file can escape.

**Store hashes, never the thing itself.** Session tokens, magic links and IP
addresses are stored as hashes only. A database dump cannot be replayed as a
login, and the promise that raw IPs are never stored stays literally true —
including inside the rate limiter, which gets no exemption.

**Logical CSS properties only.** `ms-auto`, not `ml-auto`. `text-start`, not
`text-left`. The entire interface mirrors itself under `dir="rtl"` with no
Arabic-specific rule anywhere, and a physical property is the easiest way to
break the Arabic site without noticing.

## House style

**Comments carry the reasoning.** This is the codebase's most distinctive habit
and the one most worth matching. Comments here explain the decision and the
rejected alternative, not the syntax — read the header of `src/lib/limits.ts` or
`src/lib/retention.ts` for the register. If you make a non-obvious call, write
down why, including what you did not do.

When the reasoning is bigger than a comment, it is a
[decision record](docs/decisions/) instead.

**Strings.** Every user-facing string goes in `src/lib/strings/en.ts` and
`ar.ts`. Arabic is typed against English, so a missing key is a compile error
rather than an English word in the middle of an Arabic page. Internal tooling —
the admin console — is English-only on purpose.

**Components.** Basecoat first, always. Check its docs before hand-rolling
anything; variants are data attributes (`data-variant="outline"`), not classes.

**Colours.** Never hard-code one. Everything reads the theme variables in
`src/styles/app.css`.

**Inline scripts.** The Content-Security-Policy allows them by SHA-256 hash.
Editing one of the four in `src/components/layout.tsx` moves its hash
automatically, but adding a fifth without registering it in `INLINE_SCRIPTS`
means the browser silently refuses to run it.

## Working together

**Branches.** `main` deploys to production. Work on a branch, open a pull
request, get it looked at before merging.

**Commits.** Imperative mood, and say *why* where it is not obvious — "Build
every URL from the request origin" rather than "fix urls". Commit under your own
name and email. No AI-attribution trailers or "generated with" lines anywhere.

**Where things go.** Bugs and tasks are [Issues](../../issues). Half-formed
ideas and open questions are [Discussions](../../discussions) so they do not
clutter the issue list. Anything that settles a question about *how the system
is built* becomes a decision record.

**Migrations.** Add a numbered `.sql` file in `migrations/` and run
`npm run db:local`. Remember that production needs `npm run db:remote` before
code depending on the new schema is deployed — a deploy that lands ahead of its
migration is a 500 for everybody.

## Good first contributions

Real work, roughly in order of value. Each is self-contained and touches enough
of the codebase to teach it.

- **Set up Vitest with the Workers pool** and write the first dozen tests. Start
  with the pure functions: `plans.ts`, `safeRedirect` in `i18n.ts`, the
  inspection in `pdf.ts`, the window arithmetic in `limits.ts`. Then a GitHub
  Actions workflow running typecheck and tests on every pull request.
- **Add Turnstile to the abuse report form.** The one public surface still
  unprotected, and the right way to drop the per-IP report limit that today
  silently discards the sixth genuine reporter from one office.
- **Move the manage token out of the query string.** It travels as `?t=…`, which
  keeps it in browser history and access logs. A cookie is the real fix.
- **Make Stripe webhooks idempotent.** Replaying a captured event inside the
  five-minute signature window re-applies a plan change.
- **Split `src/routes/admin.tsx`.** Eight pages in one 1,400-line file. A
  page-per-file split is mechanical and low-risk.
- **Compression.** The next real step toward the full toolbox, and already
  advertised on the site with a "Soon" badge.

## Known gaps

Honest list, so nobody rediscovers these the hard way.

| Where | What |
| --- | --- |
| `package.json` | `alpinejs` is declared and imported nowhere. |
| Production | `TURNSTILE_SECRET` is unset and the WAF rules are unconfigured, so bot protection is currently decorative. |
| Repo | No tests, no CI, no licence file. |
