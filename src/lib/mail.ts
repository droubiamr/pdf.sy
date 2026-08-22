// Email. Resend in production; without an API key it logs to the console so the
// whole auth flow stays testable locally without signing up for anything.
import type { Bindings } from "../db/schema";

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

const shell = (body: string) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#FCFCFD;padding:32px 16px;color:#101828">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #EAECF0;border-radius:12px;padding:28px">
    <p style="margin:0 0 20px;font-weight:600;font-size:15px;color:#101828">pdf.sy</p>
    ${body}
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#667085">
    pdf.sy — send a PDF as a link, and see what happens to it.
  </p>
</div>`;

const button = (href: string, label: string) => `
  <a href="${href}" style="display:inline-block;background:#47B881;color:#fff;text-decoration:none;font-weight:500;font-size:15px;padding:11px 18px;border-radius:8px">${label}</a>`;

export function magicLinkEmail(url: string): Omit<Mail, "to"> {
  return {
    subject: "Your pdf.sy sign-in link",
    html: shell(`
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:600">Sign in to pdf.sy</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#475467">
        This link works once and expires in 15 minutes.
      </p>
      ${button(url, "Sign in")}
      <p style="margin:22px 0 0;font-size:13px;color:#667085">
        If you did not ask for this, you can ignore it — nothing has changed.
      </p>`),
    text: `Sign in to pdf.sy\n\n${url}\n\nThis link works once and expires in 15 minutes. If you did not ask for it, ignore this email.`,
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
