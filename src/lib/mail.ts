// Email. Resend in production; without an API key it logs to the console so the
// whole auth flow stays testable locally without signing up for anything.
import type { Bindings } from "../db/schema";
import { stringsFor, dirOf, type Lang } from "./i18n";

type Mail = { to: string; subject: string; html: string; text: string };

export async function send(env: Bindings, mail: Mail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`\n──── email (no RESEND_API_KEY, not sent) ────\nto: ${mail.to}\nsubject: ${mail.subject}\n\n${mail.text}\n────────────────────────────────────────────\n`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM ?? "pdf.sy <hello@pdf.sy>",
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  });

  if (!response.ok) {
    // Never surface a mail failure to the person waiting on the page; the
    // caller is either a login they can retry or a notification they did not ask for.
    console.error("resend failed", response.status, await response.text().catch(() => ""));
  }
}

/* -------------------------------- templates ------------------------------- */

/**
 * Direction is set with the `dir` attribute rather than a stylesheet because
 * mail clients strip <style> blocks freely but honour inline attributes. The
 * font stack names IBM Plex Sans Arabic first for Arabic on the chance the
 * reader has it installed, then falls back — a webfont cannot be loaded here,
 * since almost every client blocks remote resources by default.
 */
const shell = (body: string, lang: Lang = "en") => {
  const s = stringsFor(lang);
  const font =
    lang === "ar"
      ? `'IBM Plex Sans Arabic',-apple-system,BlinkMacSystemFont,'Segoe UI',Tahoma,sans-serif`
      : `-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif`;

  return `
<div dir="${dirOf(lang)}" lang="${lang}" style="font-family:${font};background:#FCFCFD;padding:32px 16px;color:#101828">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #EAECF0;border-radius:12px;padding:28px">
    <p style="margin:0 0 20px;font-weight:600;font-size:15px;color:#101828">pdf.sy</p>
    ${body}
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#667085">
    ${s.email.footer}
  </p>
</div>`;
};

const button = (href: string, label: string) => `
  <a href="${href}" style="display:inline-block;background:#47B881;color:#fff;text-decoration:none;font-weight:500;font-size:15px;padding:11px 18px;border-radius:8px">${label}</a>`;

/**
 * The sign-in link.
 *
 * Takes a language because it is sent straight back at someone who has just
 * submitted a form on the site — so the language they were reading is known,
 * and is the right one to reply in.
 *
 * The "someone opened your document" email below deliberately does NOT do this.
 * That one is triggered by a *reader's* request, and the only language in hand
 * at that point is the reader's, not the owner's. Writing the owner's
 * notification in whatever language their reader happened to be browsing in
 * would be worse than leaving it in English. Fixing it properly means storing a
 * language preference on the account, which is a change to the users table.
 */
export function magicLinkEmail(url: string, lang: Lang = "en"): Omit<Mail, "to"> {
  const s = stringsFor(lang);

  return {
    subject: s.email.signInSubject,
    html: shell(
      `
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:600">${s.email.signInTitle}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#475467">
        ${s.email.signInBody}
      </p>
      ${button(url, s.email.signInButton)}
      <p style="margin:22px 0 0;font-size:13px;color:#667085">
        ${s.email.signInIgnore}
      </p>`,
      lang,
    ),
    text: `${s.email.signInTitle}\n\n${url}\n\n${s.email.signInBody} ${s.email.signInIgnore}`,
  };
}

export function openNotificationEmail(opts: {
  title: string;
  statsUrl: string;
  country: string | null;
  durationLabel: string;
  lastPage: number;
  totalPages: number | null;
  viewerEmail: string | null;
}): Omit<Mail, "to"> {
  const who = opts.viewerEmail ?? (opts.country ? `Someone in ${opts.country}` : "Someone");
  const of = opts.totalPages ? ` of ${opts.totalPages}` : "";
  const headline = `${who} opened “${opts.title}”`;

  return {
    subject: headline,
    html: shell(`
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:600">${escapeHtml(headline)}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#475467">
        They spent <strong style="color:#101828">${opts.durationLabel}</strong> in it and
        reached <strong style="color:#101828">page ${opts.lastPage}${of}</strong>.
      </p>
      ${button(opts.statsUrl, "See the full breakdown")}`),
    text: `${headline}\n\nThey spent ${opts.durationLabel} in it and reached page ${opts.lastPage}${of}.\n\n${opts.statsUrl}`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
  );
}
