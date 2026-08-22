// Two small jobs: hand over links created before signing in, and toggle the
// per-link email notification.

type Owned = Record<string, { token: string; title?: string; at?: number }>;

async function claimLocalLinks() {
  let owned: Owned = {};
  try { owned = JSON.parse(localStorage.getItem("pdfsy:owned") ?? "{}"); } catch { return; }

  const items = Object.entries(owned).map(([slug, value]) => ({ slug, token: value.token }));
  if (items.length === 0) return;

  const response = await fetch("/api/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) return;

  const { claimed } = (await response.json()) as { claimed: number };
  // Whether or not anything was claimed, these tokens have done their job.
  localStorage.removeItem("pdfsy:owned");
  if (claimed === 0) return;

  const banner = document.getElementById("claim-banner");
  const text = document.getElementById("claim-text");
  if (banner && text) {
    text.textContent =
      `Added ${claimed} link${claimed === 1 ? "" : "s"} you created before signing in. ` +
      `They no longer expire. Refreshing…`;
    banner.classList.remove("hidden");
  }
  setTimeout(() => location.reload(), 1200);
}

document.addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const slug = input.dataset?.notify;
  if (!slug) return;

  const response = await fetch(`/api/links/${slug}/notify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: input.checked }),
  });
  if (!response.ok) input.checked = !input.checked; // put the switch back
});

void claimLocalLinks();
