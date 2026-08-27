# 0001. Cloudflare Workers and server-rendered JSX

**Status:** Accepted
**Date:** 2026-08-22

## Context

The first thing a recipient of a link sees is someone else's document, usually
on a phone, often on a bad connection, and almost always via a link they were
sent rather than a site they chose to visit. That page has one job: show the PDF
immediately.

We also have no revenue and no ops appetite. Whatever runs this has to cost
close to nothing when idle.

## Decision

Cloudflare Workers for the runtime, Hono for routing, and JSX rendered **on the
server** through `hono/jsx`. No React, no client framework, no hydration. Pages
are HTML strings. The few interactive pieces are small vanilla ES modules.

## Consequences

- The viewer never waits on a framework bundle. The only large asset is pdf.js,
  and only on pages that actually show a PDF.
- Workers boot per request, so there is no idle cost and no server to patch.
- JSX here **looks** like React and is not. No `useState`, no effects, no
  re-render. Every contributor catches themselves on this at least once, which
  is why it is called out in CONTRIBUTING.md.
- Anything genuinely interactive costs more effort than it would in React. That
  is a real tax, and it is the price of the first point.
- No filesystem, no `process`, no long-lived memory. Requests interleave inside
  one isolate, so module-level mutable state is a bug — see the per-request
  language variable in `src/index.tsx` for the shape of that trap.

## Alternatives considered

**Next.js on Vercel.** The default answer, and it brings a client framework to a
page whose entire job is to not wait on one. Also a per-seat cost curve we do
not want.

**Plain Workers with template literals.** Fewer moving parts, but no type
checking on markup and no components. JSX gives both for a compile-time-only
dependency.
