// Reading the Turnstile token from a page that does not submit a plain form.
//
// The upload page posts by XHR and the tools page by fetch, so neither gets the
// browser's automatic "include the hidden field" behaviour. Both have to fetch
// the token themselves, and both have the same awkward timing: the widget
// solves asynchronously, and on the upload page the request begins the instant
// someone drops a file — possibly before the challenge has finished.
//
// Hence `turnstileToken()`: it resolves as soon as a token exists, waits if one
// is still being minted, and gives up rather than hanging forever.

type TurnstileApi = {
  getResponse: (container?: string | HTMLElement) => string | undefined;
  reset: (container?: string | HTMLElement) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

/** The field name the server reads. Must match TOKEN_FIELD in lib/turnstile.ts. */
export const TOKEN_FIELD = "cf-turnstile-response";

const POLL_MS = 100;

/**
 * The current token, waiting for the widget if necessary.
 *
 * Returns null when Turnstile is not on the page at all — a build with no site
 * key configured — so callers submit without one and the server, which is also
 * unconfigured in that case, does not ask for one.
 */
export async function turnstileToken(selector: string, timeoutMs = 15_000): Promise<string | null> {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // The widget writes into a hidden input inside its own container; reading
    // that works even before window.turnstile has finished initialising.
    const field = element.querySelector<HTMLInputElement>(`[name="${TOKEN_FIELD}"]`);
    if (field?.value) return field.value;

    const viaApi = window.turnstile?.getResponse(element);
    if (viaApi) return viaApi;

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  return null;
}

/**
 * Throws the used token away and asks for a fresh one.
 *
 * Tokens are single-use. Without this, a second upload in the same tab reuses a
 * spent token and is rejected — which reads to the person doing it as the
 * upload being broken.
 */
export function resetTurnstile(selector: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element && window.turnstile) window.turnstile.reset(element);
}
