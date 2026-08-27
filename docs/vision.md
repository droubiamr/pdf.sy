# What we are building

**pdf.sy is every PDF tool in one place — and the only one that tells you what
happened after you shared it.**

Merge, split, rotate, compress, convert, edit, sign. The whole toolbox someone
reaches for when they have a PDF problem, in the mould of iLovePDF or Smallpdf.
Plus the thing none of them offer: send a PDF as a link and find out who opened
it, for how long, and which page they stopped on.

## Two halves, and they need each other

**The toolbox is how people find us.** "Free PDF merge" is a search term with
enormous volume. "Tracked PDF link" is not. Every tool is an entry point, and
somebody who has just merged two files is one click from sharing the result.

**Sharing is how we get paid.** Anyone can host a file; what someone will pay
for is knowing whether the proposal they sent on Tuesday was actually read. It
is also the hardest half to copy — a competitor can ship a merge tool in a
weekend, but analytics means a viewer, a beacon, a database and a story about
privacy.

Neither half works alone. A toolbox with no business model is a cost centre. A
tracking product with no toolbox has to buy every visitor it gets.

## What that means in practice

**Both halves get the same care.** The tools are not a funnel to be thrown
together — they are half the product. Proper error states, proper behaviour on a
phone, both languages, the same polish as the viewer.

**Every tool ends with an offer to share.** That is the seam between the two
halves and it is where the business lives. The tools page already does this
after every operation; anything new should too.

**The cost rule is not negotiable.** Anything that can run in the browser, runs
in the browser. CPU is the only meaningful cost here — R2 has no egress fee and
D1 queries are cheap — and a queue of strangers compressing 40 MB scans on our
CPU is a bill with no ceiling and no revenue attached. Compress, convert and OCR
are exactly where that bites, so anything that genuinely needs a server gets
deliberate limits designed before it ships, not after. See
[ADR 0005](decisions/0005-browser-side-tools.md).

**Never advertise a tool that does not work.** Listing something unbuilt with a
"Soon" badge is fine and honest; letting somebody click through to nothing is
not. The landing page follows this — the three unbuilt tools render as plain
cards rather than links.

## The free tier is genuinely good on purpose

Every browser-side tool is free and unlimited, for anyone, forever. There is no
version of this where we put merge behind a paywall — that is the acquisition
surface, and crippling it would be charging for the thing that brings people in.

A free account also gets five active links, view counts and QR codes. What it
does not get is the answer to "who read it, and how far did they get". The
paywall sits precisely on the curiosity the product creates.

That is also why anonymous links expire after seven days and signed-in links
never do. That gap is the entire signup pitch, and it is worth protecting.

## Bilingual from the start

The site ships in English and Arabic with full right-to-left support. Not
localisation bolted on afterwards: every layout uses logical CSS properties, so
the interface mirrors itself under `dir="rtl"` with no Arabic-specific rule
anywhere.

Treat both languages as first-class. A feature that only reads correctly in
English is not finished.

## Where we are

| | Built | Next | Later |
| --- | --- | --- | --- |
| **Tools** | Merge, split, rotate | Compress | Convert, edit, sign, OCR |
| **Sharing** | Tracked links, viewer, per-page dwell, QR | — | Email gating, watermarks |
| **Accounts** | Magic links, dashboard, notifications | — | Teams |
| **Money** | Stripe, link controls, versioning | — | Custom domains, public API |
| **Ops** | Admin console, moderation, retention | Turnstile secret, WAF rules | — |

The site is in public beta: real uploads, live Stripe prices, changing daily.

## What we are not

- **Not a PDF editor in the Acrobat sense.** Reorder, delete and add pages —
  not a full text-and-vector editing surface.
- **Not a storage product.** Files are kept because a link points at them, not
  as a place to keep documents. Anonymous uploads expire on purpose.
- **Not an enterprise DMS.** No approval flows, no retention policies, no
  compliance certifications.
