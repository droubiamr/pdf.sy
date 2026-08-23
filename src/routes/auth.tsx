import { Hono } from "hono";
import type { Env } from "../lib/context";
import { Layout } from "../components/layout";
import {
  createMagicLink, consumeMagicLink, findOrCreateUser, startSession, endSession, normalizeEmail,
} from "../lib/auth";
import { send, magicLinkEmail } from "../lib/mail";
import { siteUrl } from "../lib/urls";

export const auth = new Hono<Env>();

/* --------------------------------- login --------------------------------- */

auth.get("/login", async (c) => {
  if (c.get("user")) return c.redirect("/dashboard");
  const sent = c.req.query("sent") === "1";

  return c.html(
    <Layout title="Sign in — pdf.sy" noindex>
      <section class="mx-auto w-full max-w-md px-5 py-20">
        {sent ? (
          <div class="card rounded-xl border border-border bg-card p-6 text-center">
            <div class="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">✓</div>
            <h1 class="text-xl font-semibold tracking-tight">Check your email</h1>
            <p class="mt-2 text-sm text-muted-foreground">
              If that address has an inbox we can reach, a sign-in link is on its way.
              It works once and expires in 15 minutes.
            </p>
          </div>
        ) : (
          <>
            <h1 class="text-3xl font-semibold tracking-tight">Sign in</h1>
            <p class="mt-2 text-muted-foreground">
              No password. We email you a link that signs you straight in.
            </p>
            <form method="post" action="/api/auth/magic-link" class="mt-8 flex flex-col gap-3">
              <label for="email" class="label text-sm font-medium">Email</label>
              <input
                id="email" name="email" type="email" required autofocus
                autocomplete="email" placeholder="you@company.com" class="input"
              />
              <button type="submit" class="btn mt-1">Email me a link</button>
            </form>
            <p class="mt-6 text-sm text-muted-foreground">
              Signing in also claims any links you created on this device, so they
              stop expiring.
            </p>
          </>
        )}
      </section>
    </Layout>,
  );
});

auth.post("/api/auth/magic-link", async (c) => {
  const form = await c.req.formData();
  const email = normalizeEmail(String(form.get("email") ?? ""));

  // Deliberately vague and always the same response: this endpoint must not
  // reveal which addresses have accounts, and must not stall on the mail API.
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    const token = await createMagicLink(c.env.DB, email);
    if (token) {
      const url = new URL(`/auth/verify?token=${encodeURIComponent(token)}`, siteUrl(c)).toString();
      c.executionCtx.waitUntil(send(c.env, { to: email, ...magicLinkEmail(url) }));
    }
  }

  return c.redirect("/login?sent=1", 303);
});

auth.get("/auth/verify", async (c) => {
  const token = c.req.query("token");
  const email = token ? await consumeMagicLink(c.env.DB, token) : null;

  if (!email) {
    return c.html(
      <Layout title="Link expired — pdf.sy" noindex>
        <section class="mx-auto w-full max-w-md px-5 py-20 text-center">
          <h1 class="text-2xl font-semibold tracking-tight">That link no longer works</h1>
          <p class="mt-2 text-muted-foreground">
            Sign-in links expire after 15 minutes and can only be used once.
          </p>
          <a href="/login" class="btn mt-6">Send me a new one</a>
        </section>
      </Layout>,
      410,
    );
  }

  const user = await findOrCreateUser(c.env.DB, email);
  await startSession(c, user.id);
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
    const result = await c.env.DB.prepare(
      `UPDATE documents
          SET owner_id = ?
        WHERE manage_token = ?
          AND owner_id IS NULL
          AND id = (SELECT document_id FROM links WHERE slug = ?)`,
    ).bind(user.id, item.token, item.slug).run();
    if (result.meta.changes > 0) claimed++;
  }

  // Claimed documents belong to an account now, so their links stop expiring.
  if (claimed > 0) {
    await c.env.DB.prepare(
      `UPDATE links SET expires_at = NULL
        WHERE document_id IN (SELECT id FROM documents WHERE owner_id = ?)`,
    ).bind(user.id).run();
  }

  return c.json({ claimed });
});
