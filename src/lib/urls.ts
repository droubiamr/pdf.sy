import type { Context } from "hono";
import type { Env } from "./context";

/**
 * The origin this deployment is actually being served from.
 *
 * Everything user-facing — share links, QR codes, and above all the magic-link
 * sign-in URL — has to point at the host the visitor is really on. Hard-coding
 * a domain means the first deploy to a *.workers.dev URL emails people a
 * sign-in link for a site that does not exist yet.
 *
 * SITE_URL stays available as an override for when the canonical domain and the
 * serving host genuinely differ (a preview alias, say), but it is not required.
 */
export function siteUrl(c: Context<Env>): string {
  const override = c.env.SITE_URL?.trim();
  return override || new URL(c.req.url).origin;
}
