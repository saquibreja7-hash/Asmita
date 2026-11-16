import { authenticateCrawler, crawlerJson } from "@/lib/crawler-auth";
import { listEnabledCrawlSources } from "@/lib/crawl-sources";

// GET /api/crawler/sources: the enabled sites the crawler may visit.
export const dynamic = "force-dynamic";

const SOURCE_REQUESTS_PER_HOUR = 120;

export async function GET(request: Request) {
  const auth = await authenticateCrawler(request, "sources", SOURCE_REQUESTS_PER_HOUR);
  if (!auth.ok) return auth.response;
  return crawlerJson({ sources: await listEnabledCrawlSources() });
}
