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
| Viewer         | PDF.js, vendored                                       |
| Browser tools  | pdf-lib, entirely client-side                          |

No React, no client framework. The viewer is the first thing a recipient sees
and it should never wait on a bundle.

## Getting started

```bash
npm install
npm run build
npx wrangler d1 execute pdfsy --local --file=./migrations/0000_init.sql
npm run dev
```

Then open http://localhost:8787.

## Before the first deploy

1. `npx wrangler r2 bucket create pdfsy-files`
2. `npx wrangler d1 create pdfsy` — paste the returned id into `wrangler.toml`
3. `npm run db:remote` to apply the schema
4. `npm run deploy`

## Layout

```
src/
  index.tsx          Route registration. /:slug is a catch-all and goes last.
  db/schema.ts       Types mirroring migrations/0000_init.sql
  lib/ids.ts         Slug alphabet, manage tokens, salted IP hashing
  routes/
    pages.tsx        Landing, upload, tools, stats
    api.ts           Upload, view sessions, dwell pings, abuse reports
    view.tsx         The viewer, the file stream, the QR endpoint
  components/        Layout and icons
  client/            Browser bundles: upload, viewer, tools
  styles/app.css     Tailwind + Basecoat + the Paper palette
```

### Two rules worth keeping

**Anything that can run in the browser, runs in the browser.** Merge, split and
rotate never upload. Server CPU is the only real cost and the only real scaling
risk.

**Never hand out a raw R2 URL.** Every read goes through `/v/:slug/file`, which
is what makes revocation, expiry and download-blocking possible at all.

## What is not built yet

Phase 1 is the tracked link. Still to come, in order: accounts and email
notifications on open (phase 2), the Stripe paywall with passwords, expiry and
versioning (phase 3), server-side compression (phase 4), then teams, email
gating, watermarks and the public API (phase 5).

Until accounts land, whoever holds a document's `manage_token` owns it. The
stats URL contains that token — that is the only way back in.

## Abuse

Anonymous links expire after `ANON_LINK_TTL_DAYS`. Uploads are checked for the
PDF magic number and against a SHA-256 blocklist. Still missing before any
public launch: Turnstile on upload, per-IP rate limits, virus scanning, and a
published DMCA process with a named contact.
