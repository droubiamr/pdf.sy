import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { renderSVG } from "uqr";
import type { Env } from "../lib/context";
import type { Link } from "../db/schema";
import { Layout } from "../components/layout";
import { Download, FileText } from "../components/icons";
import { loadLink } from "./api";
import { siteUrl } from "../lib/urls";
import { resolveVersion } from "../lib/versions";
import { verifyPassword, unlockToken } from "../lib/password";
import { can } from "../lib/plans";
import { hit, clientKey } from "../lib/limits";
import { t } from "../lib/i18n";

export const view = new Hono<Env>();

const unlockCookie = (slug: string) => `pdfsy_unlock_${slug}`;

/** Everything the viewer needs, including who owns it and on what plan. */
async function loadContext(db: D1Database, slug: string) {
  const link = await loadLink(db, slug);
  if (!link) return null;

  const meta = await db.prepare(
    `SELECT d.title, u.plan AS owner_plan
       FROM documents d LEFT JOIN users u ON u.id = d.owner_id
      WHERE d.id = ?`,
  ).bind(link.document_id).first<{ title: string; owner_plan: string | null }>();

  return { link, title: link.name ?? meta?.title ?? "Document", ownerPlan: meta?.owner_plan ?? null };
}

/** Has this visitor already entered the password for this link? */
async function isUnlocked(c: Context<Env>, link: Link): Promise<boolean> {
  if (!link.password_hash) return true;
  const cookie = getCookie(c, unlockCookie(link.slug));
  return cookie === (await unlockToken(link.slug, link.password_hash));
}

/* --------------------------------- QR ------------------------------------ */

view.get("/:slug/qr.svg", async (c) => {
  const slug = c.req.param("slug");
  const link = await loadLink(c.env.DB, slug);
  if (!link) return c.notFound();

  const svg = renderSVG(new URL(`/${slug}`, siteUrl(c)).toString(), { border: 1, pixelSize: 8 });
  return c.body(svg, 200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=86400",
  });
});

/* -------------------------------- unlock --------------------------------- */

view.post("/:slug/unlock", async (c) => {
  const slug = c.req.param("slug");

  // Two separate reasons to limit this, and the second is the one that bites.
  //
  // The obvious one is guessing: a document password is short and human-chosen,
  // and nothing else here stands between a guess and the file.
  //
  // The other is that verifying costs 100,000 PBKDF2 iterations of *our* CPU
  // for one cheap request from the caller. Unlimited, that is the least
  // expensive way to exhaust a Worker's CPU budget on this whole site.
  //
  // Keyed per caller AND per link, so one visitor fumbling their own password
  // cannot lock a different document for everybody else.
  const key = `${await clientKey(c, "unlock")}:${slug}`;
  const verdict = await hit(c.env.DB, "unlock", key);
  // Back to the password page rather than a bare 429 body. Whoever is on the
  // other end of the tenth wrong password is usually a person who typed it
  // wrong, not an attacker, and they still need to be told what happened.
  if (!verdict.ok) return c.redirect(`/${slug}?throttled=1`, 303);

  const link = await loadLink(c.env.DB, slug);
  if (!link?.password_hash) return c.redirect(`/${slug}`, 303);

  const form = await c.req.formData();
  const password = String(form.get("password") ?? "").slice(0, 256);

  if (!(await verifyPassword(password, link.password_hash))) {
    return c.redirect(`/${slug}?wrong=1`, 303);
  }

  setCookie(c, unlockCookie(slug), await unlockToken(slug, link.password_hash), {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return c.redirect(`/${slug}`, 303);
});

/* --------------------------------- bytes --------------------------------- */

type ByteRange = { start: number; end: number };

/**
 * A single `Range: bytes=...` request against a known object size.
 *
 * `null` means "serve the full body" — no header, a unit other than bytes, or
 * multiple ranges (`bytes=0-10,20-30`) all fall back to a plain 200 rather
 * than the multipart response real multi-range support would require.
 *
 * `"invalid"` means the header did ask for one specific range and that range
 * cannot be satisfied — the caller must answer 416, not silently serve
 * something else.
 */
function parseRange(header: string | undefined, size: number): ByteRange | "invalid" | null {
  if (!header?.startsWith("bytes=")) return null;
  const spec = header.slice("bytes=".length).trim();
  if (spec.includes(",")) return null;

  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";

  let start: number;
  let end: number;
  if (match[1] === "") {
    // Suffix form, "bytes=-500": the last 500 bytes of the object.
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return "invalid";
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Number(match[2]);
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return "invalid";
  }
  return { start, end: Math.min(end, size - 1) };
}

/**
 * Never hand out a raw R2 URL: routing every read through here is what makes
 * revocation, expiry, download-blocking and passwords possible at all.
 *
 * Also the only place pdf.js can fetch bytes from, which is why it has to
 * speak Range: without it, the viewer cannot render a page until the whole
 * file has downloaded, and a 22-page PDF over a slow mobile connection is a
 * long time staring at a spinner.
 */
view.get("/v/:slug/file", async (c) => {
  const s = t(c);
  const slug = c.req.param("slug");
  const link = await loadLink(c.env.DB, slug);
  if (!link) return c.text(s.viewer.gone, 404);

  // The gate has to be here too, not only on the viewer page — otherwise the
  // password protects the wrapper and the document leaks. It runs before any
  // Range header is even looked at, so a ranged request gets no more access
  // than a plain one.
  if (!(await isUnlocked(c, link))) return c.text(s.viewer.locked, 403);

  const version = await resolveVersion(c.env.DB, link);
  if (!version) return c.text(s.viewer.notFound, 404);

  // D1's size is the object's size, so the range maths needs no second R2 call.
  //
  // Both writers set it from `file.size` and hand those very bytes to R2, and
  // `File.arrayBuffer().byteLength === File.size` holds by spec. No object is
  // ever rewritten either: an upload keys on a freshly minted document id, a
  // replace on the new version row's id, so neither can land on a key another
  // write already owns, and a write whose row does not commit takes its own
  // bytes back. A HEAD here would re-read a number we already hold, on every
  // request, for every ranged chunk.
  const size = version.size_bytes;

  const download = c.req.query("download") === "1";
  if (download && link.allow_download !== 1) {
    return c.text(s.viewer.downloadsOff, 403);
  }

  const headers: Record<string, string> = {
    "content-type": "application/pdf",
    "content-disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(link.name ?? "document")}.pdf"`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    // A meta tag cannot reach a PDF, and crawlers index PDF bodies happily.
    // The header is the only way to keep someone's document out of search.
    "x-robots-tag": "noindex, nofollow, noarchive",
    "accept-ranges": "bytes",
  };

  const range = parseRange(c.req.header("range"), size);

  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
  }

  if (range) {
    const object = await c.env.FILES.get(version.r2_key, {
      range: { offset: range.start, length: range.end - range.start + 1 },
    });
    if (!object) return c.text(s.viewer.notFound, 404);

    return new Response(object.body, {
      status: 206,
      headers: {
        ...headers,
        "content-length": String(range.end - range.start + 1),
        "content-range": `bytes ${range.start}-${range.end}/${object.size}`,
      },
    });
  }

  const object = await c.env.FILES.get(version.r2_key);
  if (!object) return c.text(s.viewer.notFound, 404);

  return new Response(object.body, { status: 200, headers: { ...headers, "content-length": String(size) } });
});

/* -------------------------------- viewer --------------------------------- */

view.get("/:slug", async (c) => {
  const s = t(c);
  const slug = c.req.param("slug");
  const context = await loadContext(c.env.DB, slug);

  if (!context) {
    return c.html(
      <Layout c={c} title={s.viewer.unavailableTitle} noindex>
        <section class="mx-auto w-full max-w-lg px-5 py-24 text-center">
          <h1 class="text-2xl font-semibold tracking-tight">{s.viewer.unavailableH1}</h1>
          <p class="mt-2 text-muted-foreground">{s.viewer.unavailableBody}</p>
          <a href="/new" class="btn mt-6">{s.viewer.shareOwn}</a>
        </section>
      </Layout>,
      404,
    );
  }

  const { link, title, ownerPlan } = context;

  if (!(await isUnlocked(c, link))) {
    const wrong = c.req.query("wrong") === "1";
    const throttled = c.req.query("throttled") === "1";

    return c.html(
      <Layout c={c} title={s.viewer.passwordTitle} noindex>
        <section class="mx-auto w-full max-w-sm px-5 py-24">
          <div class="card rounded-xl border border-border bg-card p-6">
            <header class="mb-4">
              <h1 class="card-title text-lg font-semibold">{s.viewer.protectedH1}</h1>
              <p class="mt-1 text-sm text-muted-foreground">{s.viewer.protectedBody}</p>
            </header>
            <form method="post" action={`/${slug}/unlock`} class="flex flex-col gap-3">
              {/* A password is typed exactly as the sender wrote it, so the
                  field runs left-to-right whichever way the page does. */}
              <input
                type="password" name="password" required autofocus
                autocomplete="current-password" placeholder={s.viewer.passwordPlaceholder}
                dir="ltr" class="input"
                aria-invalid={wrong || throttled ? "true" : undefined}
                disabled={throttled}
              />
              {wrong && <p class="text-sm text-destructive">{s.viewer.wrong}</p>}
              {throttled && <p class="text-sm text-destructive">{s.viewer.throttled}</p>}
              <button type="submit" class="btn" disabled={throttled}>{s.viewer.open}</button>
            </form>
          </div>
        </section>
      </Layout>,
      throttled ? 429 : wrong ? 401 : 200,
    );
  }

  const hideBadge = can({ plan: ownerPlan }, "hide_badge");

  return c.html(
    <Layout c={c} title={`${title} — pdf.sy`} script="/assets/viewer.js" bare noindex>
      <div class="flex min-h-dvh flex-col bg-muted/40" data-slug={slug}>
        <header class="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur">
          <FileText class="size-4 shrink-0 text-primary" />
          <span class="truncate text-sm font-medium">{title}</span>
          {/* "3 / 12" is a left-to-right figure; `ltr` keeps the two numbers
              either side of the slash in the order they were written. */}
          <span id="page-indicator" dir="ltr" class="tnum ms-auto shrink-0 text-sm text-muted-foreground">—</span>
          {link.allow_download === 1 && (
            <a id="download" class="btn shrink-0" data-variant="outline" data-size="sm"
               href={`/v/${slug}/file?download=1`} download>
              <Download /> <span class="hidden sm:inline">{s.viewer.download}</span>
            </a>
          )}
        </header>

        <div id="pages" class="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-3 py-6">
          <div id="viewer-loading" class="py-24 text-sm text-muted-foreground">{s.viewer.loading}</div>
        </div>

        <footer class="mt-auto border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
          {!hideBadge && (
            <>
              {s.viewer.sharedWith}{" "}
              <a href="/" class="font-medium text-foreground hover:underline">pdf.sy</a>
              <span class="px-1.5">·</span>
            </>
          )}
          <a href={`/report?slug=${slug}`} class="hover:underline">{s.viewer.reportFile}</a>
        </footer>
      </div>
    </Layout>,
  );
});
