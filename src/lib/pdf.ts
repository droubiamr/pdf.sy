// What we will and will not accept as a PDF.
//
// Be clear about what this is worth. This is not a malware scanner and must
// never be described as one — a determined attacker has options below, and the
// notes at the bottom of this file say what they are.
//
// What it does buy:
//   - it rejects files that are not PDFs at all, before they reach a reader,
//   - it rejects the commodity case: active content, whether written in the
//     clear or packed into a compressed object stream,
//   - it refuses encrypted files, which both fail to render in our own viewer
//     and would make the scan meaningless if allowed through.
//
// The object-stream part matters more than it sounds. Every mainstream producer
// — Word, LibreOffice, Acrobat, pdf-lib — packs object definitions into a
// Flate-compressed `/ObjStm` by default, so a scan that only reads raw bytes
// finds nothing in almost any real file. A scanner that reports clean on
// everything is worse than no scanner, because it is believed. Hence `inflate`.
//
// The real containment is still elsewhere, and it is structural: the viewer
// rasterises through pdf.js to a canvas and never executes embedded content, R2
// is private so every byte is served through a route that can refuse, and a
// blocked document stops resolving everywhere at once.

export type Verdict =
  | { ok: true; warnings: string[] }
  | { ok: false; code: string; message: string };

/** Bytes that end a PDF name token. Used so `/JS` does not match `/JSomething`. */
const DELIMITERS = new Set([
  0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20, // whitespace
  0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25, // ( ) < > [ ] { } / %
]);

type Rule = { name: string; code: string; message: string };

/**
 * Name tokens that get a file refused.
 *
 * Every one of these is either an instruction to execute something or a
 * container for a second file. None has a legitimate reason to appear in a
 * document someone is sharing as a link — which is the whole scope of this
 * product, and why refusing outright is the right trade here rather than
 * warning and serving it anyway.
 */
const REFUSE: Rule[] = [
  {
    name: "Launch",
    code: "active_content",
    message: "This PDF asks to launch an external program, so it cannot be shared here.",
  },
  {
    name: "JavaScript",
    code: "active_content",
    message: "This PDF contains embedded JavaScript, so it cannot be shared here.",
  },
  {
    name: "JS",
    code: "active_content",
    message: "This PDF contains embedded JavaScript, so it cannot be shared here.",
  },
  {
    name: "EmbeddedFile",
    code: "embedded_file",
    message: "This PDF has another file attached inside it, so it cannot be shared here.",
  },
  {
    name: "RichMedia",
    code: "active_content",
    message: "This PDF contains embedded media, so it cannot be shared here.",
  },
  {
    name: "XFA",
    code: "active_content",
    message: "This PDF uses an XFA form, which this viewer cannot open safely.",
  },
  {
    name: "Encrypt",
    code: "encrypted",
    message:
      "This PDF is password-protected. Remove its password first — you can set a link password here instead.",
  },
];

/** Worth recording, not worth refusing. Legitimate documents use these. */
const WARN = ["OpenAction", "AA", "URI", "SubmitForm", "GoToR", "GoToE"];

const ALL = [...REFUSE.map((rule) => rule.name), ...WARN];

const encoder = new TextEncoder();
const PATTERNS = ALL.map((name) => ({ name, bytes: encoder.encode(name) }));

/**
 * Single pass over the file, stopping at every `/` and testing the name that
 * follows. One scan for every pattern rather than one scan each, because the
 * file can be 25 MB and the Worker CPU budget is not generous.
 */
function findNames(bytes: Uint8Array): Set<string> {
  const found = new Set<string>();

  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0x2f) continue; // '/'

    for (const pattern of PATTERNS) {
      if (found.has(pattern.name)) continue;

      const start = i + 1;
      const end = start + pattern.bytes.length;
      if (end > bytes.length) continue;

      let matched = true;
      for (let j = 0; j < pattern.bytes.length; j++) {
        if (bytes[start + j] !== pattern.bytes[j]) { matched = false; break; }
      }
      // A name token has to actually end here, otherwise `/JS` matches the
      // first two letters of an unrelated `/JSpecial`.
      if (matched && (end === bytes.length || DELIMITERS.has(bytes[end]))) {
        found.add(pattern.name);
      }
    }
  }

  return found;
}

/** Is `needle` present anywhere in the last `window` bytes? */
function endsWith(bytes: Uint8Array, needle: string, window: number): boolean {
  const target = encoder.encode(needle);
  const from = Math.max(0, bytes.length - window);

  for (let i = bytes.length - target.length; i >= from; i--) {
    let matched = true;
    for (let j = 0; j < target.length; j++) {
      if (bytes[i + j] !== target[j]) { matched = false; break; }
    }
    if (matched) return true;
  }

  return false;
}

/* --------------------------- compressed objects --------------------------- */

// Budgets. Inflating attacker-supplied data is a zip-bomb invitation, so every
// loop below is bounded and the caps are the security control, not tuning.
const MAX_OBJECT_STREAMS = 64;      // real documents have a handful
const MAX_INFLATED_PER_STREAM = 8 * 1024 * 1024;
const MAX_INFLATED_TOTAL = 24 * 1024 * 1024;

/** Index of `needle` in `haystack` at or after `from`, or -1. */
function indexOf(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

const KEYWORD_STREAM = encoder.encode("stream");
const KEYWORD_ENDSTREAM = encoder.encode("endstream");
const KEYWORD_OBJSTM = encoder.encode("ObjStm");

/**
 * Inflates up to `cap` bytes, then stops and walks away.
 *
 * The cap is enforced by cancelling the reader mid-stream rather than by
 * checking the result, because the whole point is never to hold the expanded
 * output of a bomb in memory. A truncated read is fine: the names we look for
 * appear in the object stream's header region, near the front.
 */
async function inflate(data: Uint8Array, format: "deflate" | "deflate-raw", cap: number): Promise<Uint8Array | null> {
  try {
    const decompressor = new DecompressionStream(format);

    // Not awaited: a stream small enough to buffer resolves on its own, and a
    // larger one stays blocked until the reader below drains it.
    const writer = decompressor.writable.getWriter();
    void writer.write(data).catch(() => {});
    void writer.close().catch(() => {});

    const reader = decompressor.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (total < cap) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    void reader.cancel().catch(() => {});

    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk.subarray(0, Math.min(chunk.length, total - offset)), offset);
      offset += chunk.length;
      if (offset >= total) break;
    }
    return out;
  } catch {
    // Not Flate, corrupt, or truncated. Nothing to read, nothing to report.
    return null;
  }
}

/**
 * Names hiding inside `/ObjStm` streams.
 *
 * Only object streams are opened, and that is a deliberate limit rather than
 * laziness: object *definitions* are the only place an action dictionary can
 * live, so page content streams — which are the bulk of any file's bytes — can
 * be skipped entirely. It keeps this affordable on a 25 MB upload.
 */
async function findNamesInObjectStreams(bytes: Uint8Array): Promise<Set<string>> {
  const found = new Set<string>();
  let cursor = 0;
  let opened = 0;
  let inflatedTotal = 0;

  while (opened < MAX_OBJECT_STREAMS && inflatedTotal < MAX_INFLATED_TOTAL) {
    const marker = indexOf(bytes, KEYWORD_OBJSTM, cursor);
    if (marker === -1) break;
    cursor = marker + KEYWORD_OBJSTM.length;

    const start = indexOf(bytes, KEYWORD_STREAM, marker);
    if (start === -1) break;

    const end = indexOf(bytes, KEYWORD_ENDSTREAM, start);
    if (end === -1) break;

    // Step past `stream` and the EOL that must follow it.
    let from = start + KEYWORD_STREAM.length;
    if (bytes[from] === 0x0d) from++;
    if (bytes[from] === 0x0a) from++;

    // ...and stop short of the EOL that precedes `endstream`. That byte is PDF
    // syntax, not stream data, and zlib refuses the whole stream as trailing
    // junk if it is included — which silently turned this entire check into a
    // no-op the first time round. The trim is why any of this works.
    let to = end;
    while (to > from && (bytes[to - 1] === 0x0a || bytes[to - 1] === 0x0d)) to--;
    if (from >= to) { cursor = end; continue; }

    const payload = bytes.subarray(from, to);
    const budget = Math.min(MAX_INFLATED_PER_STREAM, MAX_INFLATED_TOTAL - inflatedTotal);

    // zlib-wrapped first, since that is what `/FlateDecode` means; raw deflate
    // second, because some producers omit the header.
    const decoded =
      (await inflate(payload, "deflate", budget)) ??
      (await inflate(payload, "deflate-raw", budget));

    if (decoded) {
      inflatedTotal += decoded.length;
      for (const name of findNames(decoded)) found.add(name);
    }

    opened++;
    cursor = end;
  }

  return found;
}

export async function inspectPdf(buffer: ArrayBuffer): Promise<Verdict> {
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 32) {
    return { ok: false, code: "not_a_pdf", message: "That file is too small to be a PDF." };
  }

  // Header. The spec tolerates leading junk; we do not. A file that does not
  // begin with the marker is either broken or trying to be two things at once,
  // and neither is worth serving to someone else.
  const header = String.fromCharCode(...bytes.slice(0, 5));
  if (header !== "%PDF-") {
    return { ok: false, code: "not_a_pdf", message: "That file is not a valid PDF." };
  }

  // Trailer. Truncated uploads render as a blank page in the viewer and look
  // like our bug rather than a bad file, so they are worth catching here.
  if (!endsWith(bytes, "%%EOF", 4096)) {
    return {
      ok: false,
      code: "truncated",
      message: "That PDF looks incomplete — it may not have finished uploading.",
    };
  }

  const found = findNames(bytes);
  for (const name of await findNamesInObjectStreams(bytes)) found.add(name);

  for (const rule of REFUSE) {
    if (found.has(rule.name)) {
      return { ok: false, code: rule.code, message: rule.message };
    }
  }

  return { ok: true, warnings: WARN.filter((name) => found.has(name)) };
}

/* -------------------------------------------------------------------------- */
/*  Known gaps                                                                 */
/* -------------------------------------------------------------------------- */
//
// Written down because the failure mode of a check like this is quiet
// over-confidence, and the next person to touch it deserves the real list:
//
//   - Only `/ObjStm` streams are opened. An action reachable some other way, or
//     a producer that nests object streams unusually, is not seen.
//   - Only Flate is decoded. `/LZWDecode` and filter chains are skipped.
//   - Names can be written with hex escapes — `/J#53` is `/JS` — and this does
//     not normalise them. Closing that means a real tokeniser.
//   - Nothing here reasons about *behaviour*. A file with no active content at
//     all can still carry an exploit aimed at a reader's parser.
//
// So: treat a pass as "no obvious active content", never as "safe". The
// structural defences in the header comment are what actually hold the line,
// and `scripts/moderate.mjs` is what closes the loop when something gets past.
