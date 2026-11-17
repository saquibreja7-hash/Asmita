import { crawlerEnabled } from "@/lib/crawler-auth";
import { getCrawlerStats } from "@/lib/crawl-stats";
import { deniedFor } from "../page-permission";
import { CrawlerOverview } from "./CrawlerOverview";

export const dynamic = "force-dynamic";

// The "Crawler overview" page (crawler v2 WP8): reads only, behind
// findings:review, rendered from the same address-free aggregates as
// GET /api/admin/crawler/stats (src/lib/crawl-stats.ts) — the page calls
// the lib directly, like every admin page, and never fetches. Reads work
// with the crawler switched off.

export default async function CrawlerOverviewPage() {
  const denied = await deniedFor("findings:review");
  if (denied) return denied;
  return <CrawlerOverview crawlerEnabled={crawlerEnabled()} stats={await getCrawlerStats()} />;
}
