import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { Env } from "../lib/context";
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, isLang, safeRedirect } from "../lib/i18n";

export const lang = new Hono<Env>();

/**
 * The language switch.
 *
 * A plain link rather than a form or a fetch, so it works with no JavaScript
 * and can be middle-clicked, bookmarked and shared like any other URL. The
 * cookie is what makes the choice stick; `?to=` is what brings you back to the
 * page you were reading rather than dumping you on the home page.
 *
 * Not `httpOnly`: nothing here is a secret, and leaving it readable means
 * client code can tell what language it is rendering into without a round trip.
 * `sameSite: Lax` still keeps it off cross-site requests.
 */
lang.get("/lang/:lang", (c) => {
  const next = c.req.param("lang");
  const back = safeRedirect(c.req.query("to"));

  if (!isLang(next)) return c.redirect(back, 303);

  setCookie(c, LANG_COOKIE, next, {
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    maxAge: LANG_COOKIE_MAX_AGE,
  });

  return c.redirect(back, 303);
});
