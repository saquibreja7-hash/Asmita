/**
 * Static HTML extraction: links to follow, feeds, pagination markers and
 * image candidates to hash.
 * No JavaScript is executed; pages that build their content client-side are
 * out of reach by design (see README "Known limits").
 *
 * Crawler v2 WP4 additions:
 *  - pagination links (rel=next, next/older/page-N text or class) are
 *    collected first, so a link flood cannot push them past the per-page cap;
 *  - RSS/Atom feeds linked from the page become feed candidates;
 *  - more image candidates: CSS background-image in inline styles,
 *    <video poster>, <link rel=image_src>, JSON-LD image, <noscript>
 *    fallbacks, and the full-size href of a thumbnail link
 *    (<a href=*.jpg><img></a> takes the href, not the thumbnail);
 *  - obvious non-content links (login, cart, search, calendar) are skipped
 *    before the cap, so real content fills it.
 */
import { load } from "cheerio";
import { isNonContentUrl } from "./traps.ts";
import { normalizeUrl, urlKey } from "./url.ts";

export type ExtractLimits = {
  /** Distinct links (pages, pagination, feeds) kept per page; the rest are dropped (counted). */
  maxLinks: number;
  /** Distinct image candidates kept per page; the rest are dropped (counted). */
  maxImages: number;
};

export const DEFAULT_EXTRACT_LIMITS: ExtractLimits = { maxLinks: 500, maxImages: 200 };

export type Extracted = {
  /** Links and images beyond the per-page caps. */
  dropped: { links: number; images: number };
  /** Page links, pagination markers first, then document order. */
  links: URL[];
  /** RSS/Atom feed URLs linked from the page (rel=alternate, or .rss/.atom). */
  feeds: URL[];
  /** urlKeys of `links` that are pagination markers (priority; query-cap exempt). */
  pagination: Set<string>;
  images: URL[];
  /** Meta robots / X-Robots-Tag said nofollow (links were not collected). */
  nofollow: boolean;
  /** Images skipped before fetching, by reason. */
  skipped: { data_uri: number; svg: number; tiny: number; invalid: number };
  /** Page/feed links skipped as obvious non-content (login, cart, search, calendar). */
  skippedLinks: { nonContent: number };
  /** JSON-LD / noscript blocks not parsed (oversized or malformed). */
  skippedDocs: { jsonld: number; noscript: number };
};

/** Declared width or height below this is treated as an icon/spacer. */
export const MIN_DECLARED_SIDE = 32;

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)$/i;
const LAZY_SRC_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-url", "data-full-src", "data-hi-res-src"];
const LAZY_SRCSET_ATTRS = ["data-srcset", "data-lazy-srcset"];
const META_IMAGE = ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"];

/** Feed autodiscovery: <link rel="alternate" type="application/atom+xml">. */
const FEED_TYPE = /(?:rss|atom)/i;
/** Anchors straight to a feed file. */
const FEED_EXT = /\.(?:rss|atom)$/i;

/** Anchor text that marks a next/older link ("next", "next page", "older posts", "»"). */
const PAGINATION_TEXT = /^(?:next(?:\s+(?:page|posts?|entries|articles?|results?|stories|show))?|next\s*[›»→>]+|[›»→>]+|older(?:\s+(?:posts?|entries|articles?))?)$/i;
/** Anchor text or class that marks a numbered page ("page 2", "page-2"). */
const PAGINATION_PAGE_N = /^page[\s_-]?\d+$/i;
/** Class token that marks a numbered page ("page-2"). */
const PAGINATION_CLASS_PAGE_N = /^page[-_]?\d+$/i;

/** One JSON-LD block larger than this is not parsed (page-bounded anyway). */
const MAX_JSONLD_CHARS = 256 * 1024;
/** Total <noscript> HTML re-parsed per page (raw-text noscript fallbacks). */
const MAX_NOSCRIPT_REPARSE_CHARS = 512 * 1024;

/** rel tokens, lower-cased, split on whitespace. */
const relTokens = (value: string | undefined): string[] =>
  (value ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t !== "");

/**
 * Pick the largest candidate from a srcset: highest `w` descriptor, else
 * highest `x` density (no descriptor = 1x). Tokenised as the HTML spec does:
 * a URL runs to the next whitespace (a trailing comma ends it), so URLs that
 * contain commas survive.
 */
export function largestFromSrcset(srcset: string): string | null {
  let best: { url: string; score: number } | null = null;
  let i = 0;
  const n = srcset.length;
  const isSpace = (c: string) => /\s/.test(c);
  while (i < n) {
    while (i < n && (isSpace(srcset[i]!) || srcset[i] === ",")) i++;
    if (i >= n) break;
    let j = i;
    while (j < n && !isSpace(srcset[j]!)) j++;
    let url = srcset.slice(i, j);
    i = j;
    let descriptor = "";
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      let depth = 0;
      while (i < n) {
        const c = srcset[i]!;
        if (c === "(") depth++;
        else if (c === ")") depth = Math.max(0, depth - 1);
        else if (c === "," && depth === 0) break;
        descriptor += c;
        i++;
      }
      i++; // skip the comma
    }
    if (url === "") continue;
    const m = /^\s*(\d+(?:\.\d+)?)([wx])\s*$/i.exec(descriptor);
    const value = m ? Number(m[1]) : 1;
    const score = m && m[2]!.toLowerCase() === "w" ? value * 1e6 : value; // any w beats any x
    if (!best || score >= best.score) best = { url, score };
  }
  return best?.url ?? null;
}

function hasNofollow(value: string | undefined): boolean {
  const tokens = relTokens(value);
  return tokens.some((t) => t === "nofollow" || t === "none");
}

/** Whether an anchor (or its rel/text/class) marks it as pagination. */
function marksPagination(rel: string[], text: string, cls: string[]): boolean {
  if (rel.includes("next")) return true;
  if (PAGINATION_TEXT.test(text) || PAGINATION_PAGE_N.test(text)) return true;
  for (const t of cls) {
    if (t === "next" || t.startsWith("next-") || t === "older" || t.startsWith("older-")) return true;
    if (PAGINATION_CLASS_PAGE_N.test(t)) return true;
    if (t === "pagination" || t === "pager" || t === "page-numbers") return true;
  }
  return false;
}

/** Collect the image URLs of one JSON-LD "image"/"images" value. */
function jsonLdImage(value: unknown, addImage: (raw: string) => void): void {
  if (typeof value === "string") {
    addImage(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) jsonLdImage(item, addImage);
    return;
  }
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.url === "string") addImage(o.url);
    if (typeof o.contentUrl === "string") addImage(o.contentUrl);
  }
}

/** Walk a JSON-LD graph (bounded) and collect every image value. */
function walkJsonLd(node: unknown, depth: number, addImage: (raw: string) => void): void {
  if (depth > 6 || node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "image" || key === "images") jsonLdImage(value, addImage);
    else if (value !== null && typeof value === "object") walkJsonLd(value, depth + 1, addImage);
  }
}

/** Every url(...) of a CSS background/background-image declaration. */
function backgroundImageUrls(declaration: string): string[] {
  const out: string[] = [];
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  for (let m = urlRe.exec(declaration); m !== null; m = urlRe.exec(declaration)) out.push(m[2]!);
  return out;
}

export function extract(html: string, pageUrl: URL, xRobotsTag = "", limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS): Extracted {
  const $ = load(html);
  const skipped = { data_uri: 0, svg: 0, tiny: 0, invalid: 0 };
  const skippedDocs = { jsonld: 0, noscript: 0 };
  const dropped = { links: 0, images: 0 };
  // Bounded collections: a hostile page full of links or images cannot grow
  // these beyond the per-page caps.
  const keepImage = (key: string, url: URL) => {
    if (images.has(key)) return;
    if (images.size >= limits.maxImages) {
      dropped.images++;
      return;
    }
    images.set(key, url);
  };

  // <base href> applies to every relative URL in the document.
  let base: URL = pageUrl;
  const baseHref = $("base[href]").first().attr("href");
  if (baseHref) {
    const b = normalizeUrl(baseHref, pageUrl);
    if (b) base = b;
  }

  const metaRobots = $('meta[name="robots" i], meta[name="asmitacrawler" i]')
    .map((_, el) => $(el).attr("content") ?? "")
    .get()
    .join(",");
  const nofollow = hasNofollow(metaRobots) || hasNofollow(xRobotsTag);

  const images = new Map<string, URL>();
  const addImage = (raw: string | undefined) => {
    if (raw === undefined) return;
    const v = raw.trim();
    if (v === "") return;
    if (/^data:/i.test(v)) {
      skipped.data_uri++;
      return;
    }
    const url = normalizeUrl(v, base);
    if (!url) {
      skipped.invalid++;
      return;
    }
    if (/\.svgz?$/i.test(url.pathname)) {
      skipped.svg++;
      return;
    }
    // First occurrence wins: keep the address as the page first wrote it.
    keepImage(urlKey(url), url);
  };
  const addSrcset = (srcset: string | undefined) => {
    if (!srcset) return;
    const best = largestFromSrcset(srcset);
    if (best) addImage(best);
  };

  /**
   * One <img> element's candidates (shared with <noscript> fallbacks):
   * declared size check, the largest srcset entry, src, lazy attributes.
   */
  const collectImgFrom = (attr: (name: string) => string | undefined) => {
    const w = Number(attr("width"));
    const h = Number(attr("height"));
    if ((Number.isFinite(w) && w > 0 && w < MIN_DECLARED_SIDE) || (Number.isFinite(h) && h > 0 && h < MIN_DECLARED_SIDE)) {
      skipped.tiny++;
      return;
    }
    const srcset = attr("srcset");
    if (srcset) addSrcset(srcset);
    else addImage(attr("src"));
    for (const a of LAZY_SRC_ATTRS) addImage(attr(a));
    for (const a of LAZY_SRCSET_ATTRS) addSrcset(attr(a));
  };

  // Thumbnail pairs first (WP4): an anchor straight to an image file takes
  // the href (collected in the anchor loop below); the wrapped <img> is a
  // thumbnail of the same picture and is suppressed.
  const suppressed = new Set<unknown>();
  $("a[href]").each((_, el) => {
    const a = $(el);
    const href = normalizeUrl(a.attr("href")!, base);
    if (href === null || !IMAGE_EXT.test(href.pathname)) return;
    a.find("img").each((__, img) => {
      suppressed.add(img);
    });
  });

  $("img").each((_, el) => {
    if (suppressed.has(el)) return;
    const img = $(el);
    collectImgFrom((name) => img.attr(name));
  });

  $("picture source").each((_, el) => {
    const s = $(el);
    const type = (s.attr("type") ?? "").toLowerCase();
    if (type.includes("svg")) {
      skipped.svg++;
      return;
    }
    addSrcset(s.attr("srcset") ?? s.attr("data-srcset"));
  });

  for (const prop of META_IMAGE) {
    $(`meta[property="${prop}" i], meta[name="${prop}" i]`).each((_, el) => addImage($(el).attr("content")));
  }

  // CSS background-image in inline styles.
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    const declRe = /background(?:-image)?\s*:\s*([^;]+)/gi;
    for (let m = declRe.exec(style); m !== null; m = declRe.exec(style)) {
      for (const u of backgroundImageUrls(m[1]!)) addImage(u);
    }
  });

  // <video poster>.
  $("video[poster]").each((_, el) => addImage($(el).attr("poster")));

  // <noscript> fallbacks. When the parser kept the content as elements the
  // <img> loop above already collected it; only raw-text noscript needs a
  // bounded re-parse.
  let noscriptBudget = MAX_NOSCRIPT_REPARSE_CHARS;
  $("noscript").each((_, el) => {
    const ns = $(el);
    if (ns.find("img").length > 0) return; // already collected above
    const inner = ns.text();
    if (!inner.includes("<img")) return;
    if (inner.length > noscriptBudget) {
      skippedDocs.noscript++;
      return;
    }
    noscriptBudget -= inner.length;
    const frag = load(inner);
    frag("img").each((__, im) => {
      const f = frag(im);
      collectImgFrom((name) => f.attr(name));
    });
  });

  // <link rel="image_src"> and JSON-LD image.
  $("link[rel]").each((_, el) => {
    const l = $(el);
    if (relTokens(l.attr("rel")).includes("image_src")) addImage(l.attr("href"));
  });
  $('script[type="application/ld+json" i]').each((_, el) => {
    const raw = $(el).text();
    if (raw === undefined || raw.trim() === "") return;
    if (raw.length > MAX_JSONLD_CHARS) {
      skippedDocs.jsonld++;
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      skippedDocs.jsonld++;
      return;
    }
    walkJsonLd(parsed, 0, addImage);
  });

  // Links (WP4): pagination markers are collected into their own bounded
  // bucket, so a flood of ordinary links cannot push them past the cap, and
  // assembled FIRST. Every bucket is bounded by maxLinks; the assembly keeps
  // at most maxLinks links in all and counts the overflow as dropped.
  const pagLinks = new Map<string, URL>();
  const pageLinks = new Map<string, URL>();
  const feedLinks = new Map<string, URL>();
  const seenKeys = new Set<string>();
  const keepLink = (map: Map<string, URL>, key: string, url: URL): boolean => {
    if (seenKeys.has(key)) return true;
    if (map.size >= limits.maxLinks) return false;
    seenKeys.add(key);
    map.set(key, url);
    return true;
  };
  const skippedLinks = { nonContent: 0 };
  const addFeed = (url: URL, key: string): void => {
    if (isNonContentUrl(url)) {
      skippedLinks.nonContent++;
      return;
    }
    if (!keepLink(feedLinks, key, url)) dropped.links++;
  };

  $("a[href]").each((_, el) => {
    const a = $(el);
    const href = a.attr("href")!;
    const url = normalizeUrl(href, base);
    if (!url) return;
    if (IMAGE_EXT.test(url.pathname)) {
      // A link straight to an image file is an image candidate, not a page,
      // and fetching it is not "following" the link.
      keepImage(urlKey(url), url);
      return;
    }
    if (hasNofollow(a.attr("rel")) || nofollow) return;
    const key = urlKey(url);
    if (FEED_EXT.test(url.pathname)) {
      addFeed(url, key);
      return;
    }
    if (isNonContentUrl(url)) {
      skippedLinks.nonContent++;
      return;
    }
    if (marksPagination(relTokens(a.attr("rel")), a.text().replace(/\s+/g, " ").trim().toLowerCase(), relTokens(a.attr("class")))) {
      if (!keepLink(pagLinks, key, url)) dropped.links++;
      return;
    }
    if (!keepLink(pageLinks, key, url)) dropped.links++;
  });

  // Feed autodiscovery and rel=next in <head> (only when links may be followed).
  if (!nofollow) {
    $("link[rel]").each((_, el) => {
      const l = $(el);
      const rel = relTokens(l.attr("rel"));
      if (rel.length === 0) return;
      const href = l.attr("href");
      if (href === undefined) return;
      if (rel.includes("nofollow")) return;
      if (rel.includes("next")) {
        const url = normalizeUrl(href, base);
        if (url === null || isNonContentUrl(url)) {
          if (url !== null) skippedLinks.nonContent++;
          return;
        }
        if (!keepLink(pagLinks, urlKey(url), url)) dropped.links++;
        return;
      }
      if (rel.includes("alternate") && FEED_TYPE.test(l.attr("type") ?? "")) {
        const url = normalizeUrl(href, base);
        if (url === null) return;
        addFeed(url, urlKey(url));
      }
    });
  }

  // Pagination first, then page links, then feeds, within maxLinks.
  const pag = [...pagLinks.values()];
  const room = Math.max(0, limits.maxLinks - pag.length);
  const pagesKept = [...pageLinks.values()].slice(0, room);
  const feedsKept = [...feedLinks.values()].slice(0, room - pagesKept.length);
  dropped.links += pageLinks.size - pagesKept.length + (feedLinks.size - feedsKept.length);

  const pagination = new Set<string>(pagLinks.keys());
  return {
    links: [...pag, ...pagesKept],
    feeds: feedsKept,
    pagination,
    images: [...images.values()],
    nofollow,
    skipped,
    dropped,
    skippedLinks,
    skippedDocs,
  };
}
