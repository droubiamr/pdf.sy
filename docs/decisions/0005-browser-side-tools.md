# 0005. PDF tools run in the browser

**Status:** Accepted
**Date:** 2026-08-22

## Context

The tools — merge, split, rotate, and the compress, convert and edit operations
still to come — are half the product and the half people arrive through. "Free
PDF merge" is a high-volume search term; "tracked PDF link" is not.

They are also the one part of the product that could plausibly bankrupt it. CPU
is the only meaningful cost here: R2 has no egress fee, and D1 queries are
cheap. A queue of strangers compressing 40 MB scans on our CPU is a bill with no
ceiling and no revenue attached.

## Decision

**Anything that can run in the browser, runs in the browser.** The tools use
pdf-lib client-side and never upload. Anything that genuinely cannot run
client-side gets explicit limits designed *before* it ships, not after.

## Consequences

- Tool traffic costs us bandwidth for one JavaScript bundle and nothing else,
  however many files pass through it.
- "Your files are never uploaded" is a real privacy claim on the marketing page
  with no asterisk, which is a genuine differentiator.
- It is instant even on a large file, because there is no round trip.
- The bundle is large — pdf-lib is most of it — and it loads on `/tools` alone
  so it never touches the viewer or the landing page.
- Some operations are harder or impossible client-side. OCR and some conversions
  will eventually force a server path, and that is when this record gets
  revisited rather than quietly ignored.
- Nothing about a tool run is observable to us. No analytics on what people
  merge, which is the correct trade but worth stating.

## Alternatives considered

**Server-side processing.** Simpler code, better observability, uniform
capability — and an unbounded CPU bill from anonymous users on the free tier.

**A queue with per-user quotas.** Where we will end up for the operations that
truly need a server. Unnecessary complexity for merge, split and rotate, which
the browser does perfectly well.
