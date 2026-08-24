// Builds everything the Worker serves as a static asset: the stylesheet, the
// three client bundles, and the vendored pdf.js. Deliberately a plain script —
// there is no bundler config to learn before you can change something.
import { execFileSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "public");

await rm(resolve(out, "assets"), { recursive: true, force: true });
await mkdir(resolve(out, "assets"), { recursive: true });
await mkdir(resolve(out, "vendor/pdfjs"), { recursive: true });

// 1. Tailwind + Basecoat + our theme variables.
execFileSync(
  "npx",
  ["@tailwindcss/cli", "-i", "src/styles/app.css", "-o", "public/assets/app.css", "--minify"],
  { cwd: root, stdio: "inherit" },
);

// 2. Client bundles. `/vendor/*` is left external so pdf.js stays whole and
//    keeps its own worker file.
await esbuild.build({
  entryPoints: {
    upload: "src/client/upload.ts",
    viewer: "src/client/viewer.ts",
    tools: "src/client/tools.ts",
    dashboard: "src/client/dashboard.ts",
    pricing: "src/client/pricing.ts",
  },
  outdir: "public/assets",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  external: ["/vendor/*"],
  absWorkingDir: root,
});

// 3. Vendored pdf.js. Copied rather than bundled so upgrades are a version bump.
const pdfjs = resolve(root, "node_modules/pdfjs-dist/build");
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
  await cp(resolve(pdfjs, file), resolve(out, "vendor/pdfjs", file));
}

console.log("built: public/assets (css + client bundles) and vendor/pdfjs");
