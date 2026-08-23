import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "./lib/context";
import { currentUser, SESSION_COOKIE } from "./lib/auth";
import { pages } from "./routes/pages";
import { api } from "./routes/api";
import { view } from "./routes/view";
import { auth } from "./routes/auth";
import { dashboard } from "./routes/dashboard";
import { links } from "./routes/links";
import { billing } from "./routes/billing";
import { Layout } from "./components/layout";

const app = new Hono<Env>();

// Resolve the signed-in user once per request. The cookie check first means
// anonymous viewer traffic — the overwhelming majority — costs no query at all.
app.use("*", async (c, next) => {
  c.set("user", getCookie(c, SESSION_COOKIE) ? await currentUser(c) : null);
  await next();
});

app.route("/", auth);
app.route("/", dashboard);
app.route("/", links);
app.route("/", billing);
app.route("/api", api);
app.route("/", pages);

// Registered last: `/:slug` is a catch-all and must lose to every real route.
app.route("/", view);

app.notFound((c) =>
  c.html(
    <Layout title="Not found — pdf.sy" user={c.get("user")}>
      <section class="mx-auto w-full max-w-lg px-5 py-24 text-center">
        <h1 class="text-2xl font-semibold tracking-tight">Nothing here</h1>
        <p class="mt-2 text-muted-foreground">That page or link does not exist.</p>
        <a href="/" class="btn mt-6">Go home</a>
      </section>
    </Layout>,
    404,
  ),
);

export default app;
