// Slug alphabet with the ambiguous glyphs removed (no 0/O, 1/l/I). These links
// get read aloud over the phone and typed off a QR code on a printed sign.
const SLUG_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";

function randomFrom(alphabet: string, length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export const newSlug = () => randomFrom(SLUG_ALPHABET, 8);
export const newId = () => crypto.randomUUID();

// Shown once, stored in the visitor's localStorage. Until accounts land in
// phase 2, holding this token is what "owning" a document means.
export const newManageToken = () => randomFrom("abcdefghijklmnopqrstuvwxyz0123456789", 32);

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Unique-visitor counting without storing anyone's IP. The salt rotates daily,
// so yesterday's hashes cannot be correlated with today's.
export async function hashIp(ip: string, salt: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const enc = new TextEncoder().encode(`${day}:${salt}:${ip}`);
  return (await sha256Hex(enc)).slice(0, 32);
}

// Routes that can never become a document slug.
export const RESERVED_SLUGS = new Set([
  "api", "v", "l", "new", "tools", "assets", "vendor", "about", "terms",
  "privacy", "report", "pricing", "login", "signup", "dashboard", "docs",
  "favicon.ico", "robots.txt", "sitemap.xml",
]);
