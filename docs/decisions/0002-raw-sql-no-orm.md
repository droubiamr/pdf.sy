# 0002. Raw SQL on D1, no ORM

**Status:** Accepted
**Date:** 2026-08-22

## Context

The data model is small and unlikely to grow fast: documents, versions, links,
view sessions, page stats, users. Most queries are simple lookups; the few that
are not are analytics aggregations where we care about the exact SQL being run.

D1 is SQLite, and its driver already offers `prepare`, `bind`, `first`, `run`
and `batch`.

## Decision

Write SQL by hand. Types live in `src/db/schema.ts` as a hand-maintained mirror
of the migration files. Migrations are numbered `.sql` files applied by
`scripts/migrate.mjs`, which records what has run in a `schema_migrations`
table.

A `drizzle.config.ts` is kept in the repo for the day this stops being the right
call, but nothing uses it.

## Consequences

- There is no query builder between a contributor and the database. What you
  read is what runs.
- No migration generator, no schema drift between an ORM's model and reality —
  but also nothing that *stops* `schema.ts` drifting from the migrations. That
  file has to be updated by hand, and reviewers should check it.
- Analytics queries in `src/lib/admin-queries.ts` are written for SQLite
  directly, which an ORM would have made harder rather than easier.
- SQL injection is prevented by binding parameters, every time. There is no
  library backstop. Never build a query by string concatenation.

## Alternatives considered

**Drizzle.** The natural fit for D1 and genuinely good. Rejected for now because
it buys type safety we already get from `schema.ts` and costs a build step plus
a generated-migration workflow.

**Prisma.** Heavier, and its edge story was not worth the weight for six tables.
