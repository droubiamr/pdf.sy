// Response headers.
//
// The policy below is strict on purpose — `default-src 'none'` means anything
// not named here is refused, so adding a new external dependency will visibly
// break rather than quietly widen the surface.
//
// Inline scripts are allowed by HASH, not by 'unsafe-inline' and not by nonce.
// Both inline blocks in the layout are static, so their hashes are fixed at
// build time; a nonce would mean threading a per-request value through every
// Layout call site for no additional safety. If you edit an inline script and
// it stops running, that is this file doing its job — the hash moved.
import type { Context, Next } from "hono";
import type { Env } from "./context";
import { INLINE_SCRIPTS } from "../components/layout";

/** base64 SHA-256, the form CSP wants. */
async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

// Computed once per isolate, then reused. Kept as the promise rather than the
// value so concurrent first requests share one computation.
let hashes: Promise<string> | null = null;

function scriptHashes(): Promise<string> {
  hashes ??= Promise.all(INLINE_SCRIPTS.map(sha256Base64)).then((list) =>
    list.map((hash) => `'sha256-${hash}'`).join(" "),
  );
  return hashes;
}

/**
 * Turnstile needs three separate permissions, and it is worth naming why: the
 * script itself, an iframe to draw the challenge in, and a channel to talk to
 * Cloudflare. Miss any one and the widget fails in a different confusing way —
 * which is the policy working as intended. `default-src 'none'` means a new
 * external dependency breaks loudly instead of quietly widening the surface.
 */
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

async function contentSecurityPolicy(): Promise<string> {
  return [
    "default-src 'none'",
    // 'wasm-unsafe-eval' is pdf.js: it compiles WebAssembly for some image
    // codecs. It permits WASM only — it does not re-enable eval() or new
    // Function(), which is why it is not simply 'unsafe-eval'.
    `script-src 'self' 'wasm-unsafe-eval' ${TURNSTILE_ORIGIN} ${await scriptHashes()}`,
    // The challenge renders in an iframe from Cloudflare's origin.
    `frame-src ${TURNSTILE_ORIGIN}`,
    // Tailwind is a static file, but the stats page sets bar widths as inline
    // style attributes. Inline *styles* cannot execute; this is a real but
    // small concession and the alternative is a class for every percentage.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    // The viewer fetches the PDF from our own origin; Turnstile reports back to
    // Cloudflare. Nothing else may open a connection.
    `connect-src 'self' ${TURNSTILE_ORIGIN}`,
    // pdf.js loads its worker from /vendor, and falls back to a blob worker.
    "worker-src 'self' blob:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "manifest-src 'self'",
  ].join("; ");
}

/**
 * Applied to every response. The CSP is only attached to HTML — a PDF byte
 * stream has no document context for it to govern, and Chrome's built-in
 * viewer is out of its reach anyway.
 */
export async function securityHeaders(c: Context<Env>, next: Next): Promise<void> {
  await next();

  const headers = c.res.headers;

  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  // Keeps ?t=<manage_token> out of other people's referrer logs. The browser
  // default already trims the path cross-origin; this removes the header
  // entirely, which also stops the token reaching Google Fonts.
  headers.set("referrer-policy", "same-origin");
  headers.set(
    "permissions-policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  );
  headers.set("cross-origin-opener-policy", "same-origin");

  if (new URL(c.req.url).protocol === "https:") {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }

  if (headers.get("content-type")?.includes("text/html")) {
    headers.set("content-security-policy", await contentSecurityPolicy());
  }
}
