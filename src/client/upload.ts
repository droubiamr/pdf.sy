// Upload page. XHR rather than fetch, purely because fetch still cannot report
// upload progress and a progress bar is the difference between "is it stuck?"
// and "it's working".
import { TOKEN_FIELD, turnstileToken, resetTurnstile } from "./turnstile";
import { t } from "./i18n";

const TURNSTILE = "#turnstile-upload";

const form = document.getElementById("upload-form") as HTMLFormElement;
const input = document.getElementById("file") as HTMLInputElement;
const dropzone = document.getElementById("dropzone") as HTMLLabelElement;
const progress = document.getElementById("progress") as HTMLDivElement;
const bar = document.getElementById("bar") as HTMLDivElement;
const progressLabel = document.getElementById("progress-label") as HTMLParagraphElement;
const errorEl = document.getElementById("error") as HTMLParagraphElement;
const result = document.getElementById("result") as HTMLDivElement;

type UploadResponse = {
  slug: string;
  manageToken: string;
  title: string;
  url: string;
  statsUrl: string;
  expiresAt: number | null;
};

input.addEventListener("change", () => {
  const file = input.files?.[0];
  if (file) void upload(file);
});

for (const event of ["dragenter", "dragover"] as const) {
  dropzone.addEventListener(event, (e) => {
    e.preventDefault();
    dropzone.classList.add("border-primary", "bg-accent/40");
  });
}
for (const event of ["dragleave", "drop"] as const) {
  dropzone.addEventListener(event, (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-primary", "bg-accent/40");
  });
}
dropzone.addEventListener("drop", (e) => {
  const file = (e as DragEvent).dataTransfer?.files?.[0];
  if (file) void upload(file);
});

function fail(message: string) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
  progress.classList.add("hidden");
}

async function upload(file: File) {
  errorEl.classList.add("hidden");
  form.classList.remove("hidden");
  progress.classList.remove("hidden");
  bar.style.width = "0%";

  // The challenge usually finishes long before a file is chosen, but a drop
  // within the first moment of the page can beat it. Say what is happening
  // rather than showing a stalled progress bar.
  progressLabel.textContent = t("checkingBrowser");
  const token = await turnstileToken(TURNSTILE);
  if (token === null && document.querySelector(TURNSTILE)) {
    return fail(t("verifyFailed"));
  }

  progressLabel.textContent = t("uploadingFile", { name: file.name });

  const body = new FormData();
  body.set("file", file);
  body.set("title", file.name.replace(/\.pdf$/i, ""));
  if (token) body.set(TOKEN_FIELD, token);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/documents");

  xhr.upload.addEventListener("progress", (e) => {
    if (!e.lengthComputable) return;
    const pct = Math.round((e.loaded / e.total) * 100);
    bar.style.width = `${pct}%`;
    progressLabel.textContent = pct < 100 ? t("uploadingPct", { pct }) : t("finishing");
  });

  xhr.addEventListener("error", () => fail(t("uploadFailed")));

  xhr.addEventListener("load", () => {
    // A token is spent whether or not the upload succeeded, so the widget needs
    // a fresh one before anyone tries again.
    resetTurnstile(TURNSTILE);

    if (xhr.status >= 400) {
      let message = t("uploadGeneric");
      try { message = JSON.parse(xhr.responseText).error ?? message; } catch { /* keep the default */ }
      return fail(message);
    }
    showResult(JSON.parse(xhr.responseText) as UploadResponse);
  });

  xhr.send(body);
}

function showResult(data: UploadResponse) {
  // Until accounts land, holding the manage token is what owning a link means.
  // Keep a copy so the stats page is still reachable after a refresh.
  try {
    const owned = JSON.parse(localStorage.getItem("pdfsy:owned") ?? "{}");
    owned[data.slug] = { token: data.manageToken, title: data.title, at: Date.now() };
    localStorage.setItem("pdfsy:owned", JSON.stringify(owned));
  } catch { /* private browsing; the on-screen links still work */ }

  const shareUrl = new URL(`/${data.slug}`, location.origin).toString();
  (document.getElementById("share-url") as HTMLInputElement).value = shareUrl;
  (document.getElementById("open-link") as HTMLAnchorElement).href = `/${data.slug}`;
  (document.getElementById("stats-link") as HTMLAnchorElement).href = `/l/${data.slug}/stats?t=${data.manageToken}`;
  (document.getElementById("qr") as HTMLImageElement).src = `/${data.slug}/qr.svg`;
  (document.getElementById("qr-download") as HTMLAnchorElement).href = `/${data.slug}/qr.svg`;

  form.classList.add("hidden");
  result.classList.remove("hidden");
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.getElementById("copy")?.addEventListener("click", async (e) => {
  const button = e.currentTarget as HTMLButtonElement;
  const url = (document.getElementById("share-url") as HTMLInputElement).value;
  await navigator.clipboard.writeText(url);
  const original = button.innerHTML;
  button.textContent = t("copied");
  setTimeout(() => { button.innerHTML = original; }, 1600);
});
