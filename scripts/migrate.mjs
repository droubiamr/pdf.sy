// Applies every migration that has not run yet, in filename order, and records
// it. Re-running is a no-op, which is the whole point: hand-applying SQL files
// is fine exactly once and a footgun forever after.
//
//   node scripts/migrate.mjs          # local D1
//   node scripts/migrate.mjs --remote # the real thing
import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const remote = process.argv.includes("--remote");
const target = remote ? "--remote" : "--local";

function d1(args) {
  return execFileSync("npx", ["wrangler", "d1", "execute", "pdfsy", target, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

d1(["--command", "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)"]);

const appliedJson = d1(["--json", "--command", "SELECT name FROM schema_migrations"]);
const applied = new Set(
  (JSON.parse(appliedJson.slice(appliedJson.indexOf("[")))?.[0]?.results ?? []).map((r) => r.name),
);

const files = (await readdir(resolve(root, "migrations"))).filter((f) => f.endsWith(".sql")).sort();
let ran = 0;

for (const file of files) {
  if (applied.has(file)) continue;
  process.stdout.write(`applying ${file}… `);
  d1(["--file", `./migrations/${file}`]);
  d1(["--command", `INSERT INTO schema_migrations (name, applied_at) VALUES ('${file}', ${Date.now()})`]);
  console.log("done");
  ran++;
}

console.log(ran === 0 ? `up to date (${files.length} migrations, ${target})` : `applied ${ran} (${target})`);
