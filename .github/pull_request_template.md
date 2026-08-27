## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- The reasoning, and anything you deliberately did NOT do. If this settles a
     question that will come up again, consider a record in docs/decisions/. -->

## Checks

- [ ] `npm run typecheck` passes
- [ ] Checked in both English and Arabic, if it touches the interface
- [ ] New user-facing strings added to **both** `en.ts` and `ar.ts`
- [ ] No hard-coded colours, no physical CSS properties (`ml-`, `text-left`)
- [ ] Migration added *and* a note below if production needs `npm run db:remote`

## Deploy notes

<!-- Anything that has to happen around the merge: a migration to run first, a
     secret to set, a Cloudflare dashboard change. Write "none" if none. -->
