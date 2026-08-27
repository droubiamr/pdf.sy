# 0003. Hand-written magic-link auth

**Status:** Accepted
**Date:** 2026-08-23

## Context

Accounts exist for one reason: to stop a link expiring and to attach analytics
to an owner. There is nothing in the product that needs a password, and a
password database is a liability we would rather not hold.

The original build spec named Better Auth, which expects a Drizzle or Kysely
adapter — and [0002](0002-raw-sql-no-orm.md) means there is no ORM to give it.

## Decision

Own the auth. Magic links only, implemented in `src/lib/auth.ts`.

The rule that makes it safe: **every token is random, and only its SHA-256 is
stored.** Links are single-use, expire in fifteen minutes, and are rate-limited
to five per address per hour. Sessions last thirty days when "stay signed in" is
ticked and twelve hours when it is not — enforced in the database row, not only
in the cookie.

## Consequences

- No passwords means no reset flow, no credential stuffing, and no password
  database to leak.
- A database dump cannot be replayed as a login, because it holds hashes.
- The whole thing is under 200 lines and lives in one file, so swapping in a
  library later touches only that file.
- Account security is now exactly inbox security. Someone who loses access to
  their email loses the account, and there is no recovery path. That is a real
  limitation and it is accepted deliberately.
- We own the edge cases — two tabs racing on the same link, session expiry,
  cookie flags. They are handled, but they are ours to keep handling.

## Alternatives considered

**Better Auth.** Named in the spec. Needs an ORM adapter we do not have.

**Passwords.** More surface, more support burden, and nothing in the product
asks for them.

**OAuth with Google.** Fewer forgotten logins, but a third party in the sign-in
path of a privacy-focused product, and an extra dependency for a feature this
small.
