/**
 * Redirects that live in the page body, not the protocol (crawler v3 WP12):
 *
 *  - `<meta http-equiv="refresh" content="N; url=...">` with a delay of up
 *    to 10 seconds is a redirect. `parseMetaRefresh` finds it with a bounded
 *    scan (no DOM, no new dependency); the fetcher that follows the target
 *    (`net/safe-fetch.ts`, opted in by page fetches) treats it as one more
 *    redirect hop, so the target is re-checked by the address policy, the
 *    caller's scope and robots checks, and the shared redirect budget.
 *  - A "script-only stub" — under 2 KiB of visible text, at least one
 *    `<script>`, no image candidates and no links — is usually a JavaScript
 *    redirect or an app shell. `isScriptOnlyStub` marks it so the crawler
 *    sends the page to the browser in `auto` render mode.
 *
 * A refresh slower than 10 seconds, a refresh without a target (a timed
 * reload of the same page) and a refresh whose target does not parse are
 * page content, not redirects: they are not followed.
 */

/** The longest refresh target examined (a longer content value is ignored). */
const MAX_CONTENT_ATTR = 2048;
/** A refresh slower than this is a timed reload, not a redirect. */
export const MAX_META_REFRESH_DELAY_S = 10;
/** A stub carries less visible text than this (2 KiB). */
export const STUB_VISIBLE_TEXT_LIMIT = 2048;

/** A page "has a script" when its HTML carries a script tag (the WP7 AUTO rule). */
const SCRIPT_TAG = /<script[\s>]/i;

/** `<meta` as a tag open (the next character ends the name). */
const META_OPEN = /<meta[\s/>]/gi;
const HTTP_EQUIV_ATTR = /(?:^|[\s/])http-equiv\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const CONTENT_ATTR = /(?:^|[\s/])content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

export type MetaRefresh = {
  /** The site's declared delay in seconds (negative values read as 0). */
  delaySeconds: number;
  /** The target exactly as the page wrote it; resolved against the page URL by the caller. */
  url: string;
};

/**
 * The first qualifying meta refresh of a document: an `http-equiv="refresh"`
 * meta whose content names an integer delay up to
 * `MAX_META_REFRESH_DELAY_S` and a `url=` target. Returns null when there is
 * none (including a self-refresh without a target, a too-slow refresh, or
 * content too long or malformed to be a redirect). Only the whole tag is
 * examined; the scan is bounded by the HTML byte cap the fetcher already
 * enforced.
 */
export function parseMetaRefresh(rawHtml: string): MetaRefresh | null {
  // Review fix: a refresh inside an HTML comment is no tag at all, and one
  // inside <noscript> is only for browsers without JavaScript (the page the
  // browser actually shows does not redirect). Both are cut before the scan;
  // an unterminated comment hides the rest of the document, as in a browser.
  const html = rawHtml
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<noscript[\s>][\s\S]*?(?:<\/noscript\s*>|$)/gi, " ");
  const open = new RegExp(META_OPEN.source, "gi");
  for (let m = open.exec(html); m !== null; m = open.exec(html)) {
    const at = m.index;
    const end = tagEnd(html, at);
    if (end === -1) return null; // the rest of the document is one unterminated tag
    const tag = html.slice(at, end);
    const equiv = attrValue(tag, HTTP_EQUIV_ATTR);
    if (equiv === null || equiv.trim().toLowerCase() !== "refresh") continue;
    const content = attrValue(tag, CONTENT_ATTR);
    if (content === null) continue;
    const parsed = parseRefreshContent(content);
    if (parsed !== null) return parsed;
  }
  return null;
}

/**
 * The index of the tag's closing `>`, ignoring any `>` inside a quoted
 * attribute value (legal HTML; a refresh target may contain one).
 */
function tagEnd(html: string, at: number): number {
  let quote = "";
  for (let i = at; i < html.length; i++) {
    const c = html[i]!;
    if (quote !== "") {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  return -1;
}

/** One attribute's value of an already-isolated tag, or null when absent. */
function attrValue(tag: string, re: RegExp): string | null {
  const m = re.exec(tag);
  if (m === null) return null;
  const value = m[1] ?? m[2] ?? m[3];
  return value === undefined ? null : value;
}

/**
 * A refresh content value: `N; url=...` (the separator may also be a comma,
 * as old browsers accepted). Anything else — no delay, no target, a delay
 * over the cap — is not a redirect.
 */
function parseRefreshContent(content: string): MetaRefresh | null {
  if (content.length > MAX_CONTENT_ATTR) return null;
  const head = /^([+-]?\d+)([\s;,]*)/.exec(content.trim());
  if (head === null) return null;
  const delay = Math.max(0, Number(head[1]));
  if (delay > MAX_META_REFRESH_DELAY_S) return null;
  const rest = content.trim().slice(head[0].length);
  const url = /^url\s*=\s*/i.exec(rest);
  if (url === null) return null; // a timed reload of the same page, or junk
  // Entities first, then the browser's quote stripping: an attribute value
  // was already entity-decoded when the parser read it.
  let target = decodeEntities(rest.slice(url[0].length).trim());
  if (
    (target.startsWith('"') && target.endsWith('"') && target.length >= 2) ||
    (target.startsWith("'") && target.endsWith("'") && target.length >= 2)
  ) {
    target = target.slice(1, -1).trim();
  }
  if (target === "") return null;
  return { delaySeconds: delay, url: target };
}

/** The few character references a refresh target realistically carries. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(Number(d)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function codePoint(cp: number): string {
  return Number.isInteger(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
}

/**
 * The refresh target of a fetched body, when the fetcher should follow it:
 * only an HTML document (text/html, application/xhtml+xml) can carry one.
 * Returns the raw target string; resolving and policy-checking it are the
 * fetch loop's job, exactly as for a Location header.
 */
export function htmlMetaRefreshTarget(contentType: string, body: Buffer): string | null {
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  if (type !== "text/html" && type !== "application/xhtml+xml") return null;
  const meta = parseMetaRefresh(body.toString("utf8"));
  return meta === null ? null : meta.url;
}

/**
 * Visible text of a document in bytes: script, style and comment content
 * removed, tags stripped, entities decoded, whitespace collapsed. Bounded
 * by the HTML byte cap the fetcher already enforced.
 */
export function visibleTextBytes(html: string): number {
  const text = decodeEntities(
    html
      .replace(/<script[\s>][\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style[\s>][\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return Buffer.byteLength(text, "utf8");
}

/**
 * Whether a page is a tiny script-only stub (crawler v3 WP12): at least one
 * script tag, nothing the static extractor could take (no image candidates,
 * no page links, no feeds) and under 2 KiB of visible text. Such pages are
 * usually JavaScript redirects or app shells, so `auto` sources render them.
 */
export function isScriptOnlyStub(
  html: string,
  extraction: { images: unknown[]; links: unknown[]; feeds: unknown[] },
): boolean {
  return (
    extraction.images.length === 0 &&
    extraction.links.length === 0 &&
    extraction.feeds.length === 0 &&
    SCRIPT_TAG.test(html) &&
    visibleTextBytes(html) < STUB_VISIBLE_TEXT_LIMIT
  );
}
