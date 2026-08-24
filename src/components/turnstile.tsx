// The Turnstile widget.
//
// Rendered declaratively: Cloudflare's script finds every `.cf-turnstile` on
// the page and solves it on load, so by the time someone has chosen a file or
// typed an email the token is usually already there.
//
// Nothing renders when no site key is configured, which is what keeps a fresh
// clone working with no Cloudflare account at all.
import type { Action } from "../lib/turnstile";

export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

type Props = {
  siteKey: string | undefined;
  action: Action;
  /**
   * Where the token goes when the form is not a plain form.
   *
   * The upload page posts by XHR and the tools page by fetch, so both read the
   * token out of the DOM rather than letting the browser submit it. Giving the
   * widget a stable id is what makes that possible.
   */
  id?: string;
  class?: string;
};

export const Turnstile = ({ siteKey, action, id, class: className }: Props) =>
  siteKey ? (
    <>
      <div
        id={id}
        class={`cf-turnstile ${className ?? ""}`}
        data-sitekey={siteKey}
        data-action={action}
        data-appearance="interaction-only"
      />
      <script src={TURNSTILE_SCRIPT} async defer />
    </>
  ) : null;
