# 0004. Admin access by environment variable

**Status:** Accepted
**Date:** 2026-08-26

## Context

The admin console can see every document, every account, revenue, and the
moderation queue. It can block and delete other people's files.

The usual way to gate that is a `role` column on `users`. The usual way that
fails is a privilege-escalation bug somewhere else in the app — a missing
ownership check, a mass-assignment on a profile form — quietly turning into
admin access.

## Decision

Access is the `ADMIN_EMAILS` secret: a comma-separated allowlist matched
case-insensitively against the signed-in account. There is **no screen anywhere
in the product that grants admin**, so the only route to it is deploy access.

Three properties hold this up:

1. **It is an environment variable, not a column.** No application bug can write
   to it.
2. **Unset means off.** An empty or missing value 404s the whole tree, which is
   what a fresh clone should do.
3. **The refusal is a 404, not a 403.** A stranger should not learn the route
   exists. Pages and actions check independently — a layout cannot protect a
   POST.

Every mutating action writes to the append-only `admin_audit` table before it
returns.

## Consequences

- Granting admin requires a deploy. That is friction on purpose, and it makes
  the console unsuitable as a general permissions system.
- There is no way to give someone *part* of the console. It is all or nothing,
  which is why a separate allowlist would be needed for anything narrower.
- The audit log is append-only and nothing in the console can edit it, so a
  compromised admin session cannot erase its own tracks from the app.

## Alternatives considered

**A `role` column on `users`.** Conventional and much more flexible. Rejected
because flexibility is the problem: it puts the most dangerous permission in the
product reachable by a bug in the product.

**A separate admin deployment.** Strongest isolation, and too much operational
weight for one person to run.
