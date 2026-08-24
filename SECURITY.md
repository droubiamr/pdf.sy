# Security

What protects pdf.sy, what does not, and what you have to do by hand.

The product is "anyone can upload a PDF anonymously and hand out a link". That
is the whole value and it is also the whole exposure — most of what follows is
about keeping that gap narrow rather than pretending it can be closed.

## The layers, outermost first

Order matters. Anything enforced inside the Worker has already cost you a
request, so the cheap defences have to sit in front of the expensive ones.

| Layer | Where | What it stops |
| --- | --- | --- |
| WAF rate limiting | Cloudflare dashboard | Volumetric floods, before they bill you |
| Turnstile | Cloudflare dashboard | Scripted signup and upload |
| Request limits | `src/lib/limits.ts` | One caller abusing one endpoint |
| Upload inspection | `src/lib/pdf.ts` | Active content and non-PDFs |
| Serving checks | `loadLink` in `src/routes/api.ts` | Blocked, deleted, expired, revoked |
| Takedown | `scripts/moderate.mjs` | Anything that got through |
| Retention sweep | `src/lib/retention.ts` | Data outliving its promise |

Turnstile is now integrated in code. **The WAF rules are not**, and neither is
the Turnstile secret — see below.

## Turnstile

Integrated on the three public surfaces that cost something:

| Page | Protects | `data-action` |
| --- | --- | --- |
| `/new` | `POST /api/documents` | `upload` |
| `/tools` | `POST /api/documents` (the "share it" button) | `upload` |
| `/login` | `POST /api/auth/magic-link` | `login` |

`/tools` matters and is easy to miss: it posts to the *same* endpoint as the
upload page but from a different client, so guarding only `/new` would have
broken it.

The action is bound at both ends — rendered as `data-action` and checked
against the verify response — so a token minted by the cheap login widget
cannot be replayed against the expensive upload endpoint.

**To turn it on:**

```bash
npx wrangler secret put TURNSTILE_SECRET
```

Until that secret exists the widget renders but nothing is verified, and every
skipped check logs `turnstile: no TURNSTILE_SECRET set`. Grep the Worker logs
for that line after deploying — it is the difference between protected and
decorative.

**For local development**, add `localhost` to the widget's hostname list in the
Cloudflare dashboard. The real sitekey issues no token on a hostname it does not
recognise, and it does so *silently* — no error callback, no console message,
just a widget that never produces a token.

**Failure behaviour is the opposite of the rate limiter's.** If siteverify is
unreachable, Turnstile fails **closed**. The limiter fails open because its
worst case is over-counting; this one failing open would hand an attacker the
bypass by simply making verification unreachable.

## Still to configure by hand

**WAF rate limiting rules** (Security → WAF → Rate limiting rules). These cannot
be set from code and are free on this plan:

- `POST /api/documents` — 10 requests per minute per IP
- `POST /api/auth/magic-link` — 5 per minute per IP
- `POST /*/unlock` — 10 per minute per IP
- Everything else — 300 per minute per IP

## Request limits

Defined in one table in `src/lib/limits.ts`. They are ceilings on abuse, not
quotas on normal use — a limiter that fires on real traffic is a bug.

Keyed by a **daily-salted hash of the caller's IP**, never the address itself:
the privacy policy says raw IPs are never stored, and the thing enforcing the
rules does not get an exemption from them.

The notification limit is keyed by **slug**, not by caller. That is deliberate.
Per-caller limits do not protect an inbox — view sessions are anonymous and
cheap, so a distributed attacker stays under every per-caller ceiling while all
the mail still lands in one place. Capping the destination is the only limit
that holds regardless of where the traffic comes from.

The limiter **fails open**. If its own table is unavailable, requests are
allowed and the error is logged. A limiter that takes the site down when it
breaks has caused the outage it exists to prevent.

## Uploads

`src/lib/pdf.ts` refuses: files that are not PDFs, truncated files, encrypted
files, and files carrying `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`,
`/RichMedia` or `/XFA`.

It inflates `/ObjStm` object streams before scanning. This is not an
optimisation — every mainstream producer (Word, LibreOffice, Acrobat, pdf-lib)
packs object definitions into a Flate-compressed object stream by default, so a
scan that only reads raw bytes finds nothing in almost any real file. The first
version of this check did exactly that and passed a PDF with `app.alert()` in
its `OpenAction`.

**It is not a malware scanner.** The known gaps are listed at the bottom of
`src/lib/pdf.ts`. Treat a pass as "no obvious active content", never as "safe".

What actually contains a bad file is structural, not the scan:

- the viewer rasterises through pdf.js to a `<canvas>` and never executes
  embedded content, so a malicious PDF opened *in pdf.sy* does nothing;
- R2 is private and every byte is served through a route that can refuse;
- a blocked document stops resolving everywhere at once.

The residual risk is a visitor **downloading** a file and opening it in Acrobat.
That is real and not fully mitigated. If it becomes a live problem, the answer
is a malware-scanning API on upload, not a bigger regex.

## Responding to abuse

Reports land in `abuse_reports`. The report page says "reports are read by a
person" — `scripts/moderate.mjs` is what makes that true.

```bash
npm run moderate reports
npm run moderate inspect <slug>
npm run moderate block <slug> "reason"
npm run moderate delete <slug> "reason"
```

Everything defaults to the local database. Add `--remote` to act on production,
so a half-remembered command is a rehearsal rather than an incident.

`block` does three things, because one is not enough: it stops this document,
blocklists its file hashes so the identical file cannot be re-uploaded, and
blocklists the uploader for 30 days because changing one byte defeats a hash.

`delete` is reversible until the next nightly sweep, then the bytes are gone.

## Retention

The cron in `wrangler.toml` runs `sweep()` nightly. It deletes expired
documents after a 24-hour grace period, soft-deleted ones on the next run,
expired sessions and magic links, and rolled-over rate-limit windows.

Without the `[triggers]` entry the handler is dead code. That was the state
this repo was in while the privacy policy said, in four places, that anonymous
files are deleted after seven days.

## Still open

Honest list. None of these are fixed.

- **`TURNSTILE_SECRET` is not set and the WAF rules are not configured.** The
  code is in place; the configuration is not. This is the biggest gap.
- **The `report` form has no Turnstile widget.** It is the obvious next one,
  and it is the right way to drop the per-IP report limit — which currently
  silently discards the sixth genuine reporter from one office.
- **Downloaded files are not scanned for malware.**
- **No admin UI.** Moderation is a CLI against production.
- **`SITE_URL` is unset**, so links follow the request's `Host` header. Fine
  today; pin it once `pdf.sy` is the only hostname serving this.
- **The manage token travels in the query string** (`?t=…`). `Referrer-Policy:
  same-origin` keeps it out of other people's logs, but it is still in browser
  history and Cloudflare access logs. Moving it to a cookie is the real fix.
- **Stripe webhooks are not idempotent** beyond the 5-minute signature window.
  Replaying a captured event inside that window re-applies a plan change.

## Secrets

Never in `wrangler.toml`. `RESEND_API_KEY`, `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` are set with `npx wrangler secret put`. `.dev.vars` is
gitignored and must stay that way.
