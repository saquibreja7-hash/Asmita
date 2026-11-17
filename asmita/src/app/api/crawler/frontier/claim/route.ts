import { authenticateCrawler, crawlerJson } from "@/lib/crawler-auth";
import { claimCrawlPages, frontierClaimSchema } from "@/lib/crawl-pages";

// POST /api/crawler/frontier/claim (crawler v2 WP3): the next batch of due
// page URLs for one source, marked claimed for 30 minutes so two crawler
// processes never get the same URL. A source with no rows yet gets its seed
// row (https://<domain>/) first. Nothing here fetches anything; the URLs go
// back to the crawler only, encrypted at rest.
export const dynamic = "force-dynamic";

const CLAIM_REQUESTS_PER_HOUR = 600;
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const auth = await authenticateCrawler(request, "frontier-claim", CLAIM_REQUESTS_PER_HOUR);
  if (!auth.ok) return auth.response;

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return crawlerJson({ error: "payload_too_large" }, 413);
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return crawlerJson({ error: "payload_too_large" }, 413);
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const parsed = frontierClaimSchema.safeParse(json);
  if (!parsed.success) return crawlerJson({ error: "invalid_payload" }, 400);
  const urls = await claimCrawlPages(parsed.data.sourceId, parsed.data.limit);
  // Validators are present only when the page has them (the contract's
  // etag/lastModified are optional, not nullable).
  return crawlerJson({
    urls: urls.map(({ id, url, depth, etag, lastModified }) => ({
      id,
      url,
      depth,
      ...(etag !== null ? { etag } : {}),
      ...(lastModified !== null ? { lastModified } : {}),
    })),
  });
}
