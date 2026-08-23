import { Hono } from "hono";
import type { Env } from "../lib/context";
import { Layout } from "../components/layout";
import { newId } from "../lib/ids";

export const legal = new Hono<Env>();

/**
 * Privacy, terms, and the abuse report form the footer has always linked to.
 *
 * The policy text describes what the code actually does — day-rotated salted
 * IP hashes, country from the edge, no raw addresses — rather than the usual
 * catch-all that reserves every right imaginable. Worth keeping honest: the
 * whole product asks people to put a document they care about on a stranger's
 * server, and the policy is where that trust is either earned or lost.
 */

const LAST_UPDATED = "23 August 2026";

/* -------------------------------------------------------------------------- */
/*  Shared shell                                                               */
/* -------------------------------------------------------------------------- */

const Prose = ({ title, children }: { title: string; children?: unknown }) => (
  <section class="mx-auto w-full max-w-2xl px-5 py-16">
    <h1 class="text-3xl font-semibold tracking-tight">{title}</h1>
    <p class="mt-2 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
    <div class="mt-10 flex flex-col gap-8">{children as never}</div>
  </section>
);

const Section = ({ heading, children }: { heading: string; children?: unknown }) => (
  <div class="flex flex-col gap-2">
    <h2 class="text-lg font-semibold tracking-tight">{heading}</h2>
    <div class="flex flex-col gap-2 text-muted-foreground">{children as never}</div>
  </div>
);

/* -------------------------------------------------------------------------- */
/*  Privacy                                                                    */
/* -------------------------------------------------------------------------- */

legal.get("/privacy", (c) =>
  c.html(
    <Layout
      user={c.get("user")}
      title="Privacy — pdf.sy"
      description="What pdf.sy stores, what it never stores, and how long any of it lives."
    >
      <Prose title="Privacy">
        <Section heading="The short version">
          <p>
            We store the PDFs you upload and a record of who opened them. We never
            store a reader's IP address, and we do not sell anything to anyone.
            Links made without an account delete themselves after seven days.
          </p>
        </Section>

        <Section heading="What we store when you upload">
          <p>
            The file itself, its title, size, page count, and a SHA-256 fingerprint
            of its contents. The fingerprint lets us block a file that has been
            reported for abuse without keeping a copy of it after removal.
          </p>
        </Section>

        <Section heading="What we store when someone opens your link">
          <p>For each view we record:</p>
          <ul class="ml-5 flex list-disc flex-col gap-1">
            <li>The country, as reported by our edge network — never a city or address.</li>
            <li>Whether the device is mobile or desktop.</li>
            <li>The referring page, if the browser sent one.</li>
            <li>Time spent, in total and on each page.</li>
            <li>A one-way hash standing in for the reader's IP address.</li>
          </ul>
          <p>
            That last one deserves detail, because it is the difference between
            analytics and surveillance. We never write the IP address down. We
            combine it with the link's own identifier and the current date, hash
            the result, and keep only the first 32 characters. Because the date is
            part of the input, the same reader produces a different hash tomorrow;
            because the link is part of the input, the same reader produces a
            different hash on someone else's document. It exists to separate two
            readers on one link on one day, and it cannot do anything else.
          </p>
        </Section>

        <Section heading="What we store if you make an account">
          <p>
            Your email address, and nothing else. There is no password, because we
            sign you in with a one-time link instead — so there is no password of
            yours for us to leak.
          </p>
          <p>
            If you subscribe, Stripe handles the payment and sends us back a
            customer reference and your plan status. Your card details go to Stripe
            directly and never reach our servers.
          </p>
        </Section>

        <Section heading="How long it lasts">
          <ul class="ml-5 flex list-disc flex-col gap-1">
            <li>Links created without an account: deleted seven days after upload.</li>
            <li>Links owned by an account: kept until you delete them or close the account.</li>
            <li>View records: kept for as long as the link they belong to.</li>
            <li>Abuse reports: kept after removal so a blocked file cannot be re-uploaded.</li>
          </ul>
        </Section>

        <Section heading="Where it lives">
          <p>
            Files and database records are stored on Cloudflare's network with a
            placement hint for Western Europe, which is where the primary copy
            sits. Cloudflare serves and caches globally, so a reader is answered
            from wherever they happen to be.
          </p>
        </Section>

        <Section heading="Who else sees it">
          <p>
            Cloudflare hosts everything. Stripe processes payments. Resend delivers
            our email. That is the entire list, and each one only receives what it
            needs to do its job. We do not sell or share your data for advertising,
            and there are no third-party trackers or advertising cookies anywhere
            on this site.
          </p>
        </Section>

        <Section heading="Cookies">
          <p>
            One cookie keeps you signed in, and one remembers that you have entered
            the password for a protected document. Both are strictly necessary for
            the thing you asked for, and there are no others.
          </p>
        </Section>

        <Section heading="Your rights">
          <p>
            You can ask for a copy of what we hold about you, ask us to correct it,
            or ask us to delete it — including the view records attached to your
            links. Email us and we will action it. Deleting a link removes the file
            and every view record belonging to it.
          </p>
        </Section>

        <Section heading="A note for people opening a link">
          <p>
            If someone sent you a pdf.sy link, the person who shared it can see that
            it was opened, from which country, on what kind of device, and how long
            you spent on each page. They cannot see your name, your email, or your
            IP address, because we never give them what we do not keep.
          </p>
        </Section>
      </Prose>
    </Layout>,
  ),
);

/* -------------------------------------------------------------------------- */
/*  Terms                                                                      */
/* -------------------------------------------------------------------------- */

legal.get("/terms", (c) =>
  c.html(
    <Layout
      user={c.get("user")}
      title="Terms — pdf.sy"
      description="The rules for using pdf.sy: what you may upload, what we may remove, and what we promise."
    >
      <Prose title="Terms of service">
        <Section heading="What this service does">
          <p>
            pdf.sy stores a PDF you upload and gives you a short link to it. When
            someone opens that link, we record how they read it and show that back
            to you. Some features require a paid plan.
          </p>
        </Section>

        <Section heading="What you may not upload">
          <p>
            You are responsible for every file you upload and for having the right
            to share it. Do not upload anything that:
          </p>
          <ul class="ml-5 flex list-disc flex-col gap-1">
            <li>Infringes someone else's copyright or other rights.</li>
            <li>Contains malware, or exists to phish or defraud.</li>
            <li>Contains sexual content involving minors, or any other illegal material.</li>
            <li>Contains another person's private information shared without their consent.</li>
          </ul>
          <p>
            We may remove any file and disable any link, with or without notice,
            when we believe this section has been broken. A removed file's
            fingerprint is retained so that it cannot simply be uploaded again.
          </p>
        </Section>

        <Section heading="Links without an account">
          <p>
            A link created without an account stops working seven days after it is
            made, and the file is deleted. This is not a bug and it is not a
            backup — if the document matters, make an account or keep your own copy.
          </p>
        </Section>

        <Section heading="Accounts">
          <p>
            Keep access to your email address, because anyone who can read your
            inbox can sign in as you. Tell us promptly if you think someone else
            has access to your account.
          </p>
        </Section>

        <Section heading="Paid plans">
          <p>
            Paid plans bill monthly in advance through Stripe and renew until you
            cancel. Cancelling stops the next charge and leaves your plan running
            to the end of the period you have already paid for. We do not
            automatically refund partial months, but if something went wrong on our
            side, write to us and we will sort it out.
          </p>
          <p>
            If a payment fails and stays unpaid, paid features switch off and your
            account returns to the free plan. Your links and their history are not
            deleted for non-payment.
          </p>
        </Section>

        <Section heading="What we promise, and what we do not">
          <p>
            We work hard to keep this running and your files intact, but the service
            is provided as-is, without warranty of any kind. We do not guarantee
            uninterrupted availability, and we are not liable for indirect or
            consequential losses. Where liability cannot be excluded, it is limited
            to what you paid us in the twelve months before the claim.
          </p>
          <p>
            Analytics are a good-faith measurement, not a forensic record. Browsers
            and networks vary, and a reader can defeat measurement if they want to.
            Do not rely on them as proof of anything that matters legally.
          </p>
        </Section>

        <Section heading="Ending things">
          <p>
            You may stop using the service and delete your account at any time. We
            may suspend or close an account that breaks these terms. If we close
            the service itself, we will give reasonable notice so you can retrieve
            your files.
          </p>
        </Section>

        <Section heading="Changes">
          <p>
            We may update these terms. If a change materially affects you, we will
            tell you before it takes effect. Continuing to use the service after
            that means you accept the new version.
          </p>
        </Section>
      </Prose>
    </Layout>,
  ),
);

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
  const done = c.req.query("sent") === "1";
  const bad = c.req.query("error") === "1";

  return c.html(
    <Layout
      user={c.get("user")}
      title="Report a file — pdf.sy"
      description="Tell us about a pdf.sy link that breaks our terms."
      noindex
    >
      <section class="mx-auto w-full max-w-md px-5 py-20">
        {done ? (
          <div class="card rounded-xl border border-border bg-card p-6 text-center">
            <div class="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
              ✓
            </div>
            <h1 class="text-xl font-semibold tracking-tight">Report received</h1>
            <p class="mt-2 text-sm text-muted-foreground">
              Thank you. We review every report and act on the ones that break our
              terms. If you left an email, we will tell you what we decided.
            </p>
            <a href="/" class="btn mt-6" data-variant="outline">Back to pdf.sy</a>
          </div>
        ) : (
          <>
            <h1 class="text-3xl font-semibold tracking-tight">Report a file</h1>
            <p class="mt-2 text-muted-foreground">
              If a pdf.sy link points at something that breaks our{" "}
              <a href="/terms" class="underline underline-offset-4 hover:text-foreground">terms</a>,
              tell us and we will look at it.
            </p>

            {bad && (
              <p class="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                We could not read that as a pdf.sy link. Paste the whole link, or
                just the code at the end of it.
              </p>
            )}

            <form method="post" action="/report" class="mt-8 flex flex-col gap-3">
              <label for="link" class="label text-sm font-medium">The link</label>
              <input
                id="link" name="link" type="text" required autofocus
                placeholder="pdf.sy/a7f3k9" class="input"
              />

              <label for="reason" class="label mt-3 text-sm font-medium">What is wrong with it</label>
              {/* `.input` pins a one-line height, so the rows attribute alone
                  leaves this looking like a text field. */}
              <textarea
                id="reason" name="reason" required rows={5}
                class="input h-auto min-h-28 py-2 leading-relaxed"
                placeholder="Tell us what this file is and why it should be removed."
              />

              <label for="email" class="label mt-3 text-sm font-medium">
                Your email <span class="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                id="email" name="email" type="email" autocomplete="email"
                placeholder="you@example.com" class="input"
              />

              <button type="submit" class="btn mt-4">Send report</button>
              <p class="text-xs text-muted-foreground">
                Reports are read by a person. Deliberately false reports waste that
                person's time, so please only send one if you mean it.
              </p>
            </form>
          </>
        )}
      </section>
    </Layout>,
  );
});

legal.post("/report", async (c) => {
  const form = await c.req.formData();
  const slug = slugFrom(String(form.get("link") ?? ""));
  const reason = String(form.get("reason") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;

  if (!slug || !reason) return c.redirect("/report?error=1", 303);

  await c.env.DB.prepare(
    `INSERT INTO abuse_reports (id, slug, reason, reporter_email, status, created_at)
     VALUES (?, ?, ?, ?, 'open', ?)`,
  )
    .bind(newId(), slug, reason.slice(0, 2000), email, Date.now())
    .run();

  return c.redirect("/report?sent=1", 303);
});
