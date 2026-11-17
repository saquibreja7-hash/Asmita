/**
 * Sitemap and feed documents (crawler v2 WP4): bounded, single-pass parses
 * of XML that is already in memory (the fetcher caps bodies at
 * MAX_HTML_BYTES and never writes a temp file).
 *
 * No DOM and no new dependency: a small event scanner walks the text once
 * and the parsers keep only what they take, capped by a URL count
 * (`maxUrls`), which covers every kind of taken address (page <loc>,
 * child sitemap <loc>, image <image:loc>, feed entry). Two hard bounds
 * hold against a hostile "sitemap":
 *   - the scanner stops after `eventCap(maxUrls)` markup events, so a file
 *     full of nested tags cannot spin or grow state;
 *   - the parsers stop taking URLs at `maxUrls` and set `truncated`.
 *
 * The document kind is sniffed from the root ELEMENT (`<urlset>`,
 * `<sitemapindex>`, `<rss>`, `<feed>`), never trusted from the URL or the
 * Content-Type, so a sitemap served as text/plain parses and a soft-404
 * HTML page served from /sitemap.xml does not.
 */
import { normalizeUrl } from "./url.ts";

export type XmlDocumentKind = "urlset" | "sitemapindex" | "rss" | "atom";

/** The root element sits in the first bytes; a bigger window is not needed. */
const SNIFF_WINDOW = 4096;

/** gzip magic bytes (a sitemap.xml.gz served without Content-Encoding). */
export function isGzipBody(body: Buffer): boolean {
  return body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b;
}

/** The first element name of the document, or null when there is none. */
function rootElement(body: Buffer): string | null {
  const text = body.toString("utf8", 0, Math.min(body.length, SNIFF_WINDOW));
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf("<", i);
    if (lt < 0) return null;
    if (text.startsWith("<?", lt)) {
      const end = text.indexOf("?>", lt);
      if (end < 0) return null;
      i = end + 2;
      continue;
    }
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt);
      if (end < 0) return null;
      i = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", lt)) return null; // a document never starts with CDATA
    if (text.startsWith("<!", lt) || text.startsWith("</", lt)) {
      const end = text.indexOf(">", lt);
      if (end < 0) return null;
      i = end + 1;
      continue;
    }
    const m = /^<([A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?)/.exec(text.slice(lt));
    return m ? m[1]! : null;
  }
  return null;
}

/** Which sitemap/feed shape this body is, judged by its root element only. */
export function sniffXmlDoc(body: Buffer): XmlDocumentKind | null {
  if (isGzipBody(body)) return null; // the caller inflates first
  const root = rootElement(body);
  if (root === null) return null;
  switch (root.toLowerCase()) {
    case "urlset":
      return "urlset";
    case "sitemapindex":
      return "sitemapindex";
    case "rss":
      return "rss";
    case "feed":
      return "atom";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Event scanner
// ---------------------------------------------------------------------------

type Attrs = Record<string, string>;

export type XmlToken =
  | { t: "open"; name: string; attrs: Attrs; selfClose: boolean }
  | { t: "close"; name: string }
  /** `raw` text came from a CDATA section: entities are literal, not decoded. */
  | { t: "text"; text: string; raw: boolean };

/** Markup events per taken URL: generous for real documents, bounded for bombs. */
const EVENTS_PER_URL = 48;
const BASE_EVENT_CAP = 4096;

export function eventCap(maxUrls: number): number {
  return BASE_EVENT_CAP + maxUrls * EVENTS_PER_URL;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** The five XML entities plus numeric ones; anything else is left as written. */
export function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d{1,8}|#x[0-9a-fA-F]{1,6});/g, (whole, name: string) => {
    if (NAMED_ENTITIES[name] !== undefined) return NAMED_ENTITIES[name]!;
    try {
      const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    } catch {
      return whole;
    }
  });
}

const ATTR_RE = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/**
 * Walk the document once, calling `onToken` per event. Returns false when
 * the event cap was hit (the caller treats the document as truncated);
 * `onToken` returning false stops the scan early (a parser that is full;
 * its own `truncated` flag says so). Malformed markup never throws: the
 * scanner skips what it cannot read.
 */
export function scanXml(text: string, onToken: (tok: XmlToken) => boolean, cap: number): boolean {
  let i = 0;
  const n = text.length;
  let events = 0;
  const tick = (): boolean => ++events <= cap;
  while (i < n) {
    const lt = text.indexOf("<", i);
    if (lt < 0) break;
    if (lt > i) {
      const run = text.slice(i, lt);
      if (/\S/.test(run)) {
        if (!tick()) return false;
        if (!onToken({ t: "text", text: run, raw: false })) return true;
      }
    }
    i = lt;
    if (text.startsWith("<?", i)) {
      const end = text.indexOf("?>", i);
      if (end < 0) break;
      i = end + 2;
      continue;
    }
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i);
      if (end < 0) break;
      i = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", i)) {
      const end = text.indexOf("]]>", i);
      const content = text.slice(i + 9, end < 0 ? n : end);
      if (content !== "") {
        if (!tick()) return false;
        if (!onToken({ t: "text", text: content, raw: true })) return true;
      }
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (text.startsWith("<!", i)) {
      const end = text.indexOf(">", i);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    if (text.startsWith("</", i)) {
      const end = text.indexOf(">", i);
      if (end < 0) break;
      if (!tick()) return false;
      if (!onToken({ t: "close", name: text.slice(i + 2, end).trim() })) return true;
      i = end + 1;
      continue;
    }
    // Open tag: find the closing '>' outside quotes, honouring '/'.
    let j = i + 1;
    let quote = "\0";
    while (j < n) {
      const c = text[j]!;
      if (quote === "\0" && (c === '"' || c === "'")) quote = c;
      else if (quote !== "\0" && c === quote) quote = "\0";
      else if (quote === "\0" && c === ">") break;
      j++;
    }
    if (j >= n) break;
    const raw = text.slice(i + 1, j);
    const selfClose = raw.endsWith("/");
    const body = selfClose ? raw.slice(0, -1) : raw;
    const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(body);
    if (nameMatch) {
      const attrs: Attrs = {};
      ATTR_RE.lastIndex = 0;
      for (let m = ATTR_RE.exec(body); m !== null; m = ATTR_RE.exec(body)) {
        attrs[m[1]!] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
      }
      if (!tick()) return false;
      if (!onToken({ t: "open", name: nameMatch[0]!, attrs, selfClose })) return true;
    }
    i = j + 1;
  }
  return true;
}

/** Append one text token to a buffer, entity-decoding plain text only. */
const appendText = (buf: string, tok: XmlToken): string => (tok.t === "text" ? (tok.raw ? tok.text : decodeEntities(tok.text)) : buf);

// ---------------------------------------------------------------------------
// Sitemaps (urlset, sitemapindex) and image sitemap entries
// ---------------------------------------------------------------------------

export type SitemapPage = { loc: URL; images: URL[] };

export type SitemapParse = {
  /** <url><loc> pages of a urlset, with their <image:loc> candidates. */
  pages: SitemapPage[];
  /** <sitemap><loc> children of a sitemap index. */
  children: URL[];
  /** True when the URL cap stopped the parse (summary counter, not an error). */
  truncated: boolean;
};

const lower = (name: string): string => name.toLowerCase();

/**
 * Parse a urlset or a sitemap index. Every taken address (page loc, child
 * sitemap, image) consumes one slot of `maxUrls`, so a hostile document
 * cannot fill the output with images alone; `truncated` reports the cap.
 */
export function parseSitemap(body: Buffer, base: URL, kind: "urlset" | "sitemapindex", maxUrls: number): SitemapParse {
  const out: SitemapParse = { pages: [], children: [], truncated: false };
  let taken = 0;
  let full = false;
  let inUrl = false;
  let inSitemap = false;
  let inLoc = false;
  let inImageLoc = false;
  let locText = "";
  let imageText = "";
  let entryLoc: URL | null = null;
  let entryImages: URL[] = [];

  const take = (): boolean => {
    if (taken < maxUrls) {
      taken++;
      return true;
    }
    full = true;
    return false;
  };

  const complete = scanXml(
    body.toString("utf8"),
    (tok) => {
      if (full) return false;
      if (tok.t === "text") {
        if (inLoc) locText = appendText(locText, tok);
        else if (inImageLoc) imageText = appendText(imageText, tok);
        return true;
      }
      const name = lower(tok.name);
      if (tok.t === "open") {
        switch (name) {
          case "url":
            if (kind === "urlset") {
              inUrl = true;
              entryLoc = null;
              entryImages = [];
              locText = "";
            }
            break;
          case "sitemap":
            if (kind === "sitemapindex") {
              inSitemap = true;
              locText = "";
            }
            break;
          case "loc":
            if (inUrl || inSitemap) {
              inLoc = true;
              locText = "";
            }
            break;
          case "image:loc":
            if (inUrl) {
              inImageLoc = true;
              imageText = "";
            }
            break;
          default:
            break;
        }
        return true;
      }
      switch (name) {
        case "loc":
          inLoc = false;
          break;
        case "image:loc": {
          if (!inImageLoc) break;
          inImageLoc = false;
          const rawImage = imageText.trim();
          if (rawImage !== "" && take()) {
            const image = normalizeUrl(rawImage, base);
            if (image !== null) entryImages.push(image);
          }
          break;
        }
        case "url": {
          if (!inUrl) break;
          inUrl = false;
          const rawLoc = locText.trim();
          if (rawLoc !== "" && take()) {
            const loc = normalizeUrl(rawLoc, base);
            if (loc !== null) entryLoc = loc;
          }
          if (entryLoc !== null) out.pages.push({ loc: entryLoc, images: entryImages });
          entryLoc = null;
          entryImages = [];
          break;
        }
        case "sitemap": {
          if (!inSitemap) break;
          inSitemap = false;
          const rawChild = locText.trim();
          if (rawChild !== "" && take()) {
            const child = normalizeUrl(rawChild, base);
            if (child !== null) out.children.push(child);
          }
          break;
        }
        default:
          break;
      }
      return true;
    },
    eventCap(maxUrls),
  );

  out.truncated = full || !complete;
  return out;
}

// ---------------------------------------------------------------------------
// RSS and Atom feeds
// ---------------------------------------------------------------------------

export type FeedParse = {
  /** The page links of the feed's items/entries. */
  entries: URL[];
  truncated: boolean;
};

/** Parse an RSS 2.0 (<item><link>text</link>) or Atom (<entry><link href>) feed. */
export function parseFeed(body: Buffer, base: URL, kind: "rss" | "atom", maxUrls: number): FeedParse {
  const out: FeedParse = { entries: [], truncated: false };
  let taken = 0;
  let full = false;
  let inItem = false;
  let inLinkText = false;
  let linkText = "";
  let atomLinks: Array<{ href: string; rel: string }> = [];

  const take = (): boolean => {
    if (taken < maxUrls) {
      taken++;
      return true;
    }
    full = true;
    return false;
  };

  const complete = scanXml(
    body.toString("utf8"),
    (tok) => {
      if (full) return false;
      if (tok.t === "text") {
        if (kind === "rss" && inLinkText) linkText = appendText(linkText, tok);
        return true;
      }
      const name = lower(tok.name);
      if (tok.t === "open") {
        switch (name) {
          case "item":
            if (kind === "rss") {
              inItem = true;
              linkText = "";
            }
            break;
          case "entry":
            if (kind === "atom") {
              inItem = true;
              atomLinks = [];
            }
            break;
          case "link":
            if (!inItem) break;
            if (kind === "rss") {
              inLinkText = true;
              linkText = "";
            } else {
              // Atom: <link href="..." rel="alternate"/> (often self-closing).
              atomLinks.push({ href: tok.attrs.href ?? "", rel: (tok.attrs.rel ?? "").toLowerCase() });
            }
            break;
          default:
            break;
        }
        return true;
      }
      switch (name) {
        case "link":
          if (kind === "rss" && inLinkText) inLinkText = false;
          break;
        case "item":
        case "entry": {
          if (!inItem) break;
          inItem = false;
          if (kind === "rss") {
            const rawLink = linkText.trim();
            if (rawLink !== "" && take()) {
              const entry = normalizeUrl(rawLink, base);
              if (entry !== null) out.entries.push(entry);
            }
          } else {
            // rel=alternate wins; else the first link without a rel.
            const chosen =
              atomLinks.find((l) => l.rel === "alternate" && l.href !== "") ?? atomLinks.find((l) => l.rel === "" && l.href !== "");
            if (chosen !== undefined && take()) {
              const entry = normalizeUrl(chosen.href.trim(), base);
              if (entry !== null) out.entries.push(entry);
            }
          }
          break;
        }
        default:
          break;
      }
      return true;
    },
    eventCap(maxUrls),
  );

  out.truncated = full || !complete;
  return out;
}
