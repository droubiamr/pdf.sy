// The viewer. Two jobs: render the document sharply, and measure attention
// honestly. No framework — this page is the first thing a recipient sees and it
// should never wait on a bundle.

type PdfJs = typeof import("pdfjs-dist");
type PdfDoc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

const root = document.querySelector<HTMLElement>("[data-slug]");
const slug = root?.dataset.slug;
const pagesEl = document.getElementById("pages") as HTMLDivElement;
const indicator = document.getElementById("page-indicator") as HTMLSpanElement;
const loading = document.getElementById("viewer-loading");

let sessionId: string | null = null;
let currentPage = 0;
let maxPage = 0;
let enteredAt = 0;
let downloaded = false;
let renderedAt = 0; // CSS width the current canvases were rasterised for

/** Dwell time per page, accumulated locally and flushed in batches. */
const pending = new Map<number, number>();
const observer = new IntersectionObserver(onIntersect, { threshold: [0.5] });

async function boot() {
  if (!slug) return;

  // Held in a variable so the bundler leaves the import alone: pdf.js is
  // vendored whole because it loads its own worker file at runtime.
  const pdfjsUrl = "/vendor/pdfjs/pdf.min.mjs";

  // The session and the library do not depend on each other; fetch both at once.
  const [session, pdfjs] = await Promise.all([
    fetch(`/api/v/${slug}/session`, { method: "POST" })
      .then((r) => (r.ok ? (r.json() as Promise<{ sessionId: string }>) : null))
      .catch(() => null),
    import(pdfjsUrl) as Promise<PdfJs>,
  ]);

  sessionId = session?.sessionId ?? null;
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";

  const doc = await pdfjs.getDocument({ url: `/v/${slug}/file`, withCredentials: true }).promise;

  loading?.remove();
  totalPages = doc.numPages;
  indicator.textContent = `1 / ${doc.numPages}`;

  await render(doc);

  // A canvas rasterised at the wrong width stays blurry forever, and the width
  // we measure at boot can still be settling (or be zero in an embedded frame).
  // Re-rasterise whenever the real width lands somewhere meaningfully different.
  let timer: ReturnType<typeof setTimeout>;
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (Math.abs(measureWidth() - renderedAt) > 32) void render(doc);
    }, 200);
  }).observe(pagesEl);
}

let totalPages = 0;

/** Best available idea of how wide a page should be drawn, in CSS pixels. */
function measureWidth(): number {
  const candidates = [
    pagesEl.getBoundingClientRect().width - 24, // minus the container's padding
    document.documentElement.clientWidth,
    window.innerWidth,
  ].filter((n) => n > 0);

  // 900 rather than 0 when nothing measures: too wide only costs memory,
  // too narrow permanently costs sharpness.
  return Math.min(Math.max(candidates.length ? Math.min(...candidates) : 900, 320), 1000);
}

async function render(doc: PdfDoc) {
  const cssWidth = measureWidth();
  renderedAt = cssWidth;

  for (const stale of pagesEl.querySelectorAll("[data-page]")) observer.unobserve(stale);
  pagesEl.replaceChildren();

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: (cssWidth / unscaled.width) * (window.devicePixelRatio || 1),
    });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.className = "block rounded-lg border border-border bg-white shadow-sm";

    const wrapper = document.createElement("div");
    wrapper.className = "w-full";
    wrapper.dataset.page = String(n);
    wrapper.appendChild(canvas);
    pagesEl.appendChild(wrapper);

    observer.observe(wrapper);
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
  }
}

function onIntersect(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const page = Number((entry.target as HTMLElement).dataset.page);
    if (page === currentPage) continue;

    bankTime();
    currentPage = page;
    enteredAt = performance.now();
    maxPage = Math.max(maxPage, page);
    indicator.textContent = `${page} / ${totalPages || "?"}`;
  }
}

/** Move the time spent on the page we are leaving into the pending batch. */
function bankTime() {
  if (!currentPage || !enteredAt) return;
  const ms = Math.round(performance.now() - enteredAt);
  if (ms > 250) pending.set(currentPage, (pending.get(currentPage) ?? 0) + ms);
  enteredAt = performance.now();
}

function flush(useBeacon = false) {
  bankTime();
  if (!sessionId || (pending.size === 0 && !downloaded)) return;

  const payload = JSON.stringify({
    sessionId,
    maxPage,
    downloaded,
    pages: [...pending].map(([page, ms]) => ({ page, ms })),
  });
  pending.clear();

  const url = `/api/v/${slug}/ping`;
  // On the way out, only sendBeacon survives the page being torn down.
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    return;
  }
  fetch(url, { method: "POST", body: payload, headers: { "content-type": "application/json" }, keepalive: true })
    .catch(() => { /* a dropped ping is not worth bothering the reader about */ });
}

setInterval(() => flush(false), 5000);
document.addEventListener("visibilitychange", () => { if (document.hidden) flush(true); });
window.addEventListener("pagehide", () => flush(true));
document.getElementById("download")?.addEventListener("click", () => { downloaded = true; flush(false); });

boot().catch(() => {
  if (loading) loading.textContent = "This document could not be loaded.";
});
