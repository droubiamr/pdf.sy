import type { Lang } from "./i18n";

/**
 * Durations read by humans, not stopwatches: "4m 12s", not "252000".
 *
 * Arabic keeps Western digits and abbreviates the units — ث/د/س for
 * ثانية/دقيقة/ساعة. That is what a Syrian reader expects to see on a screen;
 * Arabic-Indic numerals (٤ د ١٢ ث) are correct but read as decorative here,
 * and they break alignment against the Latin figures elsewhere on the page.
 */
export function formatMs(ms: number, lang: Lang = "en"): string {
  const u = lang === "ar"
    ? { s: "ث", m: "د", h: "س" }
    : { s: "s", m: "m", h: "h" };

  if (!ms) return `0${u.s}`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}${u.s}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}${u.m} ${s % 60}${u.s}`;
  return `${Math.floor(m / 60)}${u.h} ${m % 60}${u.m}`;
}

/**
 * Dates and times in the reader's language.
 *
 * The Arabic locale is pinned to the Gregorian calendar with Latin digits
 * (`-u-ca-gregory-nu-latn`). Without that, some runtimes hand back Hijri dates
 * or Arabic-Indic numerals for `ar`, and a stats table that silently switches
 * calendar is worse than one that stays in English.
 */
const localeOf = (lang: Lang) => (lang === "ar" ? "ar-SY-u-ca-gregory-nu-latn" : "en-GB");

export const formatDate = (ms: number, lang: Lang = "en"): string =>
  new Date(ms).toLocaleDateString(localeOf(lang));

export const formatDateTime = (ms: number, lang: Lang = "en"): string =>
  new Date(ms).toLocaleString(localeOf(lang));
