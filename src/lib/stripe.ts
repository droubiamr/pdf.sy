// Stripe over plain REST. The Node SDK assumes Node crypto and http, neither of
// which a Worker has; the three calls we need are shorter than the shim.
import type { Bindings } from "../db/schema";

const API = "https://api.stripe.com/v1";

async function call<T>(env: Bindings, path: string, form: Record<string, string>): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
  });

  const payload = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? `Stripe ${path} failed (${response.status})`);
  return payload;
}

export function createCheckoutSession(
  env: Bindings,
  opts: { priceId: string; plan: string; userId: string; email: string; customerId: string | null; successUrl: string; cancelUrl: string },
) {
  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": "1",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.userId,
    "metadata[user_id]": opts.userId,
    "metadata[plan]": opts.plan,
    "subscription_data[metadata][user_id]": opts.userId,
    "subscription_data[metadata][plan]": opts.plan,
    allow_promotion_codes: "true",
  };
  // Reuse the customer if we have one, so a second subscription does not create
  // a second customer record for the same person.
  if (opts.customerId) form.customer = opts.customerId;
  else form.customer_email = opts.email;

  return call<{ id: string; url: string }>(env, "/checkout/sessions", form);
}

export function createPortalSession(env: Bindings, customerId: string, returnUrl: string) {
  return call<{ url: string }>(env, "/billing_portal/sessions", {
    customer: customerId,
    return_url: returnUrl,
  });
}

/* ------------------------------- webhooks -------------------------------- */

const TOLERANCE_SECONDS = 300;

/**
 * Verifies Stripe's `t=…,v1=…` signature over the raw body.
 *
 * The raw text matters: re-serialising the JSON changes the bytes and the
 * signature stops matching, which is the classic way this check gets broken.
 */
export async function verifyWebhook(
  rawBody: string, header: string | undefined, secret: string | undefined,
): Promise<boolean> {
  if (!header || !secret) return false;

  const parts = Object.fromEntries(
    header.split(",").map((piece) => piece.split("=", 2) as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!timestamp || !parts.v1) return false;

  // Reject replays of an old, genuinely-signed event.
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const expected = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");

  return timingSafeEqual(expected, parts.v1);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: {
      id?: string;
      customer?: string;
      subscription?: string;
      status?: string;
      current_period_end?: number;
      client_reference_id?: string;
      metadata?: Record<string, string>;
      items?: { data: { price: { id: string } }[] };
    };
  };
};
