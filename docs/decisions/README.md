# Decision records

Short notes explaining **why** something is the way it is — and what we turned
down to get there.

## Why bother

This codebase already works this way. The header comments in `src/lib/limits.ts`
and `src/lib/retention.ts` are decision records that happen to live inside
source files. That is a good habit with one weakness: when the file gets
rewritten, the reasoning goes with it, and the next person re-litigates a
settled question from scratch.

A record here survives the code it explains.

## When to write one

Write one when a choice would be **expensive to reverse** or **surprising to a
newcomer**:

- picking a technology, or deciding not to add one
- a security or privacy boundary
- anything where the obvious thing was rejected on purpose
- anything you have now explained twice in review

Do **not** write one for ordinary implementation. If it fits in a code comment,
it is a code comment.

## How

Copy [`TEMPLATE.md`](TEMPLATE.md) to the next free number and fill it in. Four
short sections; half a page is normal, and a full page is usually too long.

```
docs/decisions/0006-short-title-in-kebab-case.md
```

Records are **append-only**. When a decision changes, write a new record that
supersedes the old one and add a line at the top of the old one pointing to it.
Do not edit history — the point is being able to see what was believed at the
time, and what changed.

## Status

- **Accepted** — in force.
- **Superseded by NNNN** — replaced. Kept for the reasoning.
- **Proposed** — under discussion, usually attached to a pull request.

## The records

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-workers-and-server-rendered-jsx.md) | Cloudflare Workers and server-rendered JSX | Accepted |
| [0002](0002-raw-sql-no-orm.md) | Raw SQL on D1, no ORM | Accepted |
| [0003](0003-hand-written-magic-link-auth.md) | Hand-written magic-link auth | Accepted |
| [0004](0004-admin-access-by-env-var.md) | Admin access by environment variable | Accepted |
| [0005](0005-browser-side-tools.md) | PDF tools run in the browser | Accepted |
