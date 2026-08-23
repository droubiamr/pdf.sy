// One-time Cloudflare setup, then deploy. Safe to re-run: every step checks
// before it creates.
//
//   npx wrangler login      # once, opens your browser
//   node scripts/setup-cloud.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "pdfsy-files";
const DATABASE = "pdfsy";

// ---------------------------------------------------------------------------
// THE ONE THING YOU CANNOT CHANGE LATER.
//
// Jurisdiction is fixed when the bucket and database are created. Moving to a
// different one afterwards means making new resources and copying everything
// across, so it is worth thirty seconds of thought now.
//
// "eu"  — data stays in EU datacenters. GDPR-friendly, and it makes a
//         "your files stay in Europe" claim true rather than aspirational.
// null  — Cloudflare's global default. Fine, but not claimable.
//
// Set to null before your first run if you would rather stay global.
// ---------------------------------------------------------------------------
const JURISDICTION = "eu";

const run = (args, quiet = false) =>
  execFileSync("npx", ["wrangler", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
  });

const step = (msg) => console.log(`\n▸ ${msg}`);

/* 1. Are we logged in? Everything below fails confusingly otherwise. */
step("Checking authentication");
try {
  const who = run(["whoami"], true);
  if (who.includes("not authenticated")) throw new Error("not authenticated");
  console.log("  authenticated");
} catch {
  console.error("\n  Not logged in. Run this first, then re-run me:\n\n    npx wrangler login\n");
  process.exit(1);
}

/* 2. R2 bucket for the PDFs. */
step(`Creating R2 bucket "${BUCKET}"${JURISDICTION ? ` in the ${JURISDICTION.toUpperCase()} jurisdiction` : ""}`);
try {
  run(["r2", "bucket", "create", BUCKET, ...(JURISDICTION ? ["--jurisdiction", JURISDICTION] : [])], true);
  console.log("  created");
} catch (error) {
  const text = String(error.stdout ?? "") + String(error.stderr ?? "");
  if (/already (exists|owned)/i.test(text)) console.log("  already exists");
  else {
    console.error(text || error.message);
    console.error("\n  If this says R2 is not enabled, turn it on once in the Cloudflare dashboard\n  (R2 → Overview) and re-run.\n");
    process.exit(1);
  }
}

/* 3. D1 database, and its id written into wrangler.toml. */
step(`Creating D1 database "${DATABASE}"${JURISDICTION ? ` in the ${JURISDICTION.toUpperCase()} jurisdiction` : ""}`);
let config = readFileSync(resolve(root, "wrangler.toml"), "utf8");

if (!config.includes("PLACEHOLDER_RUN_WRANGLER_D1_CREATE")) {
  console.log("  wrangler.toml already has a database_id");
} else {
  try {
    run(["d1", "create", DATABASE, ...(JURISDICTION ? ["--jurisdiction", JURISDICTION] : [])], true);
    console.log("  created");
  } catch (error) {
    const text = String(error.stdout ?? "") + String(error.stderr ?? "");
    if (/already exists/i.test(text)) console.log("  already exists");
    else { console.error(text || error.message); process.exit(1); }
  }

  // Read the id back from the list rather than scraping the create output —
  // the list format is stable and works whether we just made it or not.
  const list = run(["d1", "list", "--json", ...(JURISDICTION ? ["--jurisdiction", JURISDICTION] : [])], true);
  const database = JSON.parse(list.slice(list.indexOf("["))).find((d) => d.name === DATABASE);
  if (!database?.uuid) {
    console.error(`  Could not find a database named "${DATABASE}" after creating it.`);
    process.exit(1);
  }

  config = config.replace("PLACEHOLDER_RUN_WRANGLER_D1_CREATE", database.uuid);
  writeFileSync(resolve(root, "wrangler.toml"), config);
  console.log(`  database_id written to wrangler.toml (${database.uuid})`);
}

/* 4. Schema. */
step("Applying migrations to the remote database");
execFileSync("node", ["scripts/migrate.mjs", "--remote"], { cwd: root, stdio: "inherit" });

/* 5. Build and ship. */
step("Building");
execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });

step("Deploying");
execFileSync("npx", ["wrangler", "deploy"], { cwd: root, stdio: "inherit" });

console.log(`
▸ Done.

  Open the workers.dev URL printed above — sign-in links, share links and QR
  codes all follow whatever host you are on, so it works immediately.

  Email is still printed to the Worker log rather than sent. To send for real:

      npx wrangler secret put RESEND_API_KEY

  Watch the live logs with:

      npx wrangler tail
`);
