// The console's only client-side JavaScript.
//
// Three small jobs, none of which the server can do: opening the sidebar on a
// phone, keeping the live counter live, and asking "are you sure" before a
// destructive form posts. Everything else on every admin page is plain HTML
// rendered on the server, which is why this file is 80 lines and not 8,000.
//
// It ships as a module from /assets, so the strict Content-Security-Policy
// allows it under `script-src 'self'` — no inline block, no hash to maintain.

/* ---------------------------- confirmations ------------------------------- */

/**
 * A `data-confirm` attribute on a <form> turns its submit into a question.
 *
 * Delegated from `document` rather than bound per form: the moderation queue
 * re-renders on every page load with a different set of forms, and a delegated
 * listener does not care how many there are or when they appeared.
 *
 * `confirm()` is deliberately the browser's own dialog. A prettier custom modal
 * would be a component to build, style, trap focus in and test — for a prompt
 * that appears before deleting somebody's file and nowhere else.
 */
document.addEventListener("submit", (event) => {
  const form = (event.target as HTMLElement)?.closest?.("form[data-confirm]");
  if (!form) return;
  if (!confirm(form.getAttribute("data-confirm") ?? "Are you sure?")) event.preventDefault();
});

/* ------------------------------- sidebar ---------------------------------- */

const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
const backdrop = document.querySelector<HTMLElement>("[data-sidebar-backdrop]");
const toggle = document.querySelector<HTMLElement>("[data-sidebar-toggle]");

function setSidebar(open: boolean): void {
  if (!sidebar || !backdrop) return;
  // `flex` rather than `block`: the sidebar is a flex column, and restoring it
  // with the wrong display value would stack its footer on top of its nav.
  sidebar.classList.toggle("hidden", !open);
  sidebar.classList.toggle("flex", open);
  backdrop.hidden = !open;
  backdrop.classList.toggle("hidden", !open);
  toggle?.setAttribute("aria-expanded", String(open));
}

toggle?.addEventListener("click", () => setSidebar(sidebar?.classList.contains("hidden") ?? true));
backdrop?.addEventListener("click", () => setSidebar(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setSidebar(false);
});

/* -------------------------------- live ------------------------------------ */

type Live = {
  live: number;
  feed: { title: string; slug: string; where: string; ago: string }[];
};

const counter = document.querySelector<HTMLElement>("[data-live-count]");
const feed = document.querySelector<HTMLElement>("[data-feed]");

async function poll(): Promise<void> {
  // Nothing to update on most pages — only the overview renders a feed, and the
  // counter lives in the header everywhere. Bail before the request rather than
  // after it if neither is present.
  if (!counter && !feed) return;
  // A backgrounded tab polling every twenty seconds for an hour is a hundred
  // and eighty pointless queries against D1.
  if (document.hidden) return;

  try {
    const response = await fetch("/admin/live", { headers: { accept: "application/json" } });
    if (!response.ok) return;
    const data = (await response.json()) as Live;

    if (counter) counter.textContent = String(data.live);
    if (feed) render(feed, data.feed);
  } catch {
    // A failed poll is not worth telling anyone about: the next one is twenty
    // seconds away, and the numbers on screen are still the last true ones.
  }
}

/**
 * Built with createElement and textContent, never innerHTML.
 *
 * Every string in this feed — a document title, a country — originated with
 * somebody who is not us. Assigning it as HTML would make the admin console the
 * one page on this site where an uploader gets to run script, and they would be
 * running it in an admin's session.
 */
function render(target: HTMLElement, rows: Live["feed"]): void {
  target.replaceChildren(
    ...rows.map((row) => {
      const li = document.createElement("li");
      li.className = "flex items-center gap-3 py-2 text-sm";

      const title = document.createElement("span");
      title.className = "min-w-0 flex-1 truncate";
      title.textContent = row.title;

      const where = document.createElement("span");
      where.className = "shrink-0 text-xs text-muted-foreground";
      where.textContent = row.where;

      const ago = document.createElement("span");
      ago.className = "w-16 shrink-0 text-end text-xs text-muted-foreground tnum";
      ago.textContent = row.ago;

      li.append(title, where, ago);
      return li;
    }),
  );
}

void poll();
setInterval(poll, 20_000);
// Catch up the moment the tab comes back, rather than showing a stale number
// for up to twenty seconds.
document.addEventListener("visibilitychange", () => { if (!document.hidden) void poll(); });
