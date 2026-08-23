import type { Link, DocumentVersion } from "../db/schema";

/**
 * A link's pinned_version of NULL means "always serve the latest", so it has to
 * resolve against the document rather than defaulting to 1 — otherwise every
 * link keeps serving v1 forever after the owner replaces the file.
 */
export async function resolveVersion(
  db: D1Database, link: Pick<Link, "document_id" | "pinned_version">,
): Promise<DocumentVersion | null> {
  if (link.pinned_version !== null) {
    return db.prepare(`SELECT * FROM document_versions WHERE document_id = ? AND version = ?`)
      .bind(link.document_id, link.pinned_version)
      .first<DocumentVersion>();
  }

  return db.prepare(
    `SELECT * FROM document_versions
      WHERE document_id = ?
      ORDER BY version DESC
      LIMIT 1`,
  ).bind(link.document_id).first<DocumentVersion>();
}
