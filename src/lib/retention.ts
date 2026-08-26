// The nightly sweep.
//
// This exists because the privacy policy and the terms both say, in four
// separate places, that a link made without an account is deleted after seven
// days — and until now nothing deleted anything, ever. Expired links stopped
// resolving, but the PDF stayed in R2 and every row stayed in D1 for good.
//
// That was two problems wearing one coat. The obvious one is cost: storage that
// only grows is a slow outage with a billing statement attached. The one that
// actually matters is that a published privacy promise was not true, and
// "we delete your file" is the single most load-bearing sentence on the page
// for anyone deciding whether to upload something confidential.
import type { Bindings } from "../db/schema";
import { purgeExpiredLimits } from "./limits";

/**
 * How long past *expiry* a document is kept before the bytes go.
 *
 * The link stops resolving the moment it expires; this is only the window in
 * which the deletion is still reversible by hand. Deleting on the same tick as
 * expiry would mean a mistake — a wrong expiry date, a fat-fingered revoke — is
 * unrecoverable, and there is no undo for an object that is gone from R2.
 *
 * It deliberately does not apply to a soft delete. Those come from someone
 * asking for their file to go, or from a takedown in scripts/moderate.mjs, and
 * making an operator wait an extra day to remove genuinely harmful material
 * would be the wrong default. Those are purged on the next run, which still
 * leaves until the following night to reverse with `unblock`.
 */
const GRACE_MS = 24 * 60 * 60 * 1000;

/** Documents purged per run. Keeps one night's work inside one invocation. */
const BATCH = 100;

export type SweepReport = {
  documents: number;
  objects: number;
  sessions: number;
  magicLinks: number;
  limits: number;
};

/**
 * Documents where every link has expired, plus anything soft-deleted.
 *
 * Revoked links are deliberately not included: revoking is reversible in the
 * UI ("Restore this link"), so treating it as consent to delete the file would
 * turn an undo button into a shredder.
 */
async function expiredDocuments(env: Bindings, cutoff: number): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT d.id
       FROM documents d
      WHERE d.deleted_at IS NOT NULL
         OR NOT EXISTS (
              SELECT 1 FROM links l
               WHERE l.document_id = d.id
                 AND (l.expires_at IS NULL OR l.expires_at > ?)
            )
      LIMIT ?`,
  ).bind(cutoff, BATCH).all<{ id: string }>();

  return results.map((row) => row.id);
}

/** Removes one document: its objects first, then every row referencing it. */
async function purgeDocument(env: Bindings, documentId: string): Promise<number> {
  const [versions, links] = await Promise.all([
    env.DB.prepare(`SELECT r2_key FROM document_versions WHERE document_id = ?`)
      .bind(documentId).all<{ r2_key: string }>(),
    env.DB.prepare(`SELECT slug FROM links WHERE document_id = ?`)
      .bind(documentId).all<{ slug: string }>(),
  ]);

  const keys = versions.results.map((row) => row.r2_key);

  // Bytes before rows. If this run dies in the middle, an orphaned row is
  // recoverable and a leaked object is not — nothing would ever name it again.
  if (keys.length > 0) await env.FILES.delete(keys);

  const slugs = links.results.map((row) => row.slug);
  const statements = [
    ...slugs.flatMap((slug) => [
      env.DB.prepare(`DELETE FROM page_stats WHERE slug = ?`).bind(slug),
      env.DB.prepare(`DELETE FROM view_sessions WHERE slug = ?`).bind(slug),
    ]),
    env.DB.prepare(`DELETE FROM links WHERE document_id = ?`).bind(documentId),
    env.DB.prepare(`DELETE FROM document_versions WHERE document_id = ?`).bind(documentId),
    env.DB.prepare(`DELETE FROM documents WHERE id = ?`).bind(documentId),
  ];

  await env.DB.batch(statements);
  return keys.length;
}

/** Credentials that can no longer authenticate anything. */
async function purgeStaleAuth(env: Bindings): Promise<{ sessions: number; magicLinks: number }> {
  const now = Date.now();

  const [sessions, magicLinks] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM auth_sessions WHERE expires_at < ?`).bind(now),
    // Used links are kept for an hour past expiry so they still count toward
    // the per-address send limit; deleting them immediately would reset it.
    env.DB.prepare(`DELETE FROM magic_links WHERE expires_at < ?`).bind(now - 60 * 60 * 1000),
  ]);

  return {
    sessions: sessions.meta.changes ?? 0,
    magicLinks: magicLinks.meta.changes ?? 0,
  };
}

export async function sweep(env: Bindings): Promise<SweepReport> {
  const startedAt = Date.now();
  const cutoff = startedAt - GRACE_MS;
  const report: SweepReport = { documents: 0, objects: 0, sessions: 0, magicLinks: 0, limits: 0 };
  const failures: string[] = [];

  for (const documentId of await expiredDocuments(env, cutoff)) {
    try {
      report.objects += await purgeDocument(env, documentId);
      report.documents++;
    } catch (error) {
      // One bad document must not strand the rest of the batch, and it will be
      // picked up again tomorrow.
      console.error("retention: could not purge document", documentId, error);
      failures.push(documentId);
    }
  }

  const auth = await purgeStaleAuth(env);
  report.sessions = auth.sessions;
  report.magicLinks = auth.magicLinks;
  report.limits = await purgeExpiredLimits(env);

  console.log("retention sweep", JSON.stringify(report));
  await record(env, startedAt, report, failures);
  return report;
}

/**
 * Leave a row behind saying this ran.
 *
 * Without it, "the cron is healthy" and "the cron has not fired since Tuesday"
 * look identical from outside — and the second is a privacy-policy breach in
 * slow motion, because files promised deleted are still sitting in R2. The
 * admin console reads this table and says which of the two is true.
 *
 * Wrapped in its own try/catch and never rethrown: a bookkeeping row failing to
 * write must not turn a sweep that successfully deleted a hundred files into a
 * reported failure.
 */
async function record(
  env: Bindings, startedAt: number, report: SweepReport, failures: string[],
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO sweep_runs
         (id, ran_at, duration_ms, documents, objects, sessions, magic_links, limits, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      startedAt,
      Date.now() - startedAt,
      report.documents,
      report.objects,
      report.sessions,
      report.magicLinks,
      report.limits,
      failures.length ? `${failures.length} document(s) could not be purged` : null,
    ).run();
  } catch (error) {
    console.error("retention: could not record the run", error);
  }
}
