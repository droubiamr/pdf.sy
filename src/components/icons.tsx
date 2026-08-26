// Lucide icons, inlined. Basecoat sizes any bare <svg> inside a .btn for us,
// so these carry no size classes of their own.
type P = { class?: string };
const base = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round" as const,
  "stroke-linejoin": "round" as const,
};

export const FileText = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8m8 4H8m8 4H8" />
  </svg>
);

export const Link2 = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M9 17H7A5 5 0 0 1 7 7h2m6 0h2a5 5 0 0 1 0 10h-2M8 12h8" />
  </svg>
);

export const QrCode = (p: P) => (
  <svg {...base} class={p.class}>
    <rect width="5" height="5" x="3" y="3" rx="1" />
    <rect width="5" height="5" x="16" y="3" rx="1" />
    <rect width="5" height="5" x="3" y="16" rx="1" />
    <path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1" />
  </svg>
);

export const BarChart = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M3 3v16a2 2 0 0 0 2 2h16M7 16v-3m5 3V8m5 8v-5" />
  </svg>
);

export const Upload = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

export const Copy = (p: P) => (
  <svg {...base} class={p.class}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

export const Download = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

export const Merge = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M8 6 12 2l4 4M12 2v10a4 4 0 0 0 4 4h5M3 16h2a4 4 0 0 0 4-4" />
  </svg>
);

export const Scissors = (p: P) => (
  <svg {...base} class={p.class}>
    <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
  </svg>
);

export const RotateCw = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M21 12a9 9 0 1 1-3.15-6.85M21 3v6h-6" />
  </svg>
);

export const Shrink = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M15 15v6m0-6h6m-6 0 6 6M9 9V3m0 6H3m6 0L3 3" />
  </svg>
);

export const Sun = (p: P) => (
  <svg {...base} class={p.class}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export const Moon = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

export const Menu = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M4 12h16M4 6h16M4 18h16" />
  </svg>
);

export const X = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/* The admin console's own set. Same Lucide source as everything above; kept
   at the bottom so the public site's icons stay a short, obvious list. */

export const Users = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const Wallet = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
    <path d="M18 12a1 1 0 0 0 0 2h2v-2Z" />
  </svg>
);

export const Shield = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
  </svg>
);

export const Server = (p: P) => (
  <svg {...base} class={p.class}>
    <rect width="20" height="8" x="2" y="2" rx="2" />
    <rect width="20" height="8" x="2" y="14" rx="2" />
    <path d="M6 6h.01M6 18h.01" />
  </svg>
);

export const ScrollText = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M15 12h-5M15 8h-5M19 17V5a2 2 0 0 0-2-2H4" />
    <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 0 0-2-2" />
  </svg>
);

export const AlertTriangle = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const Check = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const Search = (p: P) => (
  <svg {...base} class={p.class}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const Trash = (p: P) => (
  <svg {...base} class={p.class}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
  </svg>
);
