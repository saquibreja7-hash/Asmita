import { authenticateCrawler, crawlerJson } from "@/lib/crawler-auth";
import { buildCrawlPool } from "@/lib/crawl-pool";

// GET /api/crawler/pool: the fingerprints the crawler service may match
// against, under opaque pool ids (src/lib/crawl-pool.ts). Never cached.
export const dynamic = "force-dynamic";

const POOL_REQUESTS_PER_HOUR = 120;

export async function GET(request: Request) {
  const auth = await authenticateCrawler(request, "pool", POOL_REQUESTS_PER_HOUR);
  if (!auth.ok) return auth.response;
  return crawlerJson(await buildCrawlPool());
}
