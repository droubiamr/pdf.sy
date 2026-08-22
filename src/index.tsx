import { Hono } from "hono";
import type { Bindings } from "./db/schema";
import { pages } from "./routes/pages";
import { api } from "./routes/api";
import { view } from "./routes/view";
import { Layout } from "./components/layout";

const app = new Hono<{ Bindings: Bindings }>();

app.route("/api", api);
app.route("/", pages);

// Registered last: `/:slug` is a catch-all and must lose to every real route.
app.route("/", view);

app.notFound((c) =>
  c.html(
    <Layout title="Not found — pdf.sy">
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
