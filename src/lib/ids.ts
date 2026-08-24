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

/**
 * Compares two secrets without giving away where they first differ.
 *
 * Every token here is long and random enough that a timing oracle is not a
 * realistic way in, so this is consistency rather than a fix for something
 * exploitable. It is worth having anyway: `===` on a secret is the kind of
 * thing that gets copied into the next comparison, and that one may not have
 * 165 bits of entropy behind it.
 *
 * Length is compared eagerly and does leak — irrelevant for the fixed-length
 * tokens this is used on.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  "auth", "logout", "claim", "settings", "account",
  "favicon.ico", "robots.txt", "sitemap.xml",
]);
