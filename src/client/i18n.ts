// Strings for the browser.
//
// The server puts the dictionary for this page's language into a
// `<script type="application/json" id="i18n">` block — see clientJson() in
// lib/i18n.ts. That is a data block rather than a script, so it never executes
// and the strict Content-Security-Policy has nothing to object to.
//
// Read once at module load. If the block is missing (a page that loaded a
// bundle without one), every lookup falls back to returning its own key, which
// is ugly but visible — far easier to spot and fix than a silent empty string.

type Dict = Record<string, string>;

const dict: Dict = (() => {
  const el = document.getElementById("i18n");
  if (!el?.textContent) return {};
  try {
    return JSON.parse(el.textContent) as Dict;
  } catch {
    return {};
  }
})();

/**
 * `t("uploadingFile", { name: file.name })` → "Uploading report.pdf…"
 *
 * Placeholders are `{name}` rather than positional, so a translator can move
 * them around the sentence — which Arabic word order regularly needs.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let out = dict[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      out = out.split(`{${name}}`).join(String(value));
    }
  }
  return out;
}
