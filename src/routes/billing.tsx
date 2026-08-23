import { Hono } from "hono";
import type { Env } from "../lib/context";
import type { Bindings } from "../db/schema";
import { Layout } from "../components/layout";
import { PRICING, planOf, type Plan } from "../lib/plans";
import { createCheckoutSession, createPortalSession, verifyWebhook, type StripeEvent } from "../lib/stripe";
import { siteUrl } from "../lib/urls";

export const billing = new Hono<Env>();

/* -------------------------------- pricing -------------------------------- */

billing.get("/pricing", (c) => {
  const user = c.get("user");
  const current = planOf(user);

  return c.html(
    <Layout
      user={user}
      title="Pricing — pdf.sy"
      description="Free to share. Twelve dollars a month to know who read it."
    >
      <section class="mx-auto w-full max-w-4xl px-5 py-16">
        <h1 class="text-3xl font-semibold tracking-tight">Simple pricing</h1>
        <p class="mt-2 max-w-[55ch] text-muted-foreground">
          The free tier is genuinely useful — a link nobody can open is not much
          of a product. You pay when you want to know what happened after you sent it.
        </p>

        <div class="mt-10 grid items-stretch gap-4 md:grid-cols-3">
          <Tier
            name="Free" price="$0" period="forever" current={Boolean(user) && current === "free"}
            features={[
              "5 active links",
              "Total view counts",
              "All browser-side tools",
              "QR code for every link",
              "Revoke any link",
            ]}
          />
          <Tier
            name={PRICING.pro.label} price={PRICING.pro.price} period={PRICING.pro.period}
            highlight current={Boolean(user) && current === "pro"} plan="pro"
            features={[
              "Unlimited links",
              "Per-page reading time",
              "Email when someone opens it",
              "Password, expiry, block downloads",
              "Replace the file, keep the link",
              "No pdf.sy badge",
            ]}
          />
          <Tier
            name={PRICING.business.label} price={PRICING.business.price} period={PRICING.business.period}
            current={Boolean(user) && current === "business"} plan="business"
            features={[
              "Everything in Pro",
              "Team spaces",
              "Require an email to view",
              "Per-viewer watermarks",
              "Custom domain",
              "API access",
            ]}
          />
        </div>

        {user && user.stripe_customer_id && (
          <p class="mt-8 text-sm text-muted-foreground">
            <a href="/api/billing/portal" class="font-medium underline">Manage your subscription</a>
            {" "}— change plan, update card, or cancel.
          </p>
        )}
      </section>
    </Layout>,
  );
});

const Tier = ({
  name, price, period, features, highlight, current, plan,
}: {
  name: string; price: string; period: string; features: string[];
  highlight?: boolean; current: boolean; plan?: Plan;
}) => (
  <div class={`card h-full rounded-xl border bg-card p-6 ${highlight ? "border-primary shadow-sm" : "border-border"}`}>
    <header class="mb-4">
      <h2 class="card-title font-semibold">{name}</h2>
      <p class="mt-2">
        <span class="text-3xl font-semibold tracking-tight">{price}</span>
        <span class="ml-1.5 text-sm text-muted-foreground">{period}</span>
      </p>
    </header>
    <ul class="flex flex-col gap-2 text-sm">
      {features.map((feature) => (
        <li class="flex gap-2">
          <span aria-hidden="true" class="text-primary">✓</span>
          <span>{feature}</span>
        </li>
      ))}
    </ul>
    <footer class="mt-auto pt-6">
      {current ? (
        <span class="btn w-full" data-variant="outline" aria-disabled="true">Your plan</span>
      ) : plan ? (
        <form method="post" action="/api/billing/checkout" class="w-full">
          <input type="hidden" name="plan" value={plan} />
          <button type="submit" class="btn w-full" data-variant={highlight ? "primary" : "outline"}>
            Choose {name}
          </button>
        </form>
      ) : (
        <a href="/new" class="btn w-full" data-variant="outline">Start free</a>
      )}
    </footer>
  </div>
);

/* -------------------------------- checkout ------------------------------- */

billing.post("/api/billing/checkout", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login", 303);

  const form = await c.req.formData();
  const plan = String(form.get("plan") ?? "pro") as Plan;
  const priceId = plan === "business" ? c.env.STRIPE_PRICE_BUSINESS : c.env.STRIPE_PRICE_PRO;

  if (!c.env.STRIPE_SECRET_KEY || !priceId) {
    return c.redirect("/pricing?error=billing_not_configured", 303);
  }

  try {
    const session = await createCheckoutSession(c.env, {
      priceId,
      plan,
      userId: user.id,
      email: user.email,
      customerId: user.stripe_customer_id ?? null,
      successUrl: new URL("/dashboard?upgraded=1", siteUrl(c)).toString(),
      cancelUrl: new URL("/pricing", siteUrl(c)).toString(),
    });
    return c.redirect(session.url, 303);
  } catch (error) {
    console.error("checkout failed", error);
    return c.redirect("/pricing?error=checkout_failed", 303);
  }
});

billing.get("/api/billing/portal", async (c) => {
  const user = c.get("user");
  if (!user?.stripe_customer_id) return c.redirect("/pricing", 303);

  try {
    const session = await createPortalSession(
      c.env, user.stripe_customer_id, new URL("/dashboard", siteUrl(c)).toString(),
    );
    return c.redirect(session.url, 303);
  } catch (error) {
    console.error("portal failed", error);
    return c.redirect("/pricing?error=portal_failed", 303);
  }
});

/* -------------------------------- webhook -------------------------------- */

billing.post("/api/billing/webhook", async (c) => {
  // Read the body as text, not JSON: the signature covers these exact bytes.
  const raw = await c.req.text();
  const valid = await verifyWebhook(raw, c.req.header("stripe-signature"), c.env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return c.json({ error: "bad_signature" }, 400);

  const event = JSON.parse(raw) as StripeEvent;
  const object = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const userId = object.client_reference_id ?? object.metadata?.user_id;
      if (!userId) break;
      await applyPlan(c.env, userId, {
        plan: (object.metadata?.plan as Plan) ?? "pro",
        status: "active",
        customerId: object.customer ?? null,
        subscriptionId: object.subscription ?? null,
        renewsAt: null,
      });
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const userId = object.metadata?.user_id ?? (await userIdForCustomer(c.env, object.customer));
      if (!userId) break;
      // Stripe is the source of truth: anything not actively paying is free.
      const paying = object.status === "active" || object.status === "trialing";
      await applyPlan(c.env, userId, {
        plan: paying ? ((object.metadata?.plan as Plan) ?? "pro") : "free",
        status: object.status ?? null,
        customerId: object.customer ?? null,
        subscriptionId: object.id ?? null,
        renewsAt: object.current_period_end ? object.current_period_end * 1000 : null,
      });
      break;
    }

    case "customer.subscription.deleted": {
      const userId = object.metadata?.user_id ?? (await userIdForCustomer(c.env, object.customer));
      if (!userId) break;
      await applyPlan(c.env, userId, {
        plan: "free", status: "canceled",
        customerId: object.customer ?? null, subscriptionId: null, renewsAt: null,
      });
      break;
    }

    default:
      break; // Everything else is acknowledged and ignored.
  }

  return c.json({ received: true });
});

async function userIdForCustomer(env: Bindings, customerId: string | undefined): Promise<string | null> {
  if (!customerId) return null;
  const row = await env.DB.prepare(`SELECT id FROM users WHERE stripe_customer_id = ?`)
    .bind(customerId).first<{ id: string }>();
  return row?.id ?? null;
}

async function applyPlan(
  env: Bindings, userId: string,
  fields: { plan: Plan; status: string | null; customerId: string | null; subscriptionId: string | null; renewsAt: number | null },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE users
        SET plan = ?,
            plan_status = ?,
            plan_renews_at = ?,
            stripe_customer_id = COALESCE(?, stripe_customer_id),
            stripe_subscription_id = COALESCE(?, stripe_subscription_id)
      WHERE id = ?`,
  ).bind(fields.plan, fields.status, fields.renewsAt, fields.customerId, fields.subscriptionId, userId).run();
}
