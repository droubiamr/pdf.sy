// Language: which one this request is in, and how to move between them.
//
// There is no library here on purpose. Two languages, one cookie, and a
// dictionary of plain objects is the whole mechanism — and a Worker that boots
// for every request is exactly the place not to pay for an i18n framework.
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "./context";
import { en, type Strings } from "./strings/en";
import { ar } from "./strings/ar";

export type Lang = "en" | "ar";

export const LANGS: readonly Lang[] = ["en", "ar"];

/** Set by the switch route below, read by the middleware. A year is long
 *  enough that a returning visitor never has to choose twice. */
export const LANG_COOKIE = "pdfsy-lang";
export const LANG_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const STRINGS: Record<Lang, Strings> = { en, ar };

export const isLang = (value: unknown): value is Lang =>
  value === "en" || value === "ar";

/** Which way the page runs. Drives `dir` on <html>, and nothing else needs to
 *  know — every direction-sensitive utility in the templates is logical
 *  (`ms-auto`, `text-start`) rather than physical (`ml-auto`, `text-left`). */
export const dirOf = (lang: Lang): "ltr" | "rtl" => (lang === "ar" ? "rtl" : "ltr");

/**
 * The language for this request, in priority order:
 *
 *   1. The cookie — an explicit choice, and it outranks everything.
 *   2. `Accept-Language` — the browser's own preference, which is how an
 *      Arabic-speaking visitor gets Arabic on their very first page.
 *   3. English.
 *
 * Note this is deliberately not tied to the country the request came from.
 * Plenty of people in Syria read the web in English, and plenty of Arabic
 * speakers are not in Syria; the browser setting is the better signal.
 */
export function detectLang(c: Context<Env>): Lang {
  const chosen = getCookie(c, LANG_COOKIE);
  if (isLang(chosen)) return chosen;

  const header = c.req.header("accept-language") ?? "";
  // "ar-SY,ar;q=0.9,en;q=0.8" — take the tags in the order they are listed and
  // return whichever of our two languages appears first. Quality values are
  // already reflected in that order in every browser that sends them.
  for (const part of header.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (tag === "ar" || tag.startsWith("ar-")) return "ar";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return "en";
}

/** The strings for this request. `const s = t(c)` at the top of a handler. */
export const t = (c: Context<Env>): Strings => STRINGS[c.get("lang")];

/** The strings for a language you already have in hand. */
export const stringsFor = (lang: Lang): Strings => STRINGS[lang];

/* ------------------------------- switching -------------------------------- */

/**
 * Where the toggle points.
 *
 * The destination is carried as a `to` parameter rather than read from the
 * Referer header, because `referrer-policy: same-origin` is a promise about
 * other people's servers, not a guarantee our own header survives every proxy
 * and privacy extension in between. A parameter we wrote ourselves always
 * arrives.
 */
export function switchHref(path: string, to: Lang): string {
  return `/lang/${to}?to=${encodeURIComponent(path)}`;
}

/**
 * Sanitises the `to` parameter back into a path we are willing to redirect to.
 *
 * This is the open-redirect check, and it is stricter than it looks: a value
 * like `//evil.example.com` is a protocol-relative URL that browsers happily
 * treat as another origin, and `/\evil.example.com` is the same trick with the
 * slash the other way round. Anything that is not a single leading slash
 * followed by an ordinary path is discarded for the home page.
 */
export function safeRedirect(to: string | undefined): string {
  if (!to || !to.startsWith("/")) return "/";
  if (to.startsWith("//") || to.startsWith("/\\")) return "/";
  return to;
}

/* --------------------------- strings for the client ------------------------ */

/**
 * The subset of the dictionary the browser bundles need, as JSON.
 *
 * It rides in the page as a `<script type="application/json">` block. That is
 * a data block, not a script: the browser never executes it, so the strict
 * Content-Security-Policy in lib/security.ts — which allows inline scripts only
 * by hash — has nothing to object to. A per-request hash would be impossible
 * here anyway, since the content changes with the language.
 *
 * The `<` escape stops a string containing `</script>` from ending the block
 * early, which is the one way a data block can turn into an injection.
 */
export function clientJson(lang: Lang): string {
  return JSON.stringify(STRINGS[lang].client).replace(/</g, "\\u003c");
}

/* ---------------------------- upload refusals ----------------------------- */

/**
 * Turns a refusal code from lib/pdf.ts into a sentence.
 *
 * Lives here rather than beside the codes because lib/pdf.ts is pure PDF
 * parsing and has no business knowing what language anyone reads. Both callers
 * — the JSON upload API and the settings form on the stats page — go through
 * this, so the two can never drift into describing the same refusal differently.
 */
export function uploadErrorMessage(s: Strings, code: string): string {
  const messages: Record<string, string> = {
    too_large: s.errors.tooLarge,
    not_a_pdf: s.errors.notAPdf,
    truncated: s.errors.truncated,
    active_content: s.errors.activeContent,
    embedded_file: s.errors.embeddedFile,
    encrypted: s.errors.encrypted,
    blocked: s.errors.blocked,
    rate_limited: s.errors.rateLimited,
    save_failed: s.errors.saveFailed,
  };
  return messages[code] ?? s.errors.generic;
}
