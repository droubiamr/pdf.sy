import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "./lib/context";
import type { Bindings } from "./db/schema";
import { currentUser, SESSION_COOKIE } from "./lib/auth";
import { securityHeaders } from "./lib/security";
import { detectLang, t } from "./lib/i18n";
import { sweep } from "./lib/retention";
import { pages } from "./routes/pages";
import { api } from "./routes/api";
import { view } from "./routes/view";
import { auth } from "./routes/auth";
import { dashboard } from "./routes/dashboard";
import { links } from "./routes/links";
import { billing } from "./routes/billing";
import { legal } from "./routes/legal";
import { lang } from "./routes/lang";
import { admin } from "./routes/admin";
import { adminActions } from "./routes/admin-actions";
import { Layout } from "./components/layout";

const app = new Hono<Env>();

// First and outermost, so it also covers 404s, thrown errors, and every static
// asset — the responses easiest to forget and just as worth protecting.
app.use("*", securityHeaders);

// Resolve the signed-in user once per request. The cookie check first means
// anonymous viewer traffic — the overwhelming majority — costs no query at all.
app.use("*", async (c, next) => {
  c.set("user", getCookie(c, SESSION_COOKIE) ? await currentUser(c) : null);
  await next();
});

// Language, resolved once and read everywhere through `t(c)`.
//
// Deliberately a per-request variable rather than a module-level one. Requests
// interleave at every `await` inside a Worker isolate, so a shared "current
// language" global would be read by one request after another had already
// overwritten it — a page in the wrong language, and only under load.
app.use("*", async (c, next) => {
  c.set("lang", detectLang(c));
  await next();
});

// A page cached by the CDN must not be handed to a reader whose cookie asks for
// the other language. Naming the cookie here is what keeps the two variants
// apart wherever this response is stored.
app.use("*", async (c, next) => {
  await next();
  if (c.res.headers.get("content-type")?.includes("text/html")) {
    c.res.headers.append("vary", "cookie, accept-language");
  }
});

// Before everything else: /admin/* is its own tree, gated by its own
// middleware, and nothing below should ever get a chance to answer for it.
app.route("/", admin);
app.route("/", adminActions);

app.route("/", auth);
app.route("/", dashboard);
app.route("/", links);
app.route("/", billing);
app.route("/", legal);
app.route("/", lang);
app.route("/api", api);
app.route("/", pages);

// Registered last: `/:slug` is a catch-all and must lose to every real route.
app.route("/", view);

app.notFound((c) => {
  const s = t(c);
  return c.html(
    <Layout c={c} title={s.notFound.title}>
      <section class="mx-auto w-full max-w-lg px-5 py-24 text-center">
        <h1 class="text-2xl font-semibold tracking-tight">{s.notFound.h1}</h1>
        <p class="mt-2 text-muted-foreground">{s.notFound.body}</p>
        <a href="/" class="btn mt-6">{s.notFound.home}</a>
      </section>
    </Layout>,
    404,
  );
});

/**
 * Two entry points now, not one.
 *
 * `scheduled` is what makes the deletion promise in the privacy policy true:
 * expiry alone only stopped a link resolving, and the file stayed in R2
 * indefinitely. See lib/retention.ts. The cron itself is declared in
 * wrangler.toml — without that entry this handler is never called.
 */
export default {
  fetch: (request: Request, env: Bindings, ctx: ExecutionContext) =>
    app.fetch(request, env, ctx),

  scheduled: (_event: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    ctx.waitUntil(
      sweep(env).catch((error) => console.error("retention sweep failed", error)),
    );
  },
} satisfies ExportedHandler<Bindings>;
