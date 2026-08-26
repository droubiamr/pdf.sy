import { Hono } from "hono";
import type { Env } from "../lib/context";
import { Layout } from "../components/layout";
import {
  createMagicLink, consumeMagicLink, findOrCreateUser, startSession, endSession, normalizeEmail,
} from "../lib/auth";
import { send, magicLinkEmail } from "../lib/mail";
import { siteUrl } from "../lib/urls";
import { hitByClient } from "../lib/limits";
import { verify as verifyTurnstile, tokenFrom } from "../lib/turnstile";
import { Turnstile } from "../components/turnstile";
import { t } from "../lib/i18n";

export const auth = new Hono<Env>();

/* --------------------------------- login --------------------------------- */

auth.get("/login", async (c) => {
  if (c.get("user")) return c.redirect("/dashboard");
  const s = t(c);
  const sent = c.req.query("sent") === "1";
  const unverified = c.req.query("verify") === "1";

  return c.html(
    <Layout c={c} title={s.auth.title} noindex>
      <section class="mx-auto w-full max-w-md px-5 py-20">
        {sent ? (
          <div class="card rounded-xl border border-border bg-card p-6 text-center">
            <div class="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">✓</div>
            <h1 class="text-xl font-semibold tracking-tight">{s.auth.sentH1}</h1>
            <p class="mt-2 text-sm text-muted-foreground">{s.auth.sentBody}</p>
          </div>
        ) : (
          <>
            <h1 class="text-3xl font-semibold tracking-tight">{s.auth.h1}</h1>
            <p class="mt-2 text-muted-foreground">{s.auth.lead}</p>
            {unverified && (
              <p class="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {s.auth.unverified}
              </p>
            )}
            <form method="post" action="/api/auth/magic-link" class="mt-8 flex flex-col gap-3">
              <label for="email" class="label text-sm font-medium">{s.auth.emailLabel}</label>
              {/* An address is always a Latin, left-to-right string, whichever
                  way the page around it runs. */}
              <input
                id="email" name="email" type="email" required autofocus
                autocomplete="email" placeholder={s.auth.emailPlaceholder} dir="ltr" class="input"
              />
              {/* Ticked by default: the overwhelming majority of sign-ins are
                  somebody on their own laptop, and asking them to opt in to the
                  normal case every time is the friction this box exists to
                  remove. Unticking it is the deliberate act, not ticking it.

                  Basecoat's `.field` with `data-orientation="horizontal"` does
                  the layout — the control beside a <section> holding its label
                  and its description, aligned to the top. Same component the
                  rest of Basecoat's forms use; nothing here is hand-rolled. */}
              <div class="field mt-1" data-orientation="horizontal">
                <input
                  type="checkbox" id="remember" name="remember" value="1" checked
                  aria-describedby="remember-help" class="input size-4 shrink-0"
                />
                <section>
                  <p class="text-sm">
                    <label for="remember" class="cursor-pointer">{s.auth.stayLabel}</label>
                    {/* The superscript question mark, m²-style.
                    
                        Tailwind's preflight already gives <sup> the three
                        properties this needs — 75% size, raised half an em, and
                        `position: relative` — so the character sits on the
                        shoulder of the last letter with no positioning of our
                        own. It is deliberately OUTSIDE the <label>: a click
                        anywhere inside a label toggles its checkbox, so a `?`
                        in there would silently untick the box people came to
                        read about.

                        `aria-hidden`, and no tabindex, because Basecoat's
                        tooltip is hover-only by design — it explicitly hides
                        itself on :focus-visible. A tab stop that shows nothing
                        is worse than no tab stop. Everyone not using a mouse
                        gets the real sentence below instead. */}
                    <sup
                      aria-hidden="true"
                      data-tooltip={s.auth.stayTip}
                      data-side="top"
                      class="hidden cursor-help text-muted-foreground before:w-64 before:rounded-md before:bg-popover before:px-3 before:py-2 before:text-xs before:font-normal before:whitespace-normal before:text-popover-foreground before:shadow-md before:ring-1 before:ring-border sm:inline"
                    >
                      ?
                    </sup>
                  </p>

                  {/* Visible on a phone, where there is no hover and the tooltip
                      above can never open. From `sm` up it becomes `sr-only`
                      rather than `hidden`: still announced by a screen reader
                      through `aria-describedby`, which a `display: none`
                      element would not be. One sentence, one place, reaching
                      every reader by whichever route suits their device. */}
                  <p id="remember-help" class="text-xs text-muted-foreground sm:sr-only">
                    {s.auth.stayTip}
                  </p>
                </section>
              </div>

              {/* A plain form, so the browser submits the token itself — no
                  client code needed here, unlike the upload pages. */}
              <Turnstile action="login" siteKey={c.env.TURNSTILE_SITE_KEY} />
              <button type="submit" class="btn mt-1">{s.auth.submit}</button>
            </form>
            <p class="mt-6 text-sm text-muted-foreground">{s.auth.claimNote}</p>
          </>
        )}
      </section>
    </Layout>,
  );
});

auth.post("/api/auth/magic-link", async (c) => {
  const form = await c.req.formData();
  const email = normalizeEmail(String(form.get("email") ?? "").slice(0, 320));
  // An unticked checkbox is not submitted at all, so absence is the "no". The
  // box is ticked by default, which makes the common path the one that arrives.
  const remember = form.get("remember") === "1";

  // The per-address limit in lib/auth.ts stops one inbox being flooded. It does
  // nothing about the opposite shape of the same abuse: one caller asking for
  // links to ten thousand *different* addresses, which turns this form into a
  // mailer aimed at people who have never used the site — on our sending
  // reputation and our Resend bill. That needs a per-caller limit, here.
  const verdict = await hitByClient(c, "magicLink");

  // Turnstile is the better instrument for this than the rate limit above: it
  // asks whether there is a person here rather than how many requests this
  // address has made, so it does not punish an office or a mobile network
  // sharing one IP. Checked here rather than earlier so a failure is as silent
  // as every other refusal on this route.
  const human = await verifyTurnstile(c, tokenFrom(form), "login");

  // The one refusal on this route that is *not* silent, and the exception is
  // deliberate. Everything below stays vague because whether an address has an
  // account is nobody's business — but the challenge is rendered on the page,
  // so saying it did not pass leaks nothing that is not already visible. The
  // widget is `interaction-only`, meaning it stays invisible until it wants a
  // click, so the common case is someone who never saw a checkbox appear.
  // Sending them to "check your email" for a link that was never sent leaves
  // them waiting on nothing.
  if (!human) return c.redirect("/login?verify=1", 303);

  // Deliberately vague and always the same response: this endpoint must not
  // reveal which addresses have accounts, and must not stall on the mail API.
  // A refusal is silent for the same reason — telling a caller they have been
  // limited also tells them the limit exists and where it sits.
  if (verdict.ok && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    const token = await createMagicLink(c.env.DB, email, remember);
    if (token) {
      const url = new URL(`/auth/verify?token=${encodeURIComponent(token)}`, siteUrl(c)).toString();
      // Written in the language they are reading the site in. This is the one
      // email we can be sure about: it is a reply to a form they just submitted.
      c.executionCtx.waitUntil(send(c.env, { to: email, ...magicLinkEmail(url, c.get("lang")) }));
    }
  }

  return c.redirect("/login?sent=1", 303);
});

auth.get("/auth/verify", async (c) => {
  const token = c.req.query("token");
  const link = token ? await consumeMagicLink(c.env.DB, token) : null;

  if (!link) {
    const s = t(c);
    return c.html(
      <Layout c={c} title={s.auth.expiredTitle} noindex>
        <section class="mx-auto w-full max-w-md px-5 py-20 text-center">
          <h1 class="text-2xl font-semibold tracking-tight">{s.auth.expiredH1}</h1>
          <p class="mt-2 text-muted-foreground">{s.auth.expiredBody}</p>
          <a href="/login" class="btn mt-6">{s.auth.sendNew}</a>
        </section>
      </Layout>,
      410,
    );
  }

  const user = await findOrCreateUser(c.env.DB, link.email);
  await startSession(c, user.id, link.remember);
  await c.env.DB.prepare(`UPDATE users SET last_seen_at = ? WHERE id = ?`).bind(Date.now(), user.id).run();

  return c.redirect("/dashboard?welcome=1", 303);
});

auth.post("/api/auth/logout", async (c) => {
  await endSession(c);
  return c.redirect("/", 303);
});

/**
 * Adopts a document created before signing in. The manage token proves the
 * caller was the one who uploaded it, so no further check is needed.
 */
auth.post("/api/claim", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "not_signed_in" }, 401);

  const body = await c.req.json<{ items?: { slug: string; token: string }[] }>().catch(() => null);
  const items = (body?.items ?? []).slice(0, 100);
  if (items.length === 0) return c.json({ claimed: 0 });

  let claimed = 0;
  for (const item of items) {
    if (typeof item?.slug !== "string" || typeof item?.token !== "string") continue;

    const result = await c.env.DB.prepare(
      `UPDATE documents
          SET owner_id = ?
        WHERE manage_token = ?
          AND owner_id IS NULL
          AND id = (SELECT document_id FROM links WHERE slug = ?)`,
    ).bind(user.id, item.token, item.slug).run();

    if (result.meta.changes === 0) continue;
    claimed++;

    // Only this link stops expiring.
    //
    // This used to clear expires_at across every link the account owned, so
    // claiming one anonymous upload silently wiped deliberate expiry dates on
    // everything else — including dates set through the paid expiry feature,
    // which is a security control the owner chose and paid for. Scoping it to
    // the slug just claimed is the whole fix.
    await c.env.DB.prepare(
      `UPDATE links SET expires_at = NULL WHERE slug = ?`,
    ).bind(item.slug).run();
  }

  return c.json({ claimed });
});
