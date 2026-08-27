// Markdown, limited to the subset the internal docs actually use.
//
// Written rather than installed, for the same reason there is no ORM and no
// Stripe SDK in this project: the whole grammar below is a couple of hundred
// lines, and the dependency would be a larger surface than the thing it
// replaces — one that also has to be audited every time it updates.
//
// SAFETY, and it is the whole story for this file: every character is
// HTML-escaped *before* any markdown is applied, so raw HTML in the source
// renders as visible text rather than as markup. There is no sanitiser here to
// get wrong, because nothing is ever trusted in the first place. The price is
// that you cannot drop a <div> into a document — worth paying for a renderer
// whose input arrives from a textarea.
//
// Styling is emitted as Tailwind classes rather than left to a `.doc` block in
// app.css. Generated HTML cannot carry utility classes any other way, and
// app.css already scans `../**/*.ts`, so the classes in the strings below are
// picked up by the build like any others.

export type Heading = { level: 2 | 3; text: string; id: string };

export type Rendered = {
  html: string;
  /** Every `##` and `###`, in document order, for the table of contents. */
  headings: Heading[];
};

/* -------------------------------------------------------------------------- */
/*  Escaping                                                                   */
/* -------------------------------------------------------------------------- */

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * An anchor id from a heading's text.
 *
 * Built from the *escaped* text, so entities are stripped along with
 * punctuation rather than surviving as `amp` in the middle of a fragment.
 */
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "section";

/**
 * Schemes a link is allowed to use.
 *
 * The list is an allowlist rather than a `javascript:` denylist, because the
 * denylist version has to keep up with `data:`, `vbscript:`, whitespace tricks
 * and case folding, and this one does not.
 */
function safeHref(href: string): boolean {
  return (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("https://") ||
    href.startsWith("http://") ||
    href.startsWith("mailto:")
  );
}

/* -------------------------------------------------------------------------- */
/*  Inline                                                                     */
/* -------------------------------------------------------------------------- */

const A_CLASS = "text-primary underline underline-offset-2 hover:no-underline";
const CODE_CLASS =
  "rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em]";

/**
 * Inline spans, applied to text that is already escaped.
 *
 * Code spans are lifted out first and put back last. Without that, `**` inside
 * a code span would be read as bold and the sample would render as markup
 * rather than as the characters somebody typed.
 */
function inline(text: string): string {
  const codes: string[] = [];

  let out = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (whole: string, label: string, href: string) =>
      safeHref(href) ? `<a class="${A_CLASS}" href="${href}">${label}</a>` : whole,
  );

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // Italics, with the two constraints CommonMark puts on them: the opening
  // asterisk must be followed by a non-space and the closing one preceded by a
  // non-space. Without both, `2 * 3 * 4` is read as an emphasis span and comes
  // out as "2 <em> 3 </em> 4" — asterisks are used as multiplication and as
  // footnote markers far more often in these docs than as emphasis.
  //
  // The leading group additionally keeps this off the second asterisk of a
  // `**` pair that the rule above has already consumed.
  out = out.replace(/(^|[^*])\*([^\s*](?:[^*\n]*[^\s*])?)\*/g, "$1<em>$2</em>");

  return out.replace(
    /\u0000(\d+)\u0000/g,
    (_match, index: string) => `<code class="${CODE_CLASS}">${codes[Number(index)]}</code>`,
  );
}

/* -------------------------------------------------------------------------- */
/*  Blocks                                                                     */
/* -------------------------------------------------------------------------- */

const H2_CLASS =
  "mt-14 mb-3 scroll-mt-24 border-t border-border pt-8 text-xl font-semibold tracking-tight";
const H3_CLASS = "mt-8 mb-2 scroll-mt-24 text-base font-semibold";
const P_CLASS = "mb-4 leading-7";
const LIST_CLASS = "mb-5 flex flex-col gap-2 ps-5 leading-7";
const PRE_CLASS =
  "mb-5 overflow-x-auto rounded-lg border border-border bg-muted p-4 font-mono text-xs leading-relaxed";
const QUOTE_CLASS = "mb-5 border-s-2 border-primary ps-4 text-muted-foreground";

const isTableSeparator = (line: string): boolean =>
  /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

/** `| a | b |` → ["a", "b"], with the outer pipes dropped. */
const cells = (line: string): string[] =>
  line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

/**
 * Column alignment from the separator row: `:---`, `---:`, `:---:`.
 *
 * `text-start` rather than `text-left`, like everywhere else in this codebase —
 * these docs are English-only today, but a physical direction here would be a
 * bug waiting for the first Arabic one.
 */
function alignmentOf(spec: string): string {
  const left = spec.startsWith(":");
  const right = spec.endsWith(":");
  if (left && right) return "text-center";
  if (right) return "text-end";
  return "text-start";
}

export function renderMarkdown(source: string): Rendered {
  const lines = escapeHtml(source.replace(/\r\n?/g, "\n")).split("\n");
  const headings: Heading[] = [];
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code. The closing fence is optional so an unterminated block at
    // the end of a document still renders instead of swallowing the rest.
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      out.push(`<pre class="${PRE_CLASS}">${body.join("\n")}</pre>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      out.push('<hr class="my-10 border-border" />');
      i++;
      continue;
    }

    // Headings
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = inline(heading[2].trim());
      if (level === 1) {
        out.push(`<h1 class="mb-4 text-2xl font-semibold tracking-tight">${text}</h1>`);
      } else {
        // The id comes from the raw heading, not the inline-rendered one, so a
        // heading containing a link or code does not put tags into a fragment.
        const id = slugify(heading[2]);
        headings.push({ level: level as 2 | 3, text: heading[2].trim(), id });
        const cls = level === 2 ? H2_CLASS : H3_CLASS;
        out.push(`<h${level} id="${id}" class="${cls}">${text}</h${level}>`);
      }
      i++;
      continue;
    }

    // Tables
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = cells(line);
      const aligns = cells(lines[i + 1]).map(alignmentOf);
      i += 2;

      const head = header
        .map(
          (cell, n) =>
            `<th scope="col" class="whitespace-nowrap border-b border-border bg-muted px-3 py-2 ${
              aligns[n] ?? "text-start"
            } text-xs font-medium text-muted-foreground">${inline(cell)}</th>`,
        )
        .join("");

      const body: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        const row = cells(lines[i]);
        body.push(
          `<tr>${row
            .map(
              (cell, n) =>
                `<td class="border-b border-border/60 px-3 py-2 align-top ${
                  aligns[n] ?? "text-start"
                }">${inline(cell)}</td>`,
            )
            .join("")}</tr>`,
        );
        i++;
      }

      // Scrolls inside its own box. Letting the page scroll sideways instead
      // would take the sticky contents rail with it.
      out.push(
        `<div class="mb-5 overflow-x-auto rounded-lg border border-border">` +
          `<table class="w-full text-sm"><thead><tr>${head}</tr></thead>` +
          `<tbody>${body.join("")}</tbody></table></div>`,
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("&gt;")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith("&gt;")) {
        body.push(lines[i].replace(/^&gt;\s?/, ""));
        i++;
      }
      out.push(`<blockquote class="${QUOTE_CLASS}">${inline(body.join(" "))}</blockquote>`);
      continue;
    }

    // Lists. Deliberately flat: nesting needs an indent stack, and no document
    // here has wanted one. Add it the day one does, not before.
    const bullet = /^[-*]\s+/;
    const numbered = /^\d+\.\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];

      while (i < lines.length && pattern.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(pattern, ""))}</li>`);
        i++;
      }

      const tag = ordered ? "ol" : "ul";
      const marker = ordered ? "list-decimal" : "list-disc";
      out.push(`<${tag} class="${LIST_CLASS} ${marker}">${items.join("")}</${tag}>`);
      continue;
    }

    // Paragraph: everything up to the next blank line, joined.
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|&gt;|[-*]\s|\d+\.\s)/.test(lines[i])) {
      paragraph.push(lines[i]);
      i++;
    }
    if (paragraph.length) out.push(`<p class="${P_CLASS}">${inline(paragraph.join(" "))}</p>`);
  }

  return { html: out.join("\n"), headings };
}
