import type { OwnedLink } from "../routes/links";
import { can, type Feature } from "../lib/plans";
import { Upload } from "./icons";

type Props = {
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

export const LinkSettings = ({ link, token, user, refused, updatedVersion, error }: Props) => {
  const locked = (feature: Feature) => !can(user, feature);

  return (
    <section class="mt-12">
      <h2 class="font-semibold">Link settings</h2>

      {refused && (
        <p class="mt-3 rounded-lg border border-border bg-accent px-4 py-3 text-sm text-accent-foreground">
          <strong class="font-medium">{featureLabel(refused)}</strong> is a Pro feature.
          Everything else you changed was saved.{" "}
          <a href="/pricing" class="font-medium underline">See plans</a>
        </p>
      )}
      {updatedVersion && (
        <p class="mt-3 rounded-lg border border-border bg-accent px-4 py-3 text-sm text-accent-foreground">
          Replaced the file — everyone holding this link now sees version {updatedVersion}.
        </p>
      )}
      {error && (
        <p class="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {uploadError(error)}
        </p>
      )}

      <form method="post" action={`/l/${link.slug}/settings`} class="mt-4 flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
        {token && <input type="hidden" name="t" value={token} />}

        <div class="flex flex-col gap-1.5">
          <label for="name" class="label text-sm font-medium">Name</label>
          <input id="name" name="name" class="input" value={link.name ?? ""} maxlength={200} />
          <p class="text-xs text-muted-foreground">Only you see this. Useful when one document has several links.</p>
        </div>

        <Field
          label="Password" locked={locked("password")}
          hint="Visitors must enter this before the document loads."
        >
          <input
            type="password" name="password" class="input" autocomplete="new-password"
            placeholder={link.password_hash ? "Set — type to replace" : "No password"}
            disabled={locked("password")}
          />
          {link.password_hash && !locked("password") && (
            <label class="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="clear_password" value="1" class="input size-4" />
              Remove the password
            </label>
          )}
        </Field>

        <Field
          label="Expires" locked={locked("expiry")}
          hint="After this date the link stops working. Leave empty for never."
        >
          <input
            type="date" name="expires_at" class="input"
            value={asDateValue(link.expires_at)} disabled={locked("expiry")}
          />
        </Field>

        <Field
          label="Downloading" locked={locked("block_download")}
          hint="Turning this off hides the download button and blocks the file endpoint."
        >
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox" name="allow_download" value="1" class="input size-4"
              checked={link.allow_download === 1}
              disabled={locked("block_download") && link.allow_download === 1}
            />
            Allow visitors to download the file
          </label>
        </Field>

        <div class="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button type="submit" class="btn">Save settings</button>
          {link.revoked_at ? (
            <button type="submit" name="revoked" value="0" class="btn" data-variant="outline">
              Restore this link
            </button>
          ) : (
            <button type="submit" name="revoked" value="1" class="btn" data-variant="outline">
              Revoke this link
            </button>
          )}
          {link.revoked_at && (
            <span class="text-sm text-destructive">Revoked — nobody can open it.</span>
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
            Replace the file
            {locked("versioning") && <LockBadge />}
          </h3>
          <p class="mt-1 text-sm text-muted-foreground">
            Upload a new PDF and the link stays the same. Anyone who already has it
            sees the new version, and your view history carries over.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <input type="file" name="file" accept="application/pdf" class="input" required disabled={locked("versioning")} />
          <button type="submit" class="btn" data-variant="outline" disabled={locked("versioning")}>
            <Upload /> Upload new version
          </button>
        </div>
      </form>
    </section>
  );
};

const Field = ({
  label, hint, locked, children,
}: { label: string; hint: string; locked: boolean; children?: unknown }) => (
  <div class="flex flex-col gap-1.5">
    <span class="label text-sm font-medium">
      {label}
      {locked && <LockBadge />}
    </span>
    {children as never}
    <p class="text-xs text-muted-foreground">{hint}</p>
  </div>
);

const LockBadge = () => (
  <a href="/pricing" class="ml-2 rounded bg-muted px-1.5 py-0.5 align-middle text-[11px] font-medium text-muted-foreground hover:text-foreground">
    Pro
  </a>
);

/**
 * Why a replacement upload was refused. The codes come from lib/pdf.ts, and
 * saying which rule the file broke is worth the extra strings — "that file is
 * not a PDF" for a file that plainly is one reads as a broken uploader.
 */
function uploadError(code: string): string {
  const messages: Record<string, string> = {
    too_large: "That file is too large.",
    not_a_pdf: "That file is not a valid PDF.",
    truncated: "That PDF looks incomplete — it may not have finished uploading.",
    active_content: "That PDF contains active content (script, media, or a launch action) and cannot be shared.",
    embedded_file: "That PDF has another file attached inside it and cannot be shared.",
    encrypted: "That PDF is password-protected. Remove its password first — you can set a link password here instead.",
    blocked: "That file has been blocked.",
    rate_limited: "Too many uploads just now. Wait a few minutes and try again.",
  };
  return messages[code] ?? "That file could not be accepted.";
}

function featureLabel(feature: string): string {
  const labels: Record<string, string> = {
    password: "Password protection",
    expiry: "Link expiry",
    block_download: "Blocking downloads",
    versioning: "Replacing the file",
  };
  return labels[feature] ?? "That setting";
}
