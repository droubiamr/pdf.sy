import type { OwnedLink } from "../routes/links";
import type { Strings } from "../lib/strings/en";
import { can, type Feature } from "../lib/plans";
import { uploadErrorMessage } from "../lib/i18n";
import { Upload } from "./icons";

type Props = {
  /** Passed in rather than resolved here: this is a component, not a route, and
   *  it has no request to read the language off. */
  s: Strings;
  link: OwnedLink;
  /** Present when access came from the upload token rather than an account. */
  token: string | null;
  user: { plan?: string | null } | null;
  /** Feature the last save refused, from ?upgrade=… */
  refused: string | null;
  updatedVersion: string | null;
  error: string | null;
};

const asDateValue = (ms: number | null) =>
  ms ? new Date(ms).toISOString().slice(0, 10) : "";

export const LinkSettings = ({ s, link, token, user, refused, updatedVersion, error }: Props) => {
  const locked = (feature: Feature) => !can(user, feature);

  return (
    <section class="mt-12">
      <h2 class="font-semibold">{s.settings.h2}</h2>

      {refused && (
        <p class="mt-3 rounded-lg border border-border bg-accent px-4 py-3 text-sm text-accent-foreground">
          <strong class="font-medium">{featureLabel(s, refused)}</strong>
          {s.settings.refusedAfter}{" "}
          <a href="/pricing" class="font-medium underline">{s.settings.seePlans}</a>
        </p>
      )}
      {updatedVersion && (
        <p class="mt-3 rounded-lg border border-border bg-accent px-4 py-3 text-sm text-accent-foreground">
          {s.settings.updated(updatedVersion)}
        </p>
      )}
      {error && (
        <p class="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {uploadErrorMessage(s, error)}
        </p>
      )}

      <form method="post" action={`/l/${link.slug}/settings`} class="mt-4 flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
        {token && <input type="hidden" name="t" value={token} />}

        <div class="flex flex-col gap-1.5">
          <label for="name" class="label text-sm font-medium">{s.settings.nameLabel}</label>
          <input id="name" name="name" class="input" value={link.name ?? ""} maxlength={200} />
          <p class="text-xs text-muted-foreground">{s.settings.nameHint}</p>
        </div>

        <Field
          label={s.settings.passwordLabel} locked={locked("password")}
          hint={s.settings.passwordHint} pro={s.settings.pro}
        >
          <input
            type="password" name="password" class="input" autocomplete="new-password"
            placeholder={link.password_hash ? s.settings.passwordSet : s.settings.passwordNone}
            disabled={locked("password")}
          />
          {link.password_hash && !locked("password") && (
            <label class="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="clear_password" value="1" class="input size-4" />
              {s.settings.passwordRemove}
            </label>
          )}
        </Field>

        <Field
          label={s.settings.expiresLabel} locked={locked("expiry")}
          hint={s.settings.expiresHint} pro={s.settings.pro}
        >
          <input
            type="date" name="expires_at" class="input"
            value={asDateValue(link.expires_at)} disabled={locked("expiry")}
          />
        </Field>

        <Field
          label={s.settings.downloadLabel} locked={locked("block_download")}
          hint={s.settings.downloadHint} pro={s.settings.pro}
        >
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox" name="allow_download" value="1" class="input size-4"
              checked={link.allow_download === 1}
              disabled={locked("block_download") && link.allow_download === 1}
            />
            {s.settings.downloadAllow}
          </label>
        </Field>

        <div class="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button type="submit" class="btn">{s.settings.save}</button>
          {link.revoked_at ? (
            <button type="submit" name="revoked" value="0" class="btn" data-variant="outline">
              {s.settings.restore}
            </button>
          ) : (
            <button type="submit" name="revoked" value="1" class="btn" data-variant="outline">
              {s.settings.revoke}
            </button>
          )}
          {link.revoked_at && (
            <span class="text-sm text-destructive">{s.settings.revoked}</span>
          )}
        </div>
      </form>

      <form
        method="post" action={`/l/${link.slug}/version`} enctype="multipart/form-data"
        class="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
      >
        {token && <input type="hidden" name="t" value={token} />}
        <div>
          <h3 class="font-medium">
            {s.settings.replaceTitle}
            {locked("versioning") && <LockBadge pro={s.settings.pro} />}
          </h3>
          <p class="mt-1 text-sm text-muted-foreground">{s.settings.replaceBody}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <input type="file" name="file" accept="application/pdf" class="input" required disabled={locked("versioning")} />
          <button type="submit" class="btn" data-variant="outline" disabled={locked("versioning")}>
            <Upload /> {s.settings.replaceCta}
          </button>
        </div>
      </form>
    </section>
  );
};

const Field = ({
  label, hint, locked, pro, children,
}: { label: string; hint: string; locked: boolean; pro: string; children?: unknown }) => (
  <div class="flex flex-col gap-1.5">
    <span class="label text-sm font-medium">
      {label}
      {locked && <LockBadge pro={pro} />}
    </span>
    {children as never}
    <p class="text-xs text-muted-foreground">{hint}</p>
  </div>
);

/** `ms-2` rather than `ml-2`, so the badge trails the label in both directions. */
const LockBadge = ({ pro }: { pro: string }) => (
  <a href="/pricing" class="ms-2 rounded bg-muted px-1.5 py-0.5 align-middle text-[11px] font-medium text-muted-foreground hover:text-foreground">
    {pro}
  </a>
);

function featureLabel(s: Strings, feature: string): string {
  const labels: Record<string, string> = {
    password: s.settings.featurePassword,
    expiry: s.settings.featureExpiry,
    block_download: s.settings.featureBlockDownload,
    versioning: s.settings.featureVersioning,
  };
  return labels[feature] ?? s.settings.featureOther;
}
