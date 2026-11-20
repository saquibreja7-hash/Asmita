/**
 * Fake "not found" pages (crawler v3 WP14).
 *
 * Some sites answer every unknown path with a "not found" page and HTTP 200
 * (a soft 404): the frontier keeps scheduling those URLs, and every one of
 * them is fetched, extracted and re-scheduled forever. Within one run and
 * one source the crawler keeps a digest of each fetched HTML body that will
 * not be rendered (whitespace collapsed only), and once one digest has
 * appeared on `SOFT404_THRESHOLD` distinct URLs, every further page with
 * that digest is treated as a soft-404: no images or links are extracted
 * from it and it is reported `error`, so the app backs the row off (and
 * kills it after the usual five failures) — a wrong guess is recoverable.
 * Rendered pages and script-only stubs (app shells: the same HTML on every
 * URL by design) are never judged.
 *
 * The digests live in memory only and are never logged (rule 3). The tracker
 * holds 16-byte hashes only — never a URL, never a body — and is bounded:
 * at most `SOFT404_DIGEST_CAP` digests per source, the least recently used
 * dropped first, so a hostile site churning out endless distinct templates
 * can only revolve the map and delay the cut, never grow it. A killed run
 * loses the whole tracker, which is safe — the app's rows keep their
 * schedules and a later run simply recounts.
 */
import { createHash } from "node:crypto";

/**
 * The same digest must appear on this many distinct URLs of one source
 * before further pages with it are soft-404s (the spec's "5 or more").
 */
export const SOFT404_THRESHOLD = 5;

/**
 * Distinct body digests tracked per source. Beyond it the least recently
 * used digest is dropped and starts counting fresh if it reappears; bounded
 * per-source state in the spirit of the query-variant guard (crawl/traps.ts).
 */
export const SOFT404_DIGEST_CAP = 256;

/** 16 hex chars of sha256: enough key space, never the body itself. */
const hash16 = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * The body digest: whitespace collapsed, nothing else removed (review fix).
 * Digits stay: gallery pages that differ only by a numeric id or an image
 * path such as `/img/photo-12.jpg` are different pages, and stripping
 * digits made them one digest and got them killed. Only bodies identical up
 * to formatting share a digest — the shape of a site that answers every
 * unknown path with the very same "not found" page.
 */
export function soft404Digest(html: string): string {
  return hash16(html.replace(/\s+/g, " ").trim());
}

/**
 * Per-source, per-run soft-404 tracker. `observe` records one fetched HTML
 * page: it returns true — treat this page as a soft-404 — when the digest
 * has already been seen on `threshold` distinct URLs of this source, and
 * false otherwise (first recording the page's URL key against the digest,
 * capped at `threshold` keys: once a digest is flagged, counting more
 * distinct URLs would only spend memory proving what is already known).
 */
export class Soft404Tracker {
  private readonly digests = new Map<string, Set<string>>();

  constructor(
    private readonly threshold: number = SOFT404_THRESHOLD,
    private readonly maxDigests: number = SOFT404_DIGEST_CAP,
  ) {}

  observe(digest: string, urlKey: string): boolean {
    const key = hash16(urlKey);
    let urls = this.digests.get(digest);
    if (urls !== undefined) {
      if (urls.size >= this.threshold) return true;
      // Refresh the LRU position of a digest that is still counting.
      this.digests.delete(digest);
      this.digests.set(digest, urls);
    } else {
      if (this.maxDigests <= 0) return false;
      while (this.digests.size >= this.maxDigests) {
        const oldest = this.digests.keys().next().value;
        if (oldest === undefined) break;
        this.digests.delete(oldest);
      }
      urls = new Set<string>();
      this.digests.set(digest, urls);
    }
    urls.add(key);
    return false;
  }

  get size(): number {
    return this.digests.size;
  }
}
