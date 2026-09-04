// The viewer. Two jobs: render the document sharply, and measure attention
// honestly. No framework — this page is the first thing a recipient sees and it
// should never wait on a bundle.

import { t } from "./i18n";

type PdfJs = typeof import("pdfjs-dist");
type PdfDoc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDoc["getPage"]>>;
type PdfViewport = ReturnType<PdfPage["getViewport"]>;
type RenderTask = ReturnType<PdfPage["render"]>;

/**
 * A page's slot in the document. Carries everything needed to draw it, so a
 * canvas can be thrown away and rebuilt later from the wrapper alone.
 */
type PageSlot = HTMLDivElement & {
  _pdfPage?: PdfPage;
  _viewport?: PdfViewport;
  _task?: RenderTask | null;
};

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
const renderObserver = new IntersectionObserver(onRenderIntersect, { rootMargin: "200px", threshold: 0 });

/**
 * How many pages either side of the newest one keep their pixels.
 *
 * Drawing lazily bounds how fast canvas memory is claimed, not how much: a
 * canvas keeps its backing store forever once drawn, so reading to the end of
 * a long document still ends up holding every page at once. Two either side
 * (five live) covers the pages a reader can actually see mid-scroll while
 * making the ceiling a function of this number rather than of page count.
 */
const WINDOW_RADIUS = 2;

/** Pages currently holding pixels. Everything else is a zero-sized canvas. */
const live = new Set<PageSlot>();

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

  for (const stale of pagesEl.querySelectorAll("[data-page]")) {
    (stale as PageSlot)._task?.cancel();
    observer.unobserve(stale);
    renderObserver.unobserve(stale);
  }
  live.clear();
  pagesEl.replaceChildren();

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: (cssWidth / unscaled.width) * Math.min(window.devicePixelRatio || 1, 2),
    });

    const canvas = document.createElement("canvas");
    // Explicitly zero, not merely unset: a canvas with no dimensions still
    // defaults to 300x150 and holds that buffer, which is 180 KB per undrawn
    // page. `aspect-ratio` is what keeps the slot the right shape anyway, so
    // scroll height is correct from the start and does not move when a canvas
    // is released and later redrawn.
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.className = "block rounded-lg border border-border bg-white shadow-sm";

    const wrapper = document.createElement("div") as PageSlot;
    wrapper.className = "w-full";
    wrapper.dataset.page = String(n);
    wrapper._pdfPage = page;
    wrapper._viewport = viewport;
    wrapper.appendChild(canvas);
    pagesEl.appendChild(wrapper);

    observer.observe(wrapper);
    renderObserver.observe(wrapper);
  }
}

/**
 * Hand a page's pixels back to the browser.
 *
 * Setting either dimension to zero is what actually frees the backing store —
 * removing the element would too, but the slot has to stay in the document or
 * the scroll position jumps. The page goes back under the render observer so
 * scrolling to it again redraws it.
 */
function releasePage(slot: PageSlot) {
  slot._task?.cancel();
  slot._task = null;

  const canvas = slot.querySelector("canvas");
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }

  live.delete(slot);
  renderObserver.observe(slot);
}

/** Drop every live page further than WINDOW_RADIUS from the one just drawn. */
function trimTo(center: number) {
  for (const slot of [...live]) {
    if (Math.abs(Number(slot.dataset.page) - center) > WINDOW_RADIUS) releasePage(slot);
  }
}

/**
 * Rasterise a page the first time it comes near the viewport.
 *
 * The `getContext` guard is the load-bearing part. iOS Safari has a hard cap on
 * total canvas memory and returns null rather than throwing once it is hit;
 * passing that null on is what turned a memory limit into a dead viewer. One
 * page that cannot get a context is skipped, and the rest still draw.
 */
async function onRenderIntersect(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;

    const slot = entry.target as PageSlot;
    // Stop watching while it is drawn; releasePage() puts it back if the page
    // later falls out of the window.
    renderObserver.unobserve(slot);

    const page = slot._pdfPage;
    const viewport = slot._viewport;
    if (!page || !viewport) continue;
    const canvas = slot.querySelector("canvas");
    if (!canvas) continue;

    // Claims the backing store — for a first draw and for a page coming back
    // after release alike, since both start from a zero-sized canvas.
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    live.add(slot);
    const task = page.render({ canvas, canvasContext: ctx, viewport });
    slot._task = task;

    await task.promise.catch(() => {
      /* A cancelled render is the normal way a page leaves the window, and one
         page failing to draw is not worth breaking the rest. */
    });

    if (slot._task === task) {
      slot._task = null;
      trimTo(Number(slot.dataset.page));
    }
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
  if (loading) loading.textContent = t("viewerFailed");
});
