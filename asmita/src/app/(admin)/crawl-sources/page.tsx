import { listCrawlSources } from "@/lib/crawl-sources";
import { listBlockedCrawlHosts } from "@/lib/crawl-blocked-hosts";
import { crawlerEnabled } from "@/lib/crawler-auth";
import { deniedFor } from "../page-permission";
import { CrawlerOffBanner } from "../findings/CrawlerOffBanner";
import { CrawlerSitesTabs } from "./CrawlerSitesTabs";

export const dynamic = "force-dynamic";

export default async function CrawlSourcesPage() {
  const denied = await deniedFor("crawler:manage");
  if (denied) return denied;
  const [sources, blockedHosts] = await Promise.all([listCrawlSources(), listBlockedCrawlHosts()]);
  const enabled = crawlerEnabled();

  return (
    <section>
      <p className="eyebrow">Console · Crawler</p>
      <h1 className="mt-3">Crawler sites</h1>
      <p className="muted mt-4 max-w-2xl text-sm">
        The public hosts the crawler may visit. It fetches pages only on an approved host and its subdomains, and never
        follows a link off it; images those pages embed may come from other public hosts (such as a CDN). New hosts start
        switched off, and a list can be pasted in. The Never crawl tab holds the hosts that must never be added
        automatically. Every change is recorded.
      </p>
      {!enabled && <CrawlerOffBanner />}
      <div className="mt-6">
        <CrawlerSitesTabs blockedHosts={blockedHosts} crawlerEnabled={enabled} sources={sources} />
      </div>
    </section>
  );
}
