import { Hono } from "hono";
import type { Env } from "../lib/context";
import type { Strings } from "../lib/strings/en";
import { Layout } from "../components/layout";
import { newId } from "../lib/ids";
import { hitByClient } from "../lib/limits";
import { t } from "../lib/i18n";

export const legal = new Hono<Env>();

/**
 * Privacy, terms, and the abuse report form the footer has always linked to.
 *
 * The policy text describes what the code actually does — day-rotated salted
 * IP hashes, country from the edge, no raw addresses — rather than the usual
 * catch-all that reserves every right imaginable. Worth keeping honest: the
 * whole product asks people to put a document they care about on a stranger's
 * server, and the policy is where that trust is either earned or lost.
 *
 * Both documents are translated so an Arabic reader can actually read what they
 * are agreeing to — a policy nobody can read is not a policy. The English text
 * remains the governing version, and the Arabic pages say so at the top rather
 * than leaving a reader to assume a translation carries legal weight it does
 * not. Keep the two in step: a change to one is a change to both.
 */

/* -------------------------------------------------------------------------- */
/*  Shared shell                                                               */
/* -------------------------------------------------------------------------- */

const Prose = ({ s, title, children }: { s: Strings; title: string; children?: unknown }) => (
  <section class="mx-auto w-full max-w-2xl px-5 py-16">
    <h1 class="text-3xl font-semibold tracking-tight">{title}</h1>
    <p class="mt-2 text-sm text-muted-foreground">
      {s.legal.lastUpdated(s.legal.lastUpdatedDate)}
    </p>
    {/* Empty on the English pages, which are the originals and have nothing to
        disclaim. Styled exactly like the notices on the stats page rather than
        as a new kind of box — there is already one house style for "read this
        before the thing below it". */}
    {s.legal.translationNote && (
      <p class="mt-4 rounded-lg border border-border bg-accent px-4 py-3 text-sm text-accent-foreground">
        {s.legal.translationNote}
      </p>
    )}
    <div class="mt-10 flex flex-col gap-8">{children as never}</div>
  </section>
);

const Section = ({ heading, children }: { heading: string; children?: unknown }) => (
  <div class="flex flex-col gap-2">
    <h2 class="text-lg font-semibold tracking-tight">{heading}</h2>
    <div class="flex flex-col gap-2 text-muted-foreground">{children as never}</div>
  </div>
);

/** `ms-5` rather than `ml-5`: the bullets indent from the reading edge. */
const List = ({ items }: { items: string[] }) => (
  <ul class="ms-5 flex list-disc flex-col gap-1">
    {items.map((item) => (
      <li>{item}</li>
    ))}
  </ul>
);

/* -------------------------------------------------------------------------- */
/*  Privacy                                                                    */
/* -------------------------------------------------------------------------- */

legal.get("/privacy", (c) => {
  const s = t(c);
  const p = s.privacy;

  return c.html(
    <Layout c={c} title={p.title} description={p.description}>
      <Prose s={s} title={p.h1}>
        <Section heading={p.shortHeading}>
          <p>{p.shortBody}</p>
        </Section>

        <Section heading={p.uploadHeading}>
          <p>{p.uploadBody}</p>
        </Section>

        <Section heading={p.viewHeading}>
          <p>{p.viewIntro}</p>
          <List items={[p.viewItem1, p.viewItem2, p.viewItem3, p.viewItem4, p.viewItem5]} />
          <p>{p.viewBody}</p>
        </Section>

        <Section heading={p.accountHeading}>
          <p>{p.accountBody1}</p>
          <p>{p.accountBody2}</p>
        </Section>

        <Section heading={p.retentionHeading}>
          <List items={[p.retentionItem1, p.retentionItem2, p.retentionItem3, p.retentionItem4]} />
        </Section>

        <Section heading={p.whereHeading}>
          <p>{p.whereBody}</p>
        </Section>

        <Section heading={p.sharedHeading}>
          <p>{p.sharedBody}</p>
        </Section>

        <Section heading={p.cookiesHeading}>
          <p>{p.cookiesBody}</p>
        </Section>

        <Section heading={p.rightsHeading}>
          <p>{p.rightsBody}</p>
        </Section>

        <Section heading={p.readerHeading}>
          <p>{p.readerBody}</p>
        </Section>
      </Prose>
    </Layout>,
  );
});

/* -------------------------------------------------------------------------- */
/*  Terms                                                                      */
/* -------------------------------------------------------------------------- */

legal.get("/terms", (c) => {
  const s = t(c);
  const x = s.terms;

  return c.html(
    <Layout c={c} title={x.title} description={x.description}>
      <Prose s={s} title={x.h1}>
        <Section heading={x.whatHeading}>
          <p>{x.whatBody}</p>
        </Section>

        <Section heading={x.forbiddenHeading}>
          <p>{x.forbiddenIntro}</p>
          <List items={[x.forbiddenItem1, x.forbiddenItem2, x.forbiddenItem3, x.forbiddenItem4]} />
          <p>{x.forbiddenBody}</p>
        </Section>

        <Section heading={x.anonHeading}>
          <p>{x.anonBody}</p>
        </Section>

        <Section heading={x.accountsHeading}>
          <p>{x.accountsBody}</p>
        </Section>

        <Section heading={x.paidHeading}>
          <p>{x.paidBody1}</p>
          <p>{x.paidBody2}</p>
        </Section>

        <Section heading={x.promiseHeading}>
          <p>{x.promiseBody1}</p>
          <p>{x.promiseBody2}</p>
        </Section>

        <Section heading={x.endingHeading}>
          <p>{x.endingBody}</p>
        </Section>

        <Section heading={x.changesHeading}>
          <p>{x.changesBody}</p>
        </Section>
      </Prose>
    </Layout>,
  );
});

/* -------------------------------------------------------------------------- */
/*  Abuse reports                                                              */
/* -------------------------------------------------------------------------- */

/** Accepts a full share URL or a bare slug, because people paste the link. */
function slugFrom(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const last = text.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
  return /^[a-z0-9]{4,32}$/i.test(last) ? last : null;
}

legal.get("/report", (c) => {
  const s = t(c);
  const done = c.req.query("sent") === "1";
  const bad = c.req.query("error") === "1";

  return c.html(
    <Layout c={c} title={s.report.title} description={s.report.description} noindex>
      <section class="mx-auto w-full max-w-md px-5 py-20">
        {done ? (
          <div class="card rounded-xl border border-border bg-card p-6 text-center">
            <div class="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
              ✓
            </div>
            <h1 class="text-xl font-semibold tracking-tight">{s.report.sentH1}</h1>
            <p class="mt-2 text-sm text-muted-foreground">{s.report.sentBody}</p>
            <a href="/" class="btn mt-6" data-variant="outline">{s.report.backHome}</a>
          </div>
        ) : (
          <>
            <h1 class="text-3xl font-semibold tracking-tight">{s.report.h1}</h1>
            {/* Split into three pieces rather than one string with the anchor
                spliced in, so the link can sit wherever the sentence puts it in
                each language rather than where English happens to put it. */}
            <p class="mt-2 text-muted-foreground">
              {s.report.leadBefore}
              <a href="/terms" class="underline underline-offset-4 hover:text-foreground">
                {s.report.leadLink}
              </a>
              {s.report.leadAfter}
            </p>

            {bad && (
              <p class="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {s.report.badLink}
              </p>
            )}

            <form method="post" action="/report" class="mt-8 flex flex-col gap-3">
              <label for="link" class="label text-sm font-medium">{s.report.linkLabel}</label>
              <input
                id="link" name="link" type="text" required autofocus
                placeholder={s.report.linkPlaceholder} dir="ltr" class="input"
              />

              <label for="reason" class="label mt-3 text-sm font-medium">{s.report.reasonLabel}</label>
              {/* `.input` pins a one-line height, so the rows attribute alone
                  leaves this looking like a text field. */}
              <textarea
                id="reason" name="reason" required rows={5}
                class="input h-auto min-h-28 py-2 leading-relaxed"
                placeholder={s.report.reasonPlaceholder}
              />

              <label for="email" class="label mt-3 text-sm font-medium">
                {s.report.emailLabel}{" "}
                <span class="font-normal text-muted-foreground">{s.report.optional}</span>
              </label>
              <input
                id="email" name="email" type="email" autocomplete="email"
                placeholder={s.report.emailPlaceholder} dir="ltr" class="input"
              />

              <button type="submit" class="btn mt-4">{s.report.send}</button>
              <p class="text-xs text-muted-foreground">{s.report.note}</p>
            </form>
          </>
        )}
      </section>
    </Layout>,
  );
});

legal.post("/report", async (c) => {
  // The queue behind this is read by a person, so flooding it is an attack on
  // the response process itself — bury the real reports and nothing gets taken
  // down. Answered identically either way, so a flooder learns nothing.
  const verdict = await hitByClient(c, "report");

  const form = await c.req.formData();
  const slug = slugFrom(String(form.get("link") ?? ""));
  const reason = String(form.get("reason") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().slice(0, 320) || null;

  if (!slug || !reason) return c.redirect("/report?error=1", 303);
  if (!verdict.ok) return c.redirect("/report?sent=1", 303);

  await c.env.DB.prepare(
    `INSERT INTO abuse_reports (id, slug, reason, reporter_email, status, created_at)
     VALUES (?, ?, ?, ?, 'open', ?)`,
  )
    .bind(newId(), slug, reason.slice(0, 2000), email, Date.now())
    .run();

  return c.redirect("/report?sent=1", 303);
});
