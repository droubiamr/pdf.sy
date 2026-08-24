// Turnstile: proving there is a person on the other end.
//
// This is the layer the in-Worker rate limits in lib/limits.ts were always
// meant to sit behind. Those limits key off a hashed IP, and an IP is a poor
// proxy for a person — mobile carriers put thousands of real users behind one
// address, so a limit tight enough to stop a script is also tight enough to
// block a genuine audience. A challenge asks the right question instead: not
// "how many requests has this address made" but "is this a browser with a
// human in front of it".
import type { Context } from "hono";
import type { Bindings } from "../db/schema";
import type { Env } from "./context";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The hidden field the widget injects into the form. */
export const TOKEN_FIELD = "cf-turnstile-response";

/**
 * Which surface a token was issued for.
 *
 * Bound at both ends: rendered as `data-action` on the widget and checked
 * against the verify response. Without it a token minted by the cheap widget on
 * the login page would be replayable against the expensive upload endpoint.
 */
export type Action = "upload" | "login";

type VerifyResponse = {
  success: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

/** Configured only when a secret is present. */
export const isEnabled = (env: Bindings): boolean => Boolean(env.TURNSTILE_SECRET);

/**
 * Checks a token with Cloudflare.
 *
 * Returns true when the request should proceed. Note what that means when no
 * secret is set: it returns true. That matches how mail and billing already
 * behave in this codebase — absent credentials mean the feature is off, so a
 * fresh clone still runs — but it does mean a production deploy that forgets
 * `wrangler secret put TURNSTILE_SECRET` is silently unprotected. Hence the
 * warning, and the check in the health section of SECURITY.md.
 */
export async function verify(c: Context<Env>, token: string | null, action: Action): Promise<boolean> {
  const secret = c.env.TURNSTILE_SECRET;
  if (!secret) {
    console.warn("turnstile: no TURNSTILE_SECRET set, skipping verification");
    return true;
  }

  // Cheap rejections first: an absent or absurd token never reaches the network.
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;

  let result: VerifyResponse;
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      // Cloudflare being slow must not hold a visitor's upload open forever.
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: c.req.header("cf-connecting-ip") ?? "",
      }),
    });

    if (!response.ok) throw new Error(`siteverify returned ${response.status}`);
    result = await response.json<VerifyResponse>();
  } catch (error) {
    // Fail closed, unlike the rate limiter. The limiter failing open risks
    // over-counting; this failing open would hand an attacker the bypass by
    // simply making verification unreachable.
    console.error("turnstile: verification failed", error);
    return false;
  }

  if (!result.success) {
    console.warn("turnstile: rejected", result["error-codes"]?.join(",") ?? "no reason given");
    return false;
  }

  // A token is minted for one surface, and it has to be the one being used.
  if (result.action !== action) {
    console.warn("turnstile: action mismatch", result.action, "expected", action);
    return false;
  }

  return hostnameAllowed(c, result.hostname);
}

/**
 * Ties the token to the site that served the form.
 *
 * `TURNSTILE_HOSTNAMES` is the explicit allowlist and is what production should
 * use. Without it this falls back to the host the request arrived on, which
 * keeps the project's zero-config property — every link, QR code and sign-in
 * URL here already follows the serving host, so a hard-coded domain would break
 * the first workers.dev deploy. The fallback is weaker than an allowlist, and
 * SECURITY.md says so.
 */
function hostnameAllowed(c: Context<Env>, hostname: string | undefined): boolean {
  if (!hostname) return false;

  const configured = c.env.TURNSTILE_HOSTNAMES?.split(",").map((h) => h.trim()).filter(Boolean);

  const allowed = configured?.length
    ? configured
    : [new URL(c.req.url).hostname];

  if (allowed.includes(hostname)) return true;

  console.warn("turnstile: hostname mismatch", hostname, "allowed", allowed.join(","));
  return false;
}

/** Pulls the token out of a submitted form. */
export const tokenFrom = (form: FormData): string | null =>
  (form.get(TOKEN_FIELD) as string | null) ?? null;
