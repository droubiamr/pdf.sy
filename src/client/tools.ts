// Browser-side PDF tools. Nothing here touches the network: pdf-lib does the
// work locally, which is both faster than uploading and a genuine privacy claim
// we can make on the marketing page without an asterisk.
import { PDFDocument, degrees } from "pdf-lib";
import { TOKEN_FIELD, turnstileToken, resetTurnstile } from "./turnstile";

const TURNSTILE = "#turnstile-tools";

const status = document.getElementById("tool-status") as HTMLParagraphElement;
const runButton = document.getElementById("run") as HTMLButtonElement;
const downloadLink = document.getElementById("download") as HTMLAnchorElement;
const shareButton = document.getElementById("share-result") as HTMLButtonElement;

let active: "merge" | "split" | "rotate" = "merge";
let output: Blob | null = null;

/* ----------------------------- tab switching ----------------------------- */

document.getElementById("tool-tabs")?.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tool]");
  if (!button) return;

  active = button.dataset.tool as typeof active;
  for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    tab.setAttribute("aria-selected", String(tab === button));
  }
  for (const panel of document.querySelectorAll<HTMLElement>("[id^='panel-']")) {
    panel.classList.toggle("hidden", panel.id !== `panel-${active}`);
  }
  reset();
});

document.getElementById("merge-files")?.addEventListener("change", (e) => {
  const list = document.getElementById("merge-list") as HTMLOListElement;
  const files = [...((e.target as HTMLInputElement).files ?? [])];
  list.innerHTML = "";
  files.forEach((file, i) => {
    const item = document.createElement("li");
    item.textContent = `${i + 1}. ${file.name}`;
    list.appendChild(item);
  });
});

function reset() {
  output = null;
  status.textContent = "";
  downloadLink.classList.add("hidden");
  shareButton.classList.add("hidden");
}

function finish(bytes: Uint8Array, message: string) {
  output = new Blob([bytes as unknown as ArrayBuffer], { type: "application/pdf" });
  downloadLink.href = URL.createObjectURL(output);
  downloadLink.classList.remove("hidden");
  shareButton.classList.remove("hidden");
  status.textContent = message;
}

async function bytesOf(file: File) {
  return new Uint8Array(await file.arrayBuffer());
}

/* --------------------------------- tools --------------------------------- */

async function merge() {
  const files = [...((document.getElementById("merge-files") as HTMLInputElement).files ?? [])];
  if (files.length < 2) throw new Error("Choose at least two PDFs to merge.");

  const out = await PDFDocument.create();
  for (const file of files) {
    const src = await PDFDocument.load(await bytesOf(file));
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const page of copied) out.addPage(page);
  }
  finish(await out.save(), `Merged ${files.length} files into ${out.getPageCount()} pages.`);
}

async function split() {
  const file = (document.getElementById("split-file") as HTMLInputElement).files?.[0];
  if (!file) throw new Error("Choose a PDF to split.");

  const src = await PDFDocument.load(await bytesOf(file));
  const total = src.getPageCount();
  const from = Math.max(1, Number((document.getElementById("split-from") as HTMLInputElement).value || 1));
  const to = Math.min(total, Number((document.getElementById("split-to") as HTMLInputElement).value || total));
  if (from > to) throw new Error("The first page must come before the last.");

  const out = await PDFDocument.create();
  const indices = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
  for (const page of await out.copyPages(src, indices)) out.addPage(page);
  finish(await out.save(), `Kept pages ${from}–${to} of ${total}.`);
}

async function rotate() {
  const file = (document.getElementById("rotate-file") as HTMLInputElement).files?.[0];
  if (!file) throw new Error("Choose a PDF to rotate.");

  const angle = Number((document.querySelector<HTMLSelectElement>("#rotate-angle")!).value);
  const doc = await PDFDocument.load(await bytesOf(file));
  for (const page of doc.getPages()) {
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  finish(await doc.save(), `Rotated ${doc.getPageCount()} pages by ${angle}°.`);
}

runButton?.addEventListener("click", async () => {
  reset();
  runButton.disabled = true;
  status.textContent = "Working…";
  try {
    if (active === "merge") await merge();
    else if (active === "split") await split();
    else await rotate();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "That file could not be processed.";
  } finally {
    runButton.disabled = false;
  }
});

// The point of the free tools: every finished job ends at the paid product.
shareButton?.addEventListener("click", async () => {
  if (!output) return;
  shareButton.disabled = true;
  status.textContent = "Creating your link…";

  const body = new FormData();
  body.set("file", new File([output], "pdfsy-output.pdf", { type: "application/pdf" }));
  body.set("title", "Edited document");

  // This posts to the same guarded endpoint as the upload page, so it needs the
  // same token. Easy to miss: the two flows share a server route but not a
  // client, and protecting only one of them silently breaks the other.
  const token = await turnstileToken(TURNSTILE);
  if (token === null && document.querySelector(TURNSTILE)) {
    status.textContent = "Could not verify your browser. Reload the page and try again.";
    shareButton.disabled = false;
    return;
  }
  if (token) body.set(TOKEN_FIELD, token);

  const response = await fetch("/api/documents", { method: "POST", body });
  resetTurnstile(TURNSTILE);

  if (!response.ok) {
    status.textContent = "The link could not be created. Download the file instead.";
    shareButton.disabled = false;
    return;
  }
  const data = (await response.json()) as { slug: string; manageToken: string };
  location.href = `/l/${data.slug}/stats?t=${data.manageToken}`;
});
