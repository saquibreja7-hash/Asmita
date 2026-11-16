/**
 * Static HTML extraction: links to follow and image candidates to hash.
 * No JavaScript is executed; pages that build their content client-side are
 * out of reach by design (see README "Known limits").
 */
import { load } from "cheerio";
import { normalizeUrl, urlKey } from "./url.ts";

export type ExtractLimits = {
  /** Distinct links kept per page; the rest are dropped (counted). */
  maxLinks: number;
  /** Distinct image candidates kept per page; the rest are dropped (counted). */
  maxImages: number;
};

export const DEFAULT_EXTRACT_LIMITS: ExtractLimits = { maxLinks: 500, maxImages: 200 };

export type Extracted = {
  /** Links and images beyond the per-page caps. */
  dropped: { links: number; images: number };
  links: URL[];
  images: URL[];
  /** Meta robots / X-Robots-Tag said nofollow (links were not collected). */
  nofollow: boolean;
  /** Images skipped before fetching, by reason. */
  skipped: { data_uri: number; svg: number; tiny: number; invalid: number };
};

/** Declared width or height below this is treated as an icon/spacer. */
export const MIN_DECLARED_SIDE = 32;

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)$/i;
const LAZY_SRC_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-url", "data-full-src", "data-hi-res-src"];
const LAZY_SRCSET_ATTRS = ["data-srcset", "data-lazy-srcset"];
const META_IMAGE = ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"];

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
  if (!value) return false;
  return value
    .toLowerCase()
    .split(/[\s,]+/)
    .some((t) => t === "nofollow" || t === "none");
}

export function extract(html: string, pageUrl: URL, xRobotsTag = "", limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS): Extracted {
  const $ = load(html);
  const skipped = { data_uri: 0, svg: 0, tiny: 0, invalid: 0 };
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

  $("img").each((_, el) => {
    const img = $(el);
    const w = Number(img.attr("width"));
    const h = Number(img.attr("height"));
    if ((Number.isFinite(w) && w > 0 && w < MIN_DECLARED_SIDE) || (Number.isFinite(h) && h > 0 && h < MIN_DECLARED_SIDE)) {
      skipped.tiny++;
      return;
    }
    // Prefer the largest srcset entry; fall back to src. Lazy-load attributes
    // usually hold the real image while src is a placeholder, so take both.
    const srcset = img.attr("srcset");
    if (srcset) addSrcset(srcset);
    else addImage(img.attr("src"));
    for (const a of LAZY_SRC_ATTRS) addImage(img.attr(a));
    for (const a of LAZY_SRCSET_ATTRS) addSrcset(img.attr(a));
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

  const links = new Map<string, URL>();
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
    if (nofollow || hasNofollow(a.attr("rel"))) return;
    const key = urlKey(url);
    if (links.has(key)) return;
    if (links.size >= limits.maxLinks) {
      dropped.links++;
      return;
    }
    links.set(key, url);
  });

  return { links: [...links.values()], images: [...images.values()], nofollow, skipped, dropped };
}
