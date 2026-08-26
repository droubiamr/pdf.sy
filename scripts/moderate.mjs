// Abuse response, from the terminal.
//
// The report form has always written to `abuse_reports`, and the report page
// has always told people "reports are read by a person". Nothing read that
// table and nothing could act on it, so the sentence was aspirational and a
// takedown meant hand-writing SQL against production at the worst possible
// moment. This is the tool that makes the promise true.
//
//   node scripts/moderate.mjs reports              # what is waiting
//   node scripts/moderate.mjs inspect <slug>
//   node scripts/moderate.mjs block <slug> "reason"
//   node scripts/moderate.mjs delete <slug> "reason"
//   node scripts/moderate.mjs unblock <slug>
//   node scripts/moderate.mjs resolve <report-id>
//
// Add --remote to act on production. Everything defaults to the local database
// so that a half-remembered command is a rehearsal rather than an incident.
//
// The Moderation page of the admin console now does all of this with buttons,
// and is the better tool nine times out of ten. This is kept for the tenth: it
// talks to D1 through wrangler rather than through the Worker, so it still
// works when the Worker is broken, mid-deploy, or refusing to boot — which is
// exactly the sort of moment a takedown becomes urgent.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const remote = argv.includes("--remote");
const args = argv.filter((a) => a !== "--remote");
const [command, ...rest] = args;

/* ----------------------------- plumbing ---------------------------------- */

/**
 * Single-quote escaping for SQLite. These values reach the shell as one
 * --command string, so anything from a report — which is attacker-controlled
 * text by definition — has to be neutralised before it gets there.
 */
const q = (value) =>
  value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`;

/** Slugs are a fixed alphabet. Refuse anything else rather than escaping it. */
function slug(value) {
  if (!/^[23456789abcdefghijkmnpqrstuvwxyz]{4,32}$/.test(value ?? "")) {
    fail(`"${value}" is not a valid slug.`);
  }
  return value;
}

function sql(statement) {
  const output = execFileSync(
    "npx",
    [
      "wrangler", "d1", "execute", "pdfsy",
      remote ? "--remote" : "--local",
      "--json", "--command", statement,
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(output.slice(output.indexOf("[")))?.[0]?.results ?? [];
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const where = () => (remote ? "production" : "the local database");
const when = (ms) => (ms ? new Date(Number(ms)).toISOString().replace("T", " ").slice(0, 16) : "—");

/* ------------------------------ commands --------------------------------- */

/** The queue. Newest first, because abuse is usually a live problem. */
function reports() {
  const rows = sql(`
    SELECT r.id, r.slug, r.reason, r.reporter_email, r.created_at,
           d.status, d.deleted_at
      FROM abuse_reports r
      LEFT JOIN links l ON l.slug = r.slug
      LEFT JOIN documents d ON d.id = l.document_id
     WHERE r.status = 'open'
     ORDER BY r.created_at DESC
     LIMIT 50`);

  if (rows.length === 0) return console.log(`\n  No open reports in ${where()}.\n`);

  console.log(`\n  ${rows.length} open report(s) in ${where()}:\n`);
  for (const row of rows) {
    const state = row.deleted_at ? "DELETED" : row.status === "blocked" ? "BLOCKED" : row.status ?? "missing";
    console.log(`  ${row.id}`);
    console.log(`    /${row.slug}  ·  ${state}  ·  ${when(row.created_at)}`);
    console.log(`    ${String(row.reason).replace(/\s+/g, " ").slice(0, 160)}`);
    if (row.reporter_email) console.log(`    from ${row.reporter_email}`);
    console.log();
  }
}

/** Everything known about one link, before deciding what to do to it. */
function inspect(target) {
  const rows = sql(`
    SELECT l.slug, l.revoked_at, l.expires_at, l.created_at,
           d.id AS document_id, d.title, d.status, d.deleted_at,
           d.blocked_reason, d.uploader_hash, d.owner_id,
           u.email AS owner_email,
           (SELECT COUNT(*) FROM view_sessions WHERE slug = l.slug) AS views,
           (SELECT GROUP_CONCAT(sha256) FROM document_versions WHERE document_id = d.id) AS hashes
      FROM links l
      JOIN documents d ON d.id = l.document_id
      LEFT JOIN users u ON u.id = d.owner_id
     WHERE l.slug = ${q(target)}`);

  if (rows.length === 0) fail(`No link "${target}" in ${where()}.`);
  const row = rows[0];

  console.log(`\n  /${row.slug} — ${row.title}\n`);
  console.log(`    document    ${row.document_id}`);
  console.log(`    status      ${row.deleted_at ? "deleted" : row.status}`);
  if (row.blocked_reason) console.log(`    reason      ${row.blocked_reason}`);
  console.log(`    owner       ${row.owner_email ?? "(anonymous upload)"}`);
  console.log(`    uploaded    ${when(row.created_at)}`);
  console.log(`    expires     ${when(row.expires_at)}`);
  console.log(`    revoked     ${when(row.revoked_at)}`);
  console.log(`    views       ${row.views}`);
  console.log(`    sha256      ${(row.hashes ?? "").split(",").join("\n                ")}`);
  console.log();
}

/**
 * Stop serving a document, and make it hard to put straight back.
 *
 * Three writes, because one is not enough. The status flag stops this document
 * dead. The file hashes go on the blocklist so the identical file cannot be
 * re-uploaded. The uploader goes on the blocklist because changing one byte
 * defeats a hash and the person doing it is still the same person.
 */
function block(target, reason) {
  const rows = sql(`
    SELECT d.id, d.uploader_hash,
           (SELECT GROUP_CONCAT(sha256) FROM document_versions WHERE document_id = d.id) AS hashes
      FROM links l JOIN documents d ON d.id = l.document_id
     WHERE l.slug = ${q(target)}`);

  if (rows.length === 0) fail(`No link "${target}" in ${where()}.`);
  const { id, uploader_hash, hashes } = rows[0];
  const now = Date.now();

  sql(`UPDATE documents SET status = 'blocked', blocked_reason = ${q(reason)} WHERE id = ${q(id)}`);

  for (const hash of String(hashes ?? "").split(",").filter(Boolean)) {
    sql(`INSERT OR REPLACE INTO blocked_hashes (sha256, reason, created_at)
         VALUES (${q(hash)}, ${q(reason)}, ${now})`);
  }

  if (uploader_hash) {
    // Thirty days, not forever: the hash is salted per day, so it stops
    // matching that uploader long before this expires anyway. It blunts a
    // campaign rather than banning a person, which is all it can honestly do.
    sql(`INSERT OR REPLACE INTO blocked_uploaders (uploader_hash, reason, expires_at, created_at)
         VALUES (${q(uploader_hash)}, ${q(reason)}, ${now + 30 * 86400000}, ${now})`);
  }

  console.log(`\n  Blocked /${target} in ${where()}.`);
  console.log(`  The link now 404s, the file no longer serves, and re-upload is blocked.\n`);
}

function unblock(target) {
  const rows = sql(`
    SELECT d.id FROM links l JOIN documents d ON d.id = l.document_id
     WHERE l.slug = ${q(target)}`);
  if (rows.length === 0) fail(`No link "${target}" in ${where()}.`);

  sql(`UPDATE documents SET status = 'ready', blocked_reason = NULL, deleted_at = NULL
        WHERE id = ${q(rows[0].id)}`);
  console.log(`\n  /${target} is serving again in ${where()}.\n`);
}

/**
 * Soft delete. The link stops resolving immediately and the nightly sweep
 * removes the bytes after its grace period, so this stays reversible for a day.
 */
function remove(target, reason) {
  const rows = sql(`
    SELECT d.id FROM links l JOIN documents d ON d.id = l.document_id
     WHERE l.slug = ${q(target)}`);
  if (rows.length === 0) fail(`No link "${target}" in ${where()}.`);

  sql(`UPDATE documents SET deleted_at = ${Date.now()}, blocked_reason = ${q(reason)}
        WHERE id = ${q(rows[0].id)}`);

  console.log(`\n  /${target} is deleted in ${where()}.`);
  console.log(`  It stops resolving now; the file is removed by tonight's sweep.\n`);
}

function resolveReport(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) fail(`"${id}" is not a report id.`);
  sql(`UPDATE abuse_reports SET status = 'closed' WHERE id = ${q(id)}`);
  console.log(`\n  Report ${id} closed in ${where()}.\n`);
}

/* ------------------------------- dispatch -------------------------------- */

const usage = `
  node scripts/moderate.mjs reports
  node scripts/moderate.mjs inspect <slug>
  node scripts/moderate.mjs block   <slug> "reason"
  node scripts/moderate.mjs delete  <slug> "reason"
  node scripts/moderate.mjs unblock <slug>
  node scripts/moderate.mjs resolve <report-id>

  Add --remote to act on production. Defaults to local.
`;

switch (command) {
  case "reports": reports(); break;
  case "inspect": inspect(slug(rest[0])); break;
  case "block":   block(slug(rest[0]), rest[1] ?? "abuse report"); break;
  case "delete":  remove(slug(rest[0]), rest[1] ?? "abuse report"); break;
  case "unblock": unblock(slug(rest[0])); break;
  case "resolve": resolveReport(rest[0]); break;
  default:
    console.log(usage);
    process.exit(command ? 1 : 0);
}
